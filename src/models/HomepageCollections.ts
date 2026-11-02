import { Schema, model, models, type Model } from "mongoose";

// Singleton — same pattern as RetailSettings.ts/StoreSettings.ts. Backs the
// three flag-driven storefront collections (Latest Drops = isNew,
// Best Selling = isBestSeller, Trending = isTrending): their homepage teaser
// rails (Best Selling, Trending only — Latest Drops has no homepage rail)
// and their dedicated collection pages' heading copy.
const HomepageCollectionSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    title: { type: String, default: "" },
    subtitle: { type: String, default: "" },
    description: { type: String, default: "" },
    // Homepage teaser rail size (Best Selling/Trending only — ignored by
    // Latest Drops, which has no rail, and by every dedicated collection
    // page, which shows the full paginated catalog instead of a fixed count).
    limit: { type: Number, default: 10 },
    mode: { type: String, enum: ["automatic", "manual"], default: "automatic" },
    productIds: { type: [Schema.Types.ObjectId], ref: "Product", default: [] },
    ctaEnabled: { type: Boolean, default: true },
    ctaText: { type: String, default: "View Products" },
    ctaHref: { type: String, default: "" },
  },
  { _id: false }
);

const HomepageCollectionsSchema = new Schema(
  {
    latestDrops: { type: HomepageCollectionSchema, default: () => ({}) },
    bestSelling: { type: HomepageCollectionSchema, default: () => ({}) },
    trending: { type: HomepageCollectionSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const HomepageCollectionsModel: Model<any> =
  models.HomepageCollections || model("HomepageCollections", HomepageCollectionsSchema);
