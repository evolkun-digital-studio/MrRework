import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { BulkProductJobModel } from "@/models/BulkProductJob";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";
import { logActivity } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

// POST — a soft, graceful cancel: sets cancelRequested, checked by the
// engine between batches, same as the media-migration job's cancel route.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { jobId } = await params;
  if (!isValidObjectId(jobId)) return invalidIdResponse();
  await dbConnect();
  const job = await BulkProductJobModel.findById(jobId);
  if (!job) return NextResponse.json({ error: "Bulk job not found." }, { status: 404 });
  if (job.status !== "running" && job.status !== "pending") {
    return NextResponse.json({ error: "Only a pending or running job can be cancelled." }, { status: 400 });
  }

  job.cancelRequested = true;
  await job.save();

  logActivity({
    type: "product_bulk_cancel", adminUserId: String(admin._id), targetType: "BulkProductJob", targetId: String(job._id),
    message: `${admin.email} requested cancellation of an in-progress bulk product update.`,
  });

  return NextResponse.json({ job });
}
