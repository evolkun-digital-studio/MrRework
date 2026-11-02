import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { MediaMigrationJobModel } from "@/models/MediaMigrationJob";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";
import { logActivity } from "@/lib/activityLog";
import { runMediaMigration } from "@/lib/media-migration/engine";

export const dynamic = "force-dynamic";

// POST — kicks off the actual downloads and returns immediately.
// runMediaMigration() is un-awaited and claims the job atomically on its
// own first line, so a second concurrent call here is a safe no-op rather
// than a race — the same fix already applied to the Import Engine.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const job = await MediaMigrationJobModel.findById(id).lean<any>();
  if (!job) return NextResponse.json({ error: "Media migration job not found." }, { status: 404 });
  if (job.status !== "pending") {
    return NextResponse.json({ error: `Cannot start a job with status "${job.status}".` }, { status: 400 });
  }

  logActivity({
    type: "media_migration_run", adminUserId: String(admin._id), targetType: "MediaMigrationJob", targetId: id,
    message: `${admin.email} started downloading media (${job.expected?.distinctUrls ?? 0} distinct URLs expected).`,
  });

  runMediaMigration(id).catch((err) => {
    console.error("[media-migration] runMediaMigration failed:", err);
  });

  return NextResponse.json({ status: "running" }, { status: 202 });
}
