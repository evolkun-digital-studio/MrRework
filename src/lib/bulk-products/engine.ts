import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { ProductModel } from "@/models/Product";
import { BulkProductJobModel } from "@/models/BulkProductJob";
import { duplicateProduct } from "@/lib/duplicateProduct";

// Mirrors the Media Migration Engine's shape (atomic job claim, batched
// processing, per-item error isolation, capped error list, progress
// persisted after each batch) — see src/lib/media-migration/engine.ts.
// Unlike that engine (network-I/O-bound, needed a concurrency-limited
// worker pool), this is DB-bound: batches are applied via one
// `updateMany()`/`bulkWrite()` call each instead of one write per document.

const MAX_STORED_ERRORS = 300;
const MAX_SNAPSHOT_ITEMS = 2000;
const BATCH_SIZE = 200;

type NumericMode =
  | { mode: "set"; value: number }
  | { mode: "increasePct" | "decreasePct"; value: number }
  | { mode: "increase" | "decrease"; value: number }
  | { mode: "outOfStock" }
  | { mode: "apply"; value: number }
  | { mode: "remove" };

export interface BulkProductUpdates {
  status?: "published" | "draft";
  isFeatured?: boolean;
  isTrending?: boolean;
  isBestSeller?: boolean;
  archived?: boolean;
  price?: { mode: "set" | "increasePct" | "decreasePct"; value: number };
  discount?: { mode: "apply"; value: number } | { mode: "remove" };
  stock?: { mode: "set" | "increase" | "decrease"; value: number } | { mode: "outOfStock" };
  category?: { mode: "set"; value: string };
  collection?: { mode: "set"; value: string };
  brand?: { mode: "set"; value: string };
  tags?: { mode: "add" | "remove"; values: string[] };
  // Moves products between the Wholesale (stored as "shop") and Retail
  // catalogs in bulk — the same isolated-by-productType split
  // productTypeFilter() enforces storefront-side (src/lib/search.ts).
  productType?: { mode: "set"; value: "shop" | "retail" };
  duplicate?: boolean;
  delete?: boolean;
}

