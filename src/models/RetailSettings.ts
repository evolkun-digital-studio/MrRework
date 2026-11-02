import { Schema, model, models, type Model } from "mongoose";

// Singleton — same pattern as StoreSettings.ts (the app always works with
// the first/only document, created lazily by getOrCreateRetailSettings()
// in the admin API route). Backs the entire Retail CMS: everything an
// admin edits under Settings/Retail Management ends up here, and the
// public /api/retail/cms route (used by the /retail page) reads it back.
// Collections/categories are deliberately NOT duplicated here — Retail
// reuses the existing Collection/Category models exactly as Shop does; a
// "Retail collection" is just a Collection whose member products happen to
// have productType:"retail" (see Product.ts).

const PromoBlockSchema = new Schema(
  {
    image: { type: String, default: "" },
    heading: { type: String, default: "" },
    description: { type: String, default: "" },
    buttonText: { type: String, default: "" },
    buttonUrl: { type: String, default: "" },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { _id: true, timestamps: false }
);

const FaqSchema = new Schema(
  {
    question: { type: String, default: "" },
    answer: { type: String, default: "" },
    order: { type: Number, default: 0 },
  },
  { _id: true, timestamps: false }
);

const TestimonialSchema = new Schema(
  {
    customerName: { type: String, default: "" },
    designation: { type: String, default: "" },
    review: { type: String, default: "" },
    rating: { type: Number, default: 5, min: 1, max: 5 },
    customerImage: { type: String, default: "" },
    enabled: { type: Boolean, default: true },
  },
  { _id: true, timestamps: false }
);

const RetailSettingsSchema = new Schema(
  {
    hero: {
      enabled: { type: Boolean, default: true },
      title: { type: String, default: "Retail" },
      subtitle: { type: String, default: "" },
      description: { type: String, default: "" },
      backgroundImage: { type: String, default: "" },
      mobileBanner: { type: String, default: "" },
      ctaText: { type: String, default: "" },
      ctaUrl: { type: String, default: "" },
    },

    seo: {
      seoTitle: { type: String, default: "" },
      metaDescription: { type: String, default: "" },
      metaKeywords: { type: String, default: "" },
      canonicalUrl: { type: String, default: "" },
      ogTitle: { type: String, default: "" },
      ogDescription: { type: String, default: "" },
      ogImage: { type: String, default: "" },
    },

    intro: {
      heading: { type: String, default: "" },
      description: { type: String, default: "" },
      image: { type: String, default: "" },
    },

    // Featured Retail products — either a manually curated list (productIds)
    // or "latest N retail products", capped at maxProducts either way. The
    // storefront resolves this the same way getFeatured()/getNewArrivals()
    // already resolve their own curated-vs-fallback tiers in src/lib/data.ts.
    featured: {
      mode: { type: String, enum: ["manual", "automatic"], default: "automatic" },
      productIds: { type: [Schema.Types.ObjectId], ref: "Product", default: [] },
      maxProducts: { type: Number, default: 8 },
    },

    promoBlocks: { type: [PromoBlockSchema], default: [] },
    faqs: { type: [FaqSchema], default: [] },
    testimonials: { type: [TestimonialSchema], default: [] },

    newsletter: {
      enabled: { type: Boolean, default: false },
      heading: { type: String, default: "" },
      description: { type: String, default: "" },
      buttonText: { type: String, default: "Subscribe" },
    },
  },
  { timestamps: true }
);

export const RetailSettingsModel: Model<any> = models.RetailSettings || model("RetailSettings", RetailSettingsSchema);
