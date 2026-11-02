import { Schema, model, models, type Model } from "mongoose";

// One document per Media Migration Manager run. Same shape philosophy as
// ImportJob (job/progress/report) and MigrationCheckpoint (pre-write
// checkpoint + rollback-prep record), but tracked separately since the
// fields genuinely differ (bytes downloaded, download speed, per-format
// breakdown — nothing a CSV import job tracks). Created before the first
// download of a run (the checkpoint), then updated in place as it runs.
const MediaMigrationJobSchema = new Schema(
  {
    adminUser: { type: Schema.Types.ObjectId, ref: "User" },
    sources: { type: [String], default: [] }, // e.g. ["product", "category"] — which registry entries were included

    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    startedAt: { type: Date },
    cancelRequested: { type: Boolean, default: false },

    configuration: {
      maxConcurrency: { type: Number, default: 5 },
      maxFileSizeBytes: { type: Number, default: 15 * 1024 * 1024 },
    },

    // Filled in at creation from the read-only /scan pass — nothing here is
    // recomputed once the run starts.
    expected: {
      totalReferences: { type: Number, default: 0 },
      distinctUrls: { type: Number, default: 0 },
    },

    progress: {
      processed: { type: Number, default: 0 },
      downloaded: { type: Number, default: 0 },
      reused: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      duplicates: { type: Number, default: 0 },
      currentUrl: { type: String, default: "" },
      bytesDownloaded: { type: Number, default: 0 },
      estimatedRemainingMs: { type: Number },
    },

    report: {
      downloaded: { type: Number, default: 0 },
      reused: { type: Number, default: 0 },
      duplicates: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      brokenUrls: { type: Number, default: 0 },
      unsupportedFormats: { type: Number, default: 0 },
      totalBytes: { type: Number, default: 0 },
      avgDownloadSpeedBytesPerSec: { type: Number, default: 0 },
      durationMs: { type: Number },
      errors: { type: [{ url: String, message: String, _id: false }], default: [] },
      warnings: { type: [String], default: [] },
    },

    // The "record every created/updated document so rollback can be added
    // later" requirement — this phase only records it, no rollback action exists.
    rollbackPrep: {
      downloadedMediaIds: { type: [{ mediaId: String, url: String, _id: false }], default: [] },
      updatedProductIds: { type: [String], default: [] },
      updatedCategoryIds: { type: [String], default: [] },
    },
  },
  { timestamps: true }
);

MediaMigrationJobSchema.index({ createdAt: -1 });

export const MediaMigrationJobModel: Model<any> =
  models.MediaMigrationJob || model("MediaMigrationJob", MediaMigrationJobSchema);
