import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { BulkProductJobModel } from "@/models/BulkProductJob";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

// GET — the progress-polling endpoint used while status is "running", same
// role as the media-migration job GET route. `snapshot` is deliberately
// excluded from the response (it's not needed by the polling UI and can be
// large) — only `snapshotTruncated` (whether Undo will be available) is
// returned.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { jobId } = await params;
  if (!isValidObjectId(jobId)) return invalidIdResponse();
  await dbConnect();
  const job = await BulkProductJobModel.findById(jobId).select("-snapshot").lean();
  if (!job) return NextResponse.json({ error: "Bulk job not found." }, { status: 404 });

  return NextResponse.json({ job });
}
