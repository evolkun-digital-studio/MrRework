import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ImportJobModel } from "@/models/ImportJob";
import { MigrationCheckpointModel } from "@/models/MigrationCheckpoint";
import { ProductModel } from "@/models/Product";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { streamRows } from "@/lib/import-export/csv";
import { mapRow } from "@/lib/import-export/products/wooProductImporter";

export const dynamic = "force-dynamic";

// GET — checkpoint history (not surfaced in the UI yet, but available for a
// future rollback feature to list against).
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.min(50, Number(req.nextUrl.searchParams.get("limit")) || 10);

  const [items, total] = await Promise.all([
    MigrationCheckpointModel.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("adminUser", "email firstName lastName").lean(),
    MigrationCheckpointModel.countDocuments(),
  ]);

  return NextResponse.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
}

// POST — the migration checkpoint / backup record. Called by the migration
// page immediately before it calls the existing POST .../run route, i.e.
// strictly before the first database write of the migration. Writes only
// ever land in the MigrationCheckpoint collection here — never Product or
// Category. Never deletes anything.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { jobId, duplicateStrategy, riskOverridden, expectedProducts, expectedCategoriesCreated, expectedVariations, expectedImages, riskLevel, riskScore, unsupportedFields } = body ?? {};
  if (!jobId) return NextResponse.json({ error: "jobId is required." }, { status: 400 });

  await dbConnect();
  const job = await ImportJobModel.findById(jobId).lean<any>();
  if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });

  // One lightweight, read-only pass to snapshot which SKUs already exist —
  // reused by finalize() to classify created-vs-updated. Reuses the real
  // mapRow() (unmodified) so this reflects exactly how the actual import
  // will interpret each row's SKU, rather than a second ad hoc parse.
  const fileSkus = new Set<string>();
  for await (const raw of streamRows(job.filePath)) {
    const mapped = mapRow(raw, job.columnMapping ?? {});
    if (mapped.type !== "variation" && mapped.sku) fileSkus.add(mapped.sku.trim());
  }
  const existing = fileSkus.size
    ? await ProductModel.find({ sku: { $in: [...fileSkus] } }).select("sku").lean<{ sku: string }[]>()
    : [];

  const checkpoint = await MigrationCheckpointModel.create({
    importJob: job._id,
    adminUser: admin._id,
    fileName: job.fileName,
    importType: job.type,
    configuration: { columnMapping: job.columnMapping ?? {}, duplicateStrategy: duplicateStrategy ?? "update" },
    riskOverridden: !!riskOverridden,
    status: "running",
    startedAt: new Date(),
    preMigration: {
      expectedProducts: expectedProducts ?? 0,
      expectedCategoriesCreated: expectedCategoriesCreated ?? 0,
      expectedVariations: expectedVariations ?? 0,
      expectedImages: expectedImages ?? 0,
      riskLevel, riskScore,
      existingSkus: existing.map((p) => p.sku),
      unsupportedFields: Array.isArray(unsupportedFields) ? unsupportedFields.slice(0, 100) : [],
    },
  });

  logActivity({
    type: "migration_checkpoint_created", adminUserId: String(admin._id), targetType: "MigrationCheckpoint", targetId: String(checkpoint._id),
    message: `${admin.email} started a product migration checkpoint for "${job.fileName}"${riskOverridden ? " (High Risk override)" : ""}.`,
    meta: { jobId: String(job._id), riskLevel, riskOverridden: !!riskOverridden },
  });

  return NextResponse.json({ checkpoint }, { status: 201 });
}
