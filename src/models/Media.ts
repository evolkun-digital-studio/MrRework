import { Schema, model, models, type Model } from "mongoose";

// Backs the Admin Media Library — a flat asset registry that Products, the
// Blog, and Categories/Collections can all point their image fields at
// (they store the resulting URL string directly, same as they already do
// for every other image field; nothing about those schemas changes).
const MediaSchema = new Schema(
  {
    filename: { type: String, required: true },
    url: { type: String, required: true },
    folder: { type: String, default: "uploads", index: true },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },

    // Added for the Media Migration Manager — all optional so every
    // existing Media document (and the plain browser-upload route, which
    // never sets these) stays perfectly valid. originalUrl/hash are the two
    // dedup keys: originalUrl is checked before downloading (cheap), hash
    // (SHA-256 of the actual bytes) is checked after, since two different
    // URLs can point at byte-identical files.
    originalUrl: { type: String, index: true, sparse: true },
    originalFilename: { type: String },
    altText: { type: String, default: "" },
    title: { type: String, default: "" },
    caption: { type: String, default: "" },
    description: { type: String, default: "" },
    width: { type: Number },
    height: { type: Number },
    hash: { type: String, index: true, sparse: true },
    sourceSystem: { type: String }, // e.g. "woocommerce"
  },
  { timestamps: true }
);

// Supports the paginated GET /api/admin/media list, which always sorts by
// createdAt descending — same pattern MediaMigrationJobSchema already uses
// for its own list query.
MediaSchema.index({ createdAt: -1 });

export const MediaModel: Model<any> = models.Media || model("Media", MediaSchema);
