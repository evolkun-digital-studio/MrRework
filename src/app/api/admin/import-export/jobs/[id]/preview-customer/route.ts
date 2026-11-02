import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/errorMonitoring";
import { dbConnect } from "@/lib/mongodb";
import { ImportJobModel } from "@/models/ImportJob";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";
import { previewCustomers } from "@/lib/import-export/customers/wooCustomerPreview";

export const dynamic = "force-dynamic";

// POST — "how will every customer in this file actually look?" SQL -> merged
// row -> mapped fields -> the exact document a real import would create,
// for every customer at once (capped) — the customer counterpart of
// /preview-product, generalized to a list since the Customer Migration
// Assistant's Preview and Duplicate Resolution sections need to browse and
// cross-reference the whole set, not look up one record at a time.
// Read-only: previewCustomers() only ever calls UserModel.find(), never
// create/save/updateOne.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const job = await ImportJobModel.findById(id).lean<any>();
  if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  if (job.type !== "customers") {
    return NextResponse.json({ error: `Customer preview only supports the Customers import type (job type "${job.type}").` }, { status: 400 });
  }

  try {
    const result = await previewCustomers(job.filePath, job.columnMapping ?? {});
    return NextResponse.json({ result });
  } catch (err) {
    captureError(err, { route: "src/app/api/admin/import-export/jobs/[id]/preview-customer/route.ts" });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Preview failed." }, { status: 500 });
  }
}
