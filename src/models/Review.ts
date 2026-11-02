import { Schema, model, models, type Model } from "mongoose";

const ReviewSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", index: true },
    author: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    title: { type: String },
    body: { type: String },
    verified: { type: Boolean, default: false },
    // How `verified` above was determined — informational, never read by any
    // authorization/display logic. "order-confirmed" means an imported Order
    // actually proved this customer bought this product; "source-flag" means
    // WooCommerce's own `verified` commentmeta was trusted as-is because no
    // matching order could be found (see ADMIN_CMS.md § Order Verification).
    verifiedSource: { type: String, enum: ["order-confirmed", "source-flag"] },

    // Reviewer identity — additive. `author` (above) remains the display
    // name for both guest and linked reviewers, unchanged. A guest review
    // (no matching User account) still keeps its own email; `user` stays
    // unset in that case, mirroring Order.isGuestOrder's pattern exactly.
    user: { type: Schema.Types.ObjectId, ref: "User" },
    email: { type: String },
    isGuestReview: { type: Boolean, default: false },

    // Original WordPress/WooCommerce identity, for idempotent re-import and
    // traceability — mirrors User.sourceSystem/sourceId, Order.sourceSystem/sourceId.
    sourceSystem: { type: String },
    sourceId: { type: String },
    // The raw WordPress `comment_approved` value ("1" | "0" | "spam" | "trash")
    // this review's `status` was normalized from — see ADMIN_CMS.md § Review
    // Status Mapping. Unset for reviews created organically in this app.
    wooStatus: { type: String },
    // Best-effort — WordPress core has no comment-edit-timestamp column;
    // only populated when the source dump's commentmeta happens to carry one.
    editedAt: { type: Date },
    adminReplyDate: { type: Date },
    // Best-effort "was this review helpful" vote counts — no single standard
    // WooCommerce/plugin meta key convention, detected by pattern (see
    // wooReviewSqlSource.ts), so these are absent far more often than present.
    helpfulYes: { type: Number },
    helpfulNo: { type: Number },

    // Admin moderation — not wired to any storefront review-listing display
    // yet (individual reviews aren't rendered on the product page), but
    // `status` IS live-synced into `Product.rating`/`reviewCount` on every
    // moderation action and on import (see src/lib/reviews.ts).
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "approved", index: true },
    adminReply: { type: String, default: "" },
    featured: { type: Boolean, default: false },
    // Admin-curated lifestyle photo for the homepage "Happy Customers"
    // section (src/components/HappyCustomersSection.tsx) — distinct from
    // any product image; falls back to the linked product's own primary
    // image when unset. Irrelevant to the PDP/moderation flow above.
    photo: { type: String, default: "" },
  },
  { timestamps: true }
);

ReviewSchema.index({ sourceSystem: 1, sourceId: 1 });

export const ReviewModel: Model<any> = models.Review || model("Review", ReviewSchema);
