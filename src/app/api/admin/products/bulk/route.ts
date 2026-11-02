import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ProductModel } from "@/models/Product";
import { BulkProductJobModel } from "@/models/BulkProductJob";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { buildProductFilter } from "@/lib/adminProductFilter";
import { runBulkProductJob } from "@/lib/bulk-products/engine";

export const dynamic = "force-dynamic";

// A pathological request (e.g. a mistyped filter matching the whole
// catalog) shouldn't be allowed to spin up a job of unbounded size.
const MAX_PRODUCTS_PER_JOB = 20000;

// POST — creates a BulkProductJob and starts it immediately (fire-and-forget,
// same pattern as media-migration's run route: runBulkProductJob() is
// un-awaited and claims the job atomically on its own first line, so this
// route just has to return fast with a jobId for the client to poll).
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const { productIds, filters, updates } = body as { productIds?: string[]; filters?: Record<string, unknown>; updates?: unknown };
  if (!updates || typeof updates !== "object" || Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates specified." }, { status: 400 });
  }
  if (productIds && filters) {
    return NextResponse.json({ error: "Provide either productIds or filters, not both." }, { status: 400 });
  }

  await dbConnect();

  // Materialize the exact ID list once, right now — the job never
  // re-evaluates `filters` mid-run, so what the admin previewed/confirmed
  // is exactly what gets touched, with no drift from products created or
  // edited while the job is running.
  let resolvedIds: string[];
  if (filters) {
    const filter = buildProductFilter(filters);
    const docs = await ProductModel.find(filter).select("_id").limit(MAX_PRODUCTS_PER_JOB + 1).lean<{ _id: unknown }[]>();
    resolvedIds = docs.map((d) => String(d._id));
  } else if (Array.isArray(productIds) && productIds.length) {
    resolvedIds = productIds.map(String);
  } else {
    return NextResponse.json({ error: "No products specified." }, { status: 400 });
  }

  if (resolvedIds.length === 0) return NextResponse.json({ error: "No products match." }, { status: 400 });
  if (resolvedIds.length > MAX_PRODUCTS_PER_JOB) {
    return NextResponse.json({ error: `Too many products for one job (max ${MAX_PRODUCTS_PER_JOB}).` }, { status: 400 });
  }

  const job = await BulkProductJobModel.create({
    adminUser: admin._id,
    kind: "bulk-update",
    status: "pending",
    productIds: resolvedIds,
    updates,
    filtersUsed: filters ?? null,
    progress: { total: resolvedIds.length, processed: 0, succeeded: 0, failed: 0, currentBatch: 0 },
  });

  logActivity({
    type: "product_bulk_update", adminUserId: String(admin._id), targetType: "BulkProductJob", targetId: String(job._id),
    message: `${admin.email} started a bulk update on ${resolvedIds.length} product(s).`,
    meta: updates,
  });

  runBulkProductJob(String(job._id)).catch((err) => {
    console.error("[bulk-products] runBulkProductJob failed:", err);
  });

  return NextResponse.json({ jobId: job._id, total: resolvedIds.length }, { status: 202 });
}
