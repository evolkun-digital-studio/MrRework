import { NextRequest, NextResponse } from "next/server";
import { rm } from "fs/promises";
import path from "path";
import { dbConnect } from "@/lib/mongodb";
import { ImportJobModel } from "@/models/ImportJob";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

// A job "importing" with no progress update in this long very likely means
// the server process died mid-run (crash, restart, deploy) rather than a
// genuinely slow file — engine.ts writes `progress` after every 25-row
// batch, so even a large import should update well inside this window.
const STALE_IMPORTING_MS = 10 * 60 * 1000;

// GET — also the progress-polling endpoint the wizard's Run/Report steps
// call every ~1.5s while status is "importing". No push/socket layer exists
// anywhere in this app; polling matches the pattern already used everywhere
// else (dashboard, cart sync). Also flags a job that looks stuck, so the UI
// can tell an admin "this appears to have stopped" instead of polling forever.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const job = await ImportJobModel.findById(id).populate("adminUser", "email firstName lastName").lean<any>();
  if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });

  const stale = job.status === "importing" && Date.now() - new Date(job.updatedAt).getTime() > STALE_IMPORTING_MS;

  return NextResponse.json({ job, stale });
}

// DELETE — cancel (if currently running) or remove (if not yet run) a job.
// Finished jobs (completed/failed/cancelled) are kept as Import History and
// cannot be deleted here, preserving the audit trail.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const job = await ImportJobModel.findById(id);
  if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });

  if (job.status === "importing") {
    const stale = Date.now() - new Date(job.updatedAt).getTime() > STALE_IMPORTING_MS;
    if (stale) {
      // cancelRequested is only ever observed by a live runImportJob() loop
      // checking it between batches — if the process that was running this
      // import crashed, nothing will ever read that flag, and the job would
      // stay "importing" forever. Recover it directly instead.
      job.status = "failed";
      job.report = {
        imported: job.progress?.imported ?? 0, updated: job.progress?.updated ?? 0,
        skipped: job.progress?.skipped ?? 0, failed: job.progress?.failed ?? 0,
        warnings: [`Marked as failed by ${admin.email} after showing no progress for over ${Math.round(STALE_IMPORTING_MS / 60000)} minutes — likely an interrupted server process. Rows already written before the interruption were not rolled back; verify Product/Category counts directly if unsure.`],
        errors: [],
      };
      await job.save();
      logActivity({
        type: "import_stale_recovered", adminUserId: String(admin._id), targetType: "ImportJob", targetId: String(job._id),
        message: `${admin.email} recovered a stuck import ("${job.fileName}") that had stopped updating.`,
      });
      return NextResponse.json({ job });
    }
    job.cancelRequested = true;
    await job.save();
    logActivity({ type: "import_cancel", adminUserId: String(admin._id), targetType: "ImportJob", targetId: String(job._id), message: `${admin.email} requested cancellation of an in-progress import.` });
    return NextResponse.json({ job });
  }

  if (["completed", "failed", "cancelled"].includes(job.status)) {
    return NextResponse.json({ error: "Finished imports are kept as history and cannot be deleted." }, { status: 400 });
  }

  await rm(path.dirname(job.filePath), { recursive: true, force: true });
  await job.deleteOne();
  logActivity({ type: "import_delete", adminUserId: String(admin._id), targetType: "ImportJob", targetId: id, message: `${admin.email} deleted an unfinished import ("${job.fileName}").` });

  return NextResponse.json({ ok: true });
}