// Fields a snapshot needs to cover, per top-level update key touched — kept
// narrow (only what's actually being changed) rather than snapshotting
// whole documents, to stay well under Mongo's 16MB job-document cap even
// before MAX_SNAPSHOT_ITEMS kicks in.
function snapshotFieldsFor(updates: BulkProductUpdates): string[] {
  const fields = new Set<string>();
  if (updates.status !== undefined) fields.add("status");
  if (updates.isFeatured !== undefined) fields.add("isFeatured");
  if (updates.isTrending !== undefined) fields.add("isTrending");
  if (updates.isBestSeller !== undefined) fields.add("isBestSeller");
  if (updates.archived !== undefined) fields.add("archived");
  if (updates.price) fields.add("price");
  if (updates.discount) fields.add("compareAtPrice");
  if (updates.stock) { fields.add("stock"); fields.add("inStock"); }
  if (updates.category) fields.add("category");
  if (updates.collection) fields.add("collection");
  if (updates.brand) fields.add("brand");
  if (updates.tags) fields.add("tags");
  if (updates.productType) fields.add("productType");
  return [...fields];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Applies every field present in `updates` to the given batch of product
 * IDs. Simple field sets go through one `updateMany($set)`; relative
 * numeric changes (percent/±N) use MongoDB's aggregation-pipeline
 * `updateMany` form (array update, MongoDB ≥4.2 / Mongoose 8.x — both
 * confirmed available here) so the whole batch is computed server-side in
 * one round trip instead of a read-then-write per document.
 */
async function applyUpdatesToBatch(batchIds: string[], updates: BulkProductUpdates): Promise<number> {
  const filter = { _id: { $in: batchIds } };
  let affected = 0;

  // --- simple $set fields (one combined updateMany) ---
  const setDoc: Record<string, unknown> = {};
  if (updates.status !== undefined) setDoc.status = updates.status;
  if (updates.isFeatured !== undefined) setDoc.isFeatured = updates.isFeatured;
  if (updates.isTrending !== undefined) setDoc.isTrending = updates.isTrending;
  if (updates.isBestSeller !== undefined) setDoc.isBestSeller = updates.isBestSeller;
  if (updates.archived !== undefined) setDoc.archived = updates.archived;
  if (updates.category?.mode === "set") setDoc.category = updates.category.value;
  if (updates.collection?.mode === "set") setDoc.collection = updates.collection.value;
  if (updates.brand?.mode === "set") setDoc.brand = updates.brand.value;
  if (updates.productType?.mode === "set") setDoc.productType = updates.productType.value;
  if (updates.price?.mode === "set") setDoc.price = updates.price.value;
  if (updates.stock) {
    if (updates.stock.mode === "set") setDoc.stock = updates.stock.value;
    if (updates.stock.mode === "outOfStock") { setDoc.stock = 0; setDoc.inStock = false; }
  }
  if (updates.discount?.mode === "remove") {
    const r = await ProductModel.updateMany(filter, { $unset: { compareAtPrice: "" } });
    affected = Math.max(affected, r.matchedCount ?? 0);
  }
  if (Object.keys(setDoc).length) {
    const r = await ProductModel.updateMany(filter, { $set: setDoc });
    affected = Math.max(affected, r.matchedCount ?? 0);
  }

  // --- relative numeric changes (pipeline updateMany) ---
  if (updates.price?.mode === "increasePct" || updates.price?.mode === "decreasePct") {
    const factor = updates.price.mode === "increasePct" ? 1 + updates.price.value / 100 : 1 - updates.price.value / 100;
    const r = await ProductModel.updateMany(filter, [
      { $set: { price: { $round: [{ $multiply: ["$price", factor] }, 2] } } },
    ]);
    affected = Math.max(affected, r.matchedCount ?? 0);
  }
  if (updates.stock && (updates.stock.mode === "increase" || updates.stock.mode === "decrease")) {
    const delta = updates.stock.mode === "increase" ? updates.stock.value : -updates.stock.value;
    const r = await ProductModel.updateMany(filter, [
      { $set: { stock: { $max: [0, { $add: [{ $ifNull: ["$stock", 0] }, delta] }] } } },
    ]);
    affected = Math.max(affected, r.matchedCount ?? 0);
  }
  if (updates.discount?.mode === "apply") {
    // compareAtPrice becomes the *original* (higher) price implied by the
    // requested discount off the current price — e.g. price=80, 20% off
    // implies compareAtPrice=100 — matching how the storefront already
    // renders compareAtPrice as a strikethrough "was" price.
    const pct = updates.discount.value;
    const r = await ProductModel.updateMany(filter, [
      { $set: { compareAtPrice: { $round: [{ $divide: ["$price", 1 - pct / 100] }, 2] } } },
    ]);
    affected = Math.max(affected, r.matchedCount ?? 0);
  }

  // --- tags ---
  if (updates.tags?.mode === "add") {
    const r = await ProductModel.updateMany(filter, { $addToSet: { tags: { $each: updates.tags.values } } });
    affected = Math.max(affected, r.matchedCount ?? 0);
  }
  if (updates.tags?.mode === "remove") {
    const r = await ProductModel.updateMany(filter, { $pullAll: { tags: updates.tags.values } });
    affected = Math.max(affected, r.matchedCount ?? 0);
  }

  return affected || batchIds.length;
}

// Restores each product's pre-change field values from the original job's
// `snapshot`. Inherently per-document (every product's `before` differs),
// unlike the batch `updateMany` path above — but bounded by
// MAX_SNAPSHOT_ITEMS, so a plain sequential loop with periodic progress
// flushes is simple and fast enough; no worker pool needed.
async function runUndoJob(job: any): Promise<void> {
  const original = await BulkProductJobModel.findById(job.undoOfJobId).select("snapshot snapshotTruncated status").lean<any>();
  if (!original || original.snapshotTruncated || !original.snapshot?.length) {
    job.status = "failed";
    job.report = { summary: "Nothing to undo — the original job has no usable snapshot.", errors: [] };
    await job.save();
    return;
  }

  const snapshot: { productId: string; before: Record<string, unknown> }[] = original.snapshot;
  const startedAt = job.startedAt.getTime();
  const errors: { productId: string; message: string }[] = [];
  let processed = 0, succeeded = 0, failed = 0;
  let cancelled = false;

  async function flushProgress() {
    const elapsed = Date.now() - startedAt;
    const msPerItem = processed > 0 ? elapsed / processed : 0;
    const remaining = Math.max(0, snapshot.length - processed);
    await BulkProductJobModel.updateOne(
      { _id: job._id },
      { $set: { progress: { total: snapshot.length, processed, succeeded, failed, currentBatch: processed, estimatedRemainingMs: msPerItem > 0 ? Math.round(remaining * msPerItem) : undefined } } }
    );
  }

  for (const entry of snapshot) {
    if (cancelled) break;
    try {
      await ProductModel.updateOne({ _id: entry.productId }, { $set: entry.before });
      succeeded++;
    } catch (err) {
      failed++;
      if (errors.length < MAX_STORED_ERRORS) errors.push({ productId: entry.productId, message: err instanceof Error ? err.message : "Restore failed." });
    }
    processed++;
    if (processed % PROGRESS_FLUSH_EVERY === 0 || processed === snapshot.length) {
      await flushProgress();
      const fresh = await BulkProductJobModel.findById(job._id).select("cancelRequested").lean<{ cancelRequested?: boolean }>();
      if (fresh?.cancelRequested) cancelled = true;
    }
  }

  job.status = cancelled ? "cancelled" : "completed";
  job.report = { summary: `Restored ${succeeded} of ${snapshot.length} product(s) to their pre-edit values.`, errors };
  await job.save();

  if (!cancelled && failed === 0) {
    await BulkProductJobModel.updateOne({ _id: job.undoOfJobId }, { $set: { undoneAt: new Date() } });
  }
}

const PROGRESS_FLUSH_EVERY = 20;

export async function runBulkProductJob(jobId: string): Promise<void> {
  await dbConnect();

  // Atomic claim — identical race-prevention as the media-migration engine:
  // a duplicate concurrent trigger call becomes a safe no-op.
  const job = await BulkProductJobModel.findOneAndUpdate(
    { _id: jobId, status: "pending" },
    { $set: { status: "running", startedAt: new Date() } },
    { new: true }
  );
  if (!job) return;

  if (job.kind === "undo") {
    await runUndoJob(job);
    return;
  }

  const startedAt = job.startedAt.getTime();
  const productIds: string[] = job.productIds ?? [];
  const updates: BulkProductUpdates = job.updates ?? {};
  const batches = chunk(productIds, BATCH_SIZE);

  const errors: { productId: string; message: string }[] = [];
  const snapshot: { productId: string; before: Record<string, unknown> }[] = [];
  let snapshotTruncated = false;
  const snapFields = snapshotFieldsFor(updates);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let cancelled = false;

  async function flushProgress(currentBatch: number) {
    const elapsed = Date.now() - startedAt;
    const msPerItem = processed > 0 ? elapsed / processed : 0;
    const remaining = Math.max(0, productIds.length - processed);
    await BulkProductJobModel.updateOne(
      { _id: job._id },
      {
        $set: {
          progress: {
            total: productIds.length, processed, succeeded, failed, currentBatch,
            estimatedRemainingMs: msPerItem > 0 ? Math.round(remaining * msPerItem) : undefined,
          },
        },
      }
    );
  }

  try {
    for (let b = 0; b < batches.length; b++) {
      if (cancelled) break;
      const batch = batches[b];

      // Snapshot (only the touched fields, only up to the cap) before this
      // batch's writes land.
      if (snapFields.length && !snapshotTruncated) {
        if (snapshot.length + batch.length > MAX_SNAPSHOT_ITEMS) {
          snapshotTruncated = true;
        } else {
          const projection: Record<string, 1> = { _id: 1 };
          for (const f of snapFields) projection[f] = 1;
          const before = await ProductModel.find({ _id: { $in: batch } }, projection).lean<any[]>();
          for (const doc of before) {
            const { _id, ...rest } = doc;
            snapshot.push({ productId: String(_id), before: rest });
          }
        }
      }

      try {
        if (updates.delete) {
          const r = await ProductModel.deleteMany({ _id: { $in: batch } });
          succeeded += r.deletedCount ?? 0;
        } else if (updates.duplicate) {
          for (const id of batch) {
            try {
              const result = await duplicateProduct(id);
              if (result) succeeded++;
              else { failed++; if (errors.length < MAX_STORED_ERRORS) errors.push({ productId: id, message: "Product not found." }); }
            } catch (err) {
              failed++;
              if (errors.length < MAX_STORED_ERRORS) errors.push({ productId: id, message: err instanceof Error ? err.message : "Duplicate failed." });
            }
          }
        } else {
          const affected = await applyUpdatesToBatch(batch, updates);
          succeeded += affected;
        }
      } catch (err) {
        // A whole-batch failure (e.g. a bad pipeline expression) shouldn't
        // silently vanish — mark every product in this batch failed and
        // keep going with the next batch.
        failed += batch.length;
        const message = err instanceof Error ? err.message : "Batch update failed.";
        for (const id of batch) {
          if (errors.length < MAX_STORED_ERRORS) errors.push({ productId: id, message });
        }
      }

      processed += batch.length;
      await flushProgress(b + 1);

      const fresh = await BulkProductJobModel.findById(job._id).select("cancelRequested").lean<{ cancelRequested?: boolean }>();
      if (fresh?.cancelRequested) cancelled = true;
    }

    const durationMs = Date.now() - startedAt;
    job.status = cancelled ? "cancelled" : "completed";
    job.report = {
      summary: `${succeeded} succeeded, ${failed} failed out of ${productIds.length} product(s) in ${Math.round(durationMs / 1000)}s.`,
      errors,
    };
    job.snapshot = snapshot;
    job.snapshotTruncated = snapshotTruncated;
    await job.save();
  } catch (err) {
    job.status = "failed";
    job.report = {
      summary: err instanceof Error ? err.message : "The bulk job stopped unexpectedly.",
      errors,
    };
    await job.save();
  }
}
