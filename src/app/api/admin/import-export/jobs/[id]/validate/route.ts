import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ImportJobModel } from "@/models/ImportJob";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";
import { validateImportJob } from "@/lib/import-export/engine";
import { logActivity } from "@/lib/activityLog";
import { captureError } from "@/lib/errorMonitoring";

export const dynamic = "force-dynamic";

// POST — Step 5 (Validation): streams the file through the registered
// importer's validateRow() for every row without writing anything to the
// database, then stores the aggregate result on the job.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const job = await ImportJobModel.findById(id).lean<any>();
  if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  if (!["uploaded", "mapped", "validated"].includes(job.status)) {
    return NextResponse.json({ error: `Cannot validate a job with status "${job.status}".` }, { status: 400 });
  }

  try {
    const validation = await validateImportJob(id);
    logActivity({
      type: "import_validated", adminUserId: String(admin._id), targetType: "ImportJob", targetId: id,
      message: `${admin.email} validated "${job.fileName}": ${validation.errorCount} error(s), ${validation.warningCount} warning(s).`,
      meta: { errorCount: validation.errorCount, warningCount: validation.warningCount, duplicateCount: validation.duplicateCount },
    });
    return NextResponse.json({ validation });
  } catch (err) {
    captureError(err, { context: "validateImportJob", jobId: id });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Validation failed." }, { status: 400 });
  }
}
