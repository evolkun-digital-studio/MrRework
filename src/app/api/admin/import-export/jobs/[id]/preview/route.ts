import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";
import { ImportJobModel } from "@/models/ImportJob";
import { prepareImportPreview } from "@/lib/import-export/preparePreview";
import { captureError } from "@/lib/errorMonitoring";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const job = await ImportJobModel.findById(id).select("preview progress.currentPhase").lean<any>();
  if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  if (job.preview || job.progress?.currentPhase === "completed") return NextResponse.json({ job }, { status: 200 });

  prepareImportPreview(id).catch(async (error) => {
    captureError(error, { context: "prepareImportPreview", jobId: id });
    await ImportJobModel.updateOne({ _id: id, preview: null }, { $set: {
      "progress.currentPhase": "failed",
      "progress.error": error instanceof Error ? error.message : "Could not parse this file.",
    } }).catch(() => {});
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
