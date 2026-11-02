import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { MediaMigrationJobModel } from "@/models/MediaMigrationJob";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";
import { logActivity } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

// POST — a soft, graceful cancel: sets cancelRequested, checked by the
// worker pool between items (in practice, within a few in-flight downloads
// of the request landing), mirroring the Import Engine's cancel behavior.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const job = await MediaMigrationJobModel.findById(id);
  if (!job) return NextResponse.json({ error: "Media migration job not found." }, { status: 404 });
  if (job.status !== "running") return NextResponse.json({ error: "Only a running job can be cancelled." }, { status: 400 });

  job.cancelRequested = true;
  await job.save();

  logActivity({
    type: "media_migration_cancel", adminUserId: String(admin._id), targetType: "MediaMigrationJob", targetId: String(job._id),
    message: `${admin.email} requested cancellation of an in-progress media migration.`,
  });

  return NextResponse.json({ job });
}
