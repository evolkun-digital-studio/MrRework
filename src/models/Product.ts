import { Schema, model, models, type Model } from "mongoose";

// size/color/stock/sku are the original fields — every existing consumer
// (cart stock lookup, order stock decrement, admin inventory adjustment,
// the admin Product Form) matches variants by size+color and must keep
// working unchanged. regularPrice/salePrice/effectivePrice/attributes are
// additive: a variant with none of them set behaves exactly as before
// (falls back to the parent's price, same as pre-existing hand-created
// products always have). See ADMIN_CMS.md's Variable Product Pricing
// section for the resolution algorithm.
const VariantSchema = new Schema(
  {
    size: String, color: String, stock: { type: Number, default: 0 }, sku: String,
    regularPrice: Number,
    salePrice: Number,
    // Always the price this variant actually sells for (salePrice when it's
    // a genuine discount, otherwise regularPrice) — precomputed at import
    // time so nothing downstream has to re-derive it.
    effectivePrice: Number,
    // Every WooCommerce attribute for this specific variation, generic —
    // not just Color/Size (e.g. { quantity: "10" }, { material: "Wool", fit: "Slim" }).
    attributes: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const ProductSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    sku: { type: String, required: true, unique: true, index: true },
    description: { type: String, default: "" },
    materials: { type: String, default: "" },
    category: { type: String, index: true },
    collection: { type: String, index: true },
    gender: { type: String, enum: ["men", "women", "unisex"], default: "unisex", index: true },
    price: { type: Number, required: true, index: true },
    compareAtPrice: { type: Number },
    // Set only for variable products whose variants span more than one
    // price — the highest effectivePrice among them, so the storefront can
    // show "From £X" (price = lowest) instead of a single flat number.
    // Absent/equal to price means there's no range to show.
    priceMax: { type: Number },
    currency: { type: String, default: "GBP" },
    images: { type: [String], default: [] },
    hoverImage: { type: String },
    colors: { type: [String], default: [], index: true },
    sizes: { type: [String], default: [] },
    variants: { type: [VariantSchema], default: [] },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    salesCount: { type: Number, default: 0 },
    tags: { type: [String], default: [], index: true },
    isNew: { type: Boolean, default: false },
    isLimited: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    // isFeatured is a distinct, separately-curated flag — unrelated to the
    // " Bestsellers" homepage rail, which queries independently
    // of any stored flag (see getFeatured() in src/lib/data.ts).
    isFeatured: { type: Boolean, default: false },
    // Backs the "Best Selling" homepage card's Pre-Order badge and
    // countdown pill (src/components/BestSellingSection.tsx) — the
    // countdown only renders when this product ALSO has a live discount
    // (compareAtPrice > price), matching the reference's flash-sale intent.
    isPreOrder: { type: Boolean, default: false },
    saleEndsAt: { type: Date },
    // Drives the homepage "Trending" rail's primary tier (see
    // getNewArrivals() in src/lib/data.ts) — falls back to newest-arrivals
    // for the rest when fewer than `limit` products have this set.
    isTrending: { type: Boolean, default: false, index: true },
    // Which storefront catalog this product belongs to. Defaults to "shop"
    // so every one of the ~630 products that existed before this field was
    // added stays exactly where it already was (visible on /shop, absent
    // from /retail) with no backfill/migration needed — the same "missing
    // counts as the old behavior" pattern as `status` above. Isolation
    // between the two catalogs is enforced at query time via
    // productTypeFilter() in src/lib/search.ts, on both the storefront APIs
    // (/api/products, /api/retail/products) and the admin product list.
    productType: { type: String, enum: ["shop", "retail"], default: "shop", index: true },
    inStock: { type: Boolean, default: true },
    // Top-level numeric stock, for products with no size/color variants
    // (variant-level stock already exists at variants[].stock and is
    // unaffected by this — this is only for bulk/admin inventory actions on
    // products that don't use variants).
    stock: { type: Number, default: 0 },
    brand: { type: String, default: "", index: true },
    // Soft-delete — excluded from STOREFRONT_VISIBLE (src/lib/search.ts) so
    // an archived product disappears from the storefront the same way
    // status:"draft" does, but (unlike DELETE) stays visible in the admin
    // product list with a badge, and can be un-archived.
    archived: { type: Boolean, default: false, index: true },

    // Admin CMS fields — status gates storefront visibility (see
    // buildStorefrontFilter in src/lib/search.ts), the rest power the
    // Products admin section. `status` defaults to "published" for parity
    // with every pre-existing seeded product, which has no `status` field
    // at all in the database; the storefront filter treats that the same
    // as an explicit "published" so nothing already live disappears.
    status: { type: String, enum: ["draft", "published"], default: "published", index: true },
    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },
  },
  // `collection` and `isNew` are core product fields (collection grouping, new-arrival
  // flag) that happen to shadow Mongoose's reserved document pathnames of the same name.
  { timestamps: true, suppressReservedKeysWarning: true }
);

// Text index powers instant search across name / description / tags.
ProductSchema.index({ name: "text", description: "text", tags: "text" });

export const ProductModel: Model<any> = models.Product || model("Product", ProductSchema);
