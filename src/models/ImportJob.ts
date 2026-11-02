import { Schema, model, models, type Model } from "mongoose";

// One record per import attempt, from the moment a file is uploaded through
// to the final report. This single document doubles as both the wizard's
// server-side state (while status is uploaded/mapped/validated/importing)
// and an Import History row (once status is completed/failed/cancelled) —
// deliberately one model instead of two, since a finished job is just a
// job whose fields are all filled in, not a different kind of object.
const ImportJobSchema = new Schema(
  {
    // Matches a key in the import-export registry (src/lib/import-export/registry.ts).
    // Only "products" has a real implementation today; the field is a plain
    // string (not an enum) so future importers can register without a migration.
    type: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["uploaded", "mapped", "validated", "importing", "completed", "failed", "cancelled"],
      default: "uploaded",
      index: true,
    },

    fileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    // Path under the non-public storage/imports/ directory — never public/,
    // since these are raw data exports, not assets meant to be served.
    filePath: { type: String, required: true },

    totalRows: { type: Number, default: 0 },
    detectedColumns: { type: [String], default: [] },

    // CSV column name -> target field key (e.g. { "Name": "name", "Regular price": "regularPrice" }).
    columnMapping: { type: Schema.Types.Mixed, default: {} },
    duplicateStrategy: { type: String, enum: ["update", "skip"], default: "update" },

    // Snapshot computed once at upload time (Step 3 of the wizard) so
    // re-opening the wizard doesn't require re-reading the file from disk.
    preview: { type: Schema.Types.Mixed, default: null },
    // Computed at Step 5 (validation pass) — missing columns, invalid rows, etc.
    validation: { type: Schema.Types.Mixed, default: null },

    progress: {
      currentRow: { type: Number, default: 0 },
      imported: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      startedAt: { type: Date },
      estimatedRemainingMs: { type: Number },
      bytesRead: { type: Number, default: 0 },
      bytesTotal: { type: Number, default: 0 },
      rowsProcessed: { type: Number, default: 0 },
      statementsParsed: { type: Number, default: 0 },
      tablesFound: { type: [String], default: [] },
      percentComplete: { type: Number, default: 0 },
      currentPhase: { type: String, default: "uploaded" },
      error: { type: String },
    },

    report: {
      imported: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      durationMs: { type: Number },
      // Sampled via process.memoryUsage().heapUsed at each batch flush during
      // the run (see engine.ts) — the high-water mark, not a live gauge.
      peakMemoryBytes: { type: Number },
      warnings: { type: [String], default: [] },
      // Capped list (see engine.ts) so a run with thousands of failures
      // can't grow this document without bound — full detail is still
      // derivable by re-running validation.
      errors: { type: [Schema.Types.Mixed], default: [] },
      // Grouped failure counts computed over the FULL failure set, not just
      // the capped `errors` list above — e.g. "1,003 rows: parent product
      // failed to import" stays accurate even when `errors` itself only has
      // the first 500 line items. See engine.ts's recordErrorSummary.
      errorSummary: { type: [Schema.Types.Mixed], default: [] },
      // Rollback-prep only (see RowResult.snapshot in types.ts): the fields
      // each "updated" row overwrote, captured right before the write.
      // Nothing reads this today — it exists so a future rollback feature
      // has what it needs without a schema migration. Same cap as errors.
      updateSnapshots: { type: [Schema.Types.Mixed], default: [] },
    },

    // Checked between batches by the engine so an admin can abort a
    // long-running import without needing to kill the server process.
    cancelRequested: { type: Boolean, default: false },

    adminUser: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

ImportJobSchema.index({ createdAt: -1 });

export const ImportJobModel: Model<any> = models.ImportJob || model("ImportJob", ImportJobSchema);
