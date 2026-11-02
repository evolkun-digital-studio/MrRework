import { Schema, model, models, type Model } from "mongoose";

// Singleton — same pattern as StoreSettings.ts (the app always works with
// the first/only document, created lazily by the admin API route with the
// component's own previous hardcoded defaults, so the storefront's content
// doesn't change the moment this ships — only once an admin actually edits
// it). Backs the homepage's two-card "Luxury Promo" editorial section
// (src/components/LuxuryPromoSection.tsx) — text and image only; there is
// no CTA button/link on this section by design.
const LuxuryPromoCardSchema = new Schema(
  {
    eyebrow: { type: String, default: "" },
    heading: { type: String, default: "" },
    image: { type: String, default: "" },
    imageAlt: { type: String, default: "" },
    // e.g. "center 30%" to keep a face/garment in frame on tall crops.
    objectPosition: { type: String, default: "" },
  },
  { _id: false }
);

const LuxuryPromoSectionSchema = new Schema(
  {
    left: { type: LuxuryPromoCardSchema, default: () => ({}) },
    right: { type: LuxuryPromoCardSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const LuxuryPromoSectionModel: Model<any> =
  models.LuxuryPromoSection || model("LuxuryPromoSection", LuxuryPromoSectionSchema);
