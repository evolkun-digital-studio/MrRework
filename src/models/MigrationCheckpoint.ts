import { Schema, model, models, type Model } from "mongoose";

// One document per approved migration run — created immediately before the
// first database write (see POST /api/admin/import-export/checkpoints,
// called right before the existing /run route), and filled in afterward by
// POST .../checkpoints/[id]/finalize's read-only reconciliation.
//
// This is deliberately a "backup" record, not a snapshot of the database:
// it never touches existing Products/Categories, and rollback itself isn't
// implemented yet — createdProducts/updatedProducts/createdCategories exist
// so a future rollback feature has exactly what it needs (real document
// IDs, not just counts) without this phase having to build rollback logic.
const MigrationCheckpointSchema = new Schema(
  {
    importJob: { type: Schema.Types.ObjectId, ref: "ImportJob", required: true, index: true },
    adminUser: { type: Schema.Types.ObjectId, ref: "User" },
    fileName: { type: String, required: true },
    importType: { type: String, required: true, default: "products" },

    configuration: {
      columnMapping: { type: Schema.Types.Mixed, default: {} },
      duplicateStrategy: { type: String, enum: ["update", "skip"], default: "update" },
    },

    // True when the admin proceeded despite a High Risk assessment —
    // preserved on the record as an explicit acknowledgement, not just a
    // UI-only checkbox that leaves no trace.
    riskOverridden: { type: Boolean, default: false },

    status: { type: String, enum: ["running", "completed", "failed"], default: "running", index: true },
    startedAt: { type: Date, required: true },

    // Carried straight through from the already-computed Compatibility
    // Analysis / Migration Assistant reports at approval time — no new
    // analysis happens here.
    preMigration: {
      expectedProducts: { type: Number, default: 0 },
      expectedCategoriesCreated: { type: Number, default: 0 },
      expectedVariations: { type: Number, default: 0 },
      expectedImages: { type: Number, default: 0 },
      riskLevel: { type: String },
      riskScore: { type: Number },
      // SKUs from the file that already existed in Product at checkpoint
      // time, captured with one lightweight read-only pass right before the
      // run. finalize() uses this — not createdAt — to tell "created" apart
      // from "updated": Product.isNew (a real schema field, "new arrival")
      // collides with Mongoose's own internal Document.isNew bookkeeping,
      // which silently prevents createdAt from ever being set on this
      // collection. Pre-existing, unrelated to this phase's code — see
      // ADMIN_CMS.md for the full note — worked around here rather than
      // fixed, since fixing it means touching the Product model.
      existingSkus: { type: [String], default: [] },
      // Carried straight through from the Compatibility Analysis's
      // "Unsupported Fields" section (already computed, never re-derived
      // here) so the final post-migration report can list them too —
      // otherwise that information only ever lived in ephemeral React state.
      unsupportedFields: { type: [{ field: String, reason: String, _id: false }], default: [] },
    },

    // Filled in by finalize() via read-only reconciliation against
    // Product/Category updatedAt/createdAt timestamps in the
    // [startedAt, completedAt] window — see finalize/route.ts.
    postMigration: {
      actualProductsCreated: { type: Number },
      actualProductsUpdated: { type: Number },
      actualProductsSkipped: { type: Number },
      actualProductsDraft: { type: Number },
      actualCategoriesCreated: { type: Number },
      actualCategoriesReused: { type: Number },
      actualVariations: { type: Number },
      actualImages: { type: Number },
      createdProducts: [{ sku: String, productId: String, _id: false }],
      updatedProducts: [{ sku: String, productId: String, _id: false }],
      createdCategories: [{ name: String, categoryId: String, _id: false }],
      validation: {
        productCountMatch: Boolean,
        categoryCountMatch: Boolean,
        variationCountMatch: Boolean,
        imageCountMatch: Boolean,
        status: { type: String, enum: ["successful", "requires-attention"] },
      },
      // Pulled straight from the ImportJob's own report (engine.ts) rather
      // than recomputed — this route never re-runs or re-validates anything.
      warnings: { type: [String], default: [] },
      errors: { type: [Schema.Types.Mixed], default: [] },
      timeTakenMs: { type: Number },
      peakMemoryBytes: { type: Number },
      rowsPerSecond: { type: Number },
      // Post-migration health score (0-100) — distinct from the pre-migration
      // Compatibility Analysis score: this one reflects what actually
      // happened (failures, warnings, count mismatches), not a prediction.
      readinessScore: { type: Number },
      finalizedAt: Date,
    },
  },
  { timestamps: true }
);

MigrationCheckpointSchema.index({ createdAt: -1 });

export const MigrationCheckpointModel: Model<any> =
  models.MigrationCheckpoint || model("MigrationCheckpoint", MigrationCheckpointSchema);
