import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { MigrationCheckpointModel } from "@/models/MigrationCheckpoint";
import { ProductModel } from "@/models/Product";
import { CategoryModel } from "@/models/Category";
import { ImportJobModel } from "@/models/ImportJob";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";

// Post-migration health score (0-100) — distinct from the pre-migration
// Compatibility Analysis score, which only predicts. This one grades what
// actually happened: failed rows are the heaviest deduction (a failure is a
// row nothing was written for at all), warnings are a light deduction (data
// still landed, just imperfectly), and a count-mismatch verdict from the
// reconciliation below is a flat deduction since it means the run produced
// fewer documents than the pre-migration floor expected.
function computeReadinessScore(opts: { totalRows: number; failed: number; warningCount: number; validationStatus: "successful" | "requires-attention" }): number {
  const failureRate = opts.totalRows > 0 ? opts.failed / opts.totalRows : 0;
  let score = 100;
  score -= Math.min(50, Math.round(failureRate * 100));
  score -= Math.min(20, opts.warningCount * 2);
  if (opts.validationStatus === "requires-attention") score -= 15;
  return Math.max(0, Math.min(100, score));
}

export const dynamic = "force-dynamic";

// POST — post-migration validation. Entirely read-only against Product and
// Category (only the MigrationCheckpoint document itself is written).
//
// Reconciliation strategy: rather than threading document IDs out through
// the import engine (which would mean editing engine.ts/wooProductImporter.ts,
// explicitly off-limits this phase), "which products did this migration
// touch" is answered by comparing Product.updatedAt against the
// checkpoint's [startedAt, now] window — Mongoose's `timestamps: true`
// reliably bumps `updatedAt` on every create *and* save the unmodified
// importer performs. "Created vs. updated" is then answered using the
// pre-migration SKU snapshot taken in POST /checkpoints (checkpoint.
// preMigration.existingSkus), **not** Product.createdAt: this collection
// has a genuine pre-existing bug where `createdAt` is never set on new
// documents at all, because the schema's own `isNew` field (a business
// flag, "new arrival") collides with Mongoose's internal Document.isNew
// bookkeeping property, which the timestamps plugin depends on to decide
// whether to stamp createdAt. Discovered while building this route;
// documented in ADMIN_CMS.md rather than fixed here, since fixing it means
// editing the Product model, which this phase reuses as-is. `updatedAt`
// itself is unaffected and remains reliable.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  await dbConnect();
  const checkpoint = await MigrationCheckpointModel.findById(id);
  if (!checkpoint) return NextResponse.json({ error: "Migration checkpoint not found." }, { status: 404 });

  const startedAt: Date = checkpoint.startedAt;
  const completedAt = new Date();
  const existingSkuSet = new Set<string>((checkpoint.preMigration?.existingSkus ?? []).map((s: string) => s.toLowerCase()));

  const [touchedProducts, createdCategories, allCategories, job] = await Promise.all([
    ProductModel.find({ updatedAt: { $gte: startedAt, $lte: completedAt } })
      .select("_id sku updatedAt variants images status category")
      .lean<{ _id: unknown; sku: string; updatedAt: Date; variants?: unknown[]; images?: string[]; status?: string; category?: string }[]>(),
    CategoryModel.find({ createdAt: { $gte: startedAt, $lte: completedAt } })
      .select("_id name slug")
      .lean<{ _id: unknown; name: string; slug: string }[]>(),
    CategoryModel.find().select("slug").lean<{ slug: string }[]>(),
    ImportJobModel.findById(checkpoint.importJob).select("totalRows report").lean<{ totalRows?: number; report?: { skipped?: number; failed?: number; durationMs?: number; peakMemoryBytes?: number; warnings?: string[]; errors?: unknown[] } }>(),
  ]);

  const createdProducts: { sku: string; productId: string }[] = [];
  const updatedProducts: { sku: string; productId: string }[] = [];
  let actualVariations = 0;
  let actualImages = 0;
  let actualProductsDraft = 0;
  const touchedCategorySlugs = new Set<string>();

  for (const p of touchedProducts) {
    const entry = { sku: p.sku, productId: String(p._id) };
    if (existingSkuSet.has((p.sku ?? "").toLowerCase())) updatedProducts.push(entry);
    else createdProducts.push(entry);
    actualVariations += p.variants?.length ?? 0;
    actualImages += p.images?.length ?? 0;
    if (p.status === "draft") actualProductsDraft++;
    if (p.category) touchedCategorySlugs.add(p.category);
  }

  const actualProductsCreated = createdProducts.length;
  const actualProductsUpdated = updatedProducts.length;
  const actualCategoriesCreated = createdCategories.length;
  // Categories referenced by touched products that already existed before
  // this run touched them (found-or-created by slug during import — see
  // wooProductImporter.ts's ensureCategory) rather than newly created.
  const createdSlugSet = new Set(createdCategories.map((c) => c.slug));
  const existingSlugSet = new Set(allCategories.map((c) => c.slug));
  const actualCategoriesReused = [...touchedCategorySlugs].filter((s) => existingSlugSet.has(s) && !createdSlugSet.has(s)).length;

  const actualProductsSkipped = job?.report?.skipped ?? 0;
  const timeTakenMs = completedAt.getTime() - startedAt.getTime();
  const rowsPerSecond =
    job?.report?.durationMs && job.report.durationMs > 0 && job?.totalRows
      ? Math.round((job.totalRows / job.report.durationMs) * 1000 * 100) / 100
      : null;

  // "Expected" counts (see MigrationApprovalCard / migrate/page.tsx) are
  // computed pre-migration from the Compatibility Analysis as a
  // conservative floor — rows with genuinely blocking issues are excluded,
  // but a handful of the real importer's row-level behaviors are more
  // lenient than that floor assumes (e.g. a *missing* price — as opposed to
  // an *invalid* one — resolves to price: 0 rather than failing; an orphan
  // variation is counted in "expected variation rows" but can never
  // actually attach). So actual is expected to land at-or-above the floor,
  // not exactly on it — "below expected" is the meaningful signal that
  // something went wrong, not "different from expected."
  const pre = checkpoint.preMigration ?? {};
  const productCountMatch = actualProductsCreated + actualProductsUpdated >= (pre.expectedProducts ?? 0);
  const categoryCountMatch = actualCategoriesCreated >= (pre.expectedCategoriesCreated ?? 0);
  // expectedVariations (sent by migrate/page.tsx) is already the file's
  // variation rows minus orphans/missing-parent rows — i.e. only variations
  // that could legitimately attach — so this is a real floor, not a guess.
  const variationCountMatch = actualVariations >= (pre.expectedVariations ?? 0);
  const imageCountMatch = actualImages <= (pre.expectedImages ?? 0);

  const allMatch = productCountMatch && categoryCountMatch && variationCountMatch;
  const status: "successful" | "requires-attention" = allMatch ? "successful" : "requires-attention";

  const readinessScore = computeReadinessScore({
    totalRows: job?.totalRows ?? actualProductsCreated + actualProductsUpdated + actualProductsSkipped,
    failed: job?.report?.failed ?? 0,
    warningCount: job?.report?.warnings?.length ?? 0,
    validationStatus: status,
  });

  checkpoint.status = "completed";
  checkpoint.postMigration = {
    actualProductsCreated, actualProductsUpdated, actualProductsSkipped, actualProductsDraft,
    actualCategoriesCreated, actualCategoriesReused, actualVariations, actualImages,
    createdProducts, updatedProducts,
    createdCategories: createdCategories.map((c) => ({ name: c.name, categoryId: String(c._id) })),
    validation: { productCountMatch, categoryCountMatch, variationCountMatch, imageCountMatch, status },
    warnings: job?.report?.warnings ?? [],
    errors: job?.report?.errors ?? [],
    timeTakenMs,
    peakMemoryBytes: job?.report?.peakMemoryBytes,
    rowsPerSecond,
    readinessScore,
    finalizedAt: completedAt,
  };
  await checkpoint.save();

  logActivity({
    type: "migration_finalized", adminUserId: String(admin._id), targetType: "MigrationCheckpoint", targetId: String(checkpoint._id),
    message: `${admin.email}'s product migration finished: ${status} (${actualProductsCreated} created, ${actualProductsUpdated} updated, ${actualCategoriesCreated} categories created, readiness ${readinessScore}/100).`,
    meta: { status, actualProductsCreated, actualProductsUpdated, actualProductsSkipped, actualCategoriesCreated, actualVariations, actualImages, readinessScore },
  });

  return NextResponse.json({ checkpoint });
}
