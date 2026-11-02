import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ImportJobModel } from "@/models/ImportJob";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";
import { previewProduct } from "@/lib/import-export/products/migrationAssistant";

export const dynamic = "force-dynamic";

// POST — "how will this one product actually look?" CSV -> mapped fields ->
// the exact document a real import would create. Read-only: streams the
// job's stored file until it finds the requested SKU (or the first valid
// row if none given) and builds the document with the same pure logic the
// real importer uses, without ever calling ProductModel.create/save.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  const body = await req.json().catch(() => ({}));
  const sku = typeof body?.sku === "string" ? body.sku : undefined;

  await dbConnect();
  const job = await ImportJobModel.findById(id).lean<any>();
  if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  if (job.type !== "products") {
    return NextResponse.json({ error: `The Migration Assistant only supports Products today (job type "${job.type}").` }, { status: 400 });
  }

  const preview = await previewProduct(job.filePath, job.columnMapping ?? {}, sku);
  if (!preview.found) return NextResponse.json({ error: sku ? `No product row found with SKU "${sku}".` : "No valid product row found in this file." }, { status: 404 });

  return NextResponse.json({ preview });
}
