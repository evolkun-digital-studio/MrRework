import { Schema, model, models, type Model } from "mongoose";

// One document per bulk product operation. Same shape philosophy as
// MediaMigrationJob (status/progress/report/cancelRequested, atomic claim,
// batched progress) — see src/lib/bulk-products/engine.ts for the runner.
// Unlike media migration (network-I/O-bound, per-URL worker pool), this is
// DB-bound and processes in `Product.updateMany()`-sized batches instead.
const BulkProductJobSchema = new Schema(
  {
    adminUser: { type: Schema.Types.ObjectId, ref: "User" },
    // "undo" jobs restore `snapshot.before` values instead of applying
    // `updates` — see the `undoOfJobId` link below.
    kind: { type: String, enum: ["bulk-update", "undo"], default: "bulk-update" },

    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    startedAt: { type: Date },
    cancelRequested: { type: Boolean, default: false },

    // Materialized once at request time (either the exact IDs the admin
    // selected, or the result of running `filtersUsed` through
    // buildProductFilter() a single time) — the job never re-evaluates a
    // filter mid-run, so the "N products affected" preview shown before
    // confirming always matches exactly what the job touches.
    productIds: { type: [String], default: [] },
    updates: { type: Schema.Types.Mixed },
    filtersUsed: { type: Schema.Types.Mixed },

    progress: {
      total: { type: Number, default: 0 },
      processed: { type: Number, default: 0 },
      succeeded: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      currentBatch: { type: Number, default: 0 },
      estimatedRemainingMs: { type: Number },
    },

    report: {
      summary: { type: String, default: "" },
      errors: { type: [{ productId: String, message: String, _id: false }], default: [] },
    },

    // Undo support (Phase 3) — pre-change values for the fields this job
    // touched, capped at MAX_SNAPSHOT_ITEMS (src/lib/bulk-products/engine.ts)
    // to stay well clear of MongoDB's 16MB document limit on very large
    // jobs; snapshotTruncated is an explicit, permanent "can't undo this
    // one" flag, not a best-effort partial undo.
    snapshot: { type: [{ productId: String, before: Schema.Types.Mixed, _id: false }], default: [] },
    snapshotTruncated: { type: Boolean, default: false },
    undoOfJobId: { type: String },
    undoneAt: { type: Date },
  },
  { timestamps: true }
);

BulkProductJobSchema.index({ createdAt: -1 });

export const BulkProductJobModel: Model<any> =
  models.BulkProductJob || model("BulkProductJob", BulkProductJobSchema);
