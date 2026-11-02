import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { BulkProductJobModel } from "@/models/BulkProductJob";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";
import { logActivity } from "@/lib/activityLog";
import { runBulkProductJob } from "@/lib/bulk-products/engine";

export const dynamic = "force-dynamic";

// POST — creates and starts an "undo" job for a completed bulk-update job,
// restoring every affected product's pre-change field values from that
// job's snapshot. One-time revert, not a multi-level undo stack: this
// route refuses if the target job was truncated (too large to have
// captured a snapshot at all) or has already been undone.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { jobId } = await params;
  if (!isValidObjectId(jobId)) return invalidIdResponse();
  await dbConnect();

  const original = await BulkProductJobModel.findById(jobId).lean<any>();
  if (!original) return NextResponse.json({ error: "Bulk job not found." }, { status: 404 });
  if (original.kind !== "bulk-update") return NextResponse.json({ error: "Only a bulk-update job can be undone." }, { status: 400 });
  if (original.status !== "completed") return NextResponse.json({ error: "Only a completed job can be undone." }, { status: 400 });
  if (original.snapshotTruncated) return NextResponse.json({ error: "Too large to undo — no snapshot was captured for this job." }, { status: 400 });
  if (original.undoneAt) return NextResponse.json({ error: "This job has already been undone." }, { status: 400 });
  if (!original.snapshot?.length) return NextResponse.json({ error: "Nothing to undo — this job made no snapshotted changes." }, { status: 400 });

  const undoJob = await BulkProductJobModel.create({
    adminUser: admin._id,
    kind: "undo",
    status: "pending",
    undoOfJobId: String(original._id),
    productIds: original.snapshot.map((s: any) => s.productId),
    progress: { total: original.snapshot.length, processed: 0, succeeded: 0, failed: 0 },
  });

  logActivity({
    type: "product_bulk_undo", adminUserId: String(admin._id), targetType: "BulkProductJob", targetId: String(undoJob._id),
    message: `${admin.email} started undoing bulk update ${jobId} (${original.snapshot.length} product(s)).`,
  });

  runBulkProductJob(String(undoJob._id)).catch((err) => {
    console.error("[bulk-products] undo job failed:", err);
  });

  return NextResponse.json({ jobId: undoJob._id }, { status: 202 });
}
