import { Schema, model, models, type Model } from "mongoose";

// A completely new concept for this app — no redirect model or middleware
// existed before the Content & SEO Migration System. Generated (never
// hand-written by this phase) from every old-site URL shape a real
// WordPress/WooCommerce migration needs to preserve: `?p=<ID>` links, the
// real permalink, WooCommerce product/category/tag URLs, and author
// archives. Deliberately scoped to *generating and storing* these mappings
// ("for future 301 redirects," per the task) — wiring live request-time
// redirect serving into src/middleware.ts is a follow-up, not attempted
// here; see ADMIN_CMS.md § Content & SEO Migration System for why.
const RedirectSchema = new Schema(
  {
    fromPath: { type: String, required: true, unique: true, index: true },
    toPath: { type: String, required: true },
    type: {
      type: String,
      enum: ["permalink", "query-id", "product", "category", "tag", "author", "custom"],
      default: "permalink",
    },
    statusCode: { type: Number, default: 301 },
    active: { type: Boolean, default: true },

    sourceSystem: { type: String },
    sourceId: { type: String },
  },
  { timestamps: true }
);

RedirectSchema.index({ sourceSystem: 1, sourceId: 1 });

export const RedirectModel: Model<any> = models.Redirect || model("Redirect", RedirectSchema);
