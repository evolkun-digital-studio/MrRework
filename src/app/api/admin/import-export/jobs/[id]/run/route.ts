import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ImportJobModel } from "@/models/ImportJob";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";
import { logActivity } from "@/lib/activityLog";
import { runImportJob } from "@/lib/import-export/engine";
import { captureError } from "@/lib/errorMonitoring";

export const dynamic = "force-dynamic";

// POST — Step 6 (Import): kicks off the actual run and returns immediately.
// runImportJob() is intentionally NOT awaited — it keeps running on the Node
// process after this response is sent (the same fire-and-forget shape as
// logActivity()), updating the job's `progress` field after every batch.
// The wizard polls GET /jobs/[id] to render the live progress bar. This
// only survives on a persistent `next start` process, not a serverless
// function that gets torn down after the response — see DEPLOYMENT.md.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const job = await ImportJobModel.findById(id).lean<any>();
  if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  if (job.status !== "validated") {
    return NextResponse.json({ error: `Run the validation step before importing (current status: "${job.status}").` }, { status: 400 });
  }

  logActivity({
    type: "import_run", adminUserId: String(admin._id), targetType: "ImportJob", targetId: id,
    message: `${admin.email} started a ${job.type} import ("${job.fileName}", ${job.totalRows} rows).`,
  });

  runImportJob(id).catch((err) => {
    captureError(err, { context: "runImportJob", jobId: id });
  });

  return NextResponse.json({ status: "importing" }, { status: 202 });
}
