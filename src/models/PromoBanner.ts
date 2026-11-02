import { Schema, model, models, type Model } from "mongoose";

const PromoBannerSchema = new Schema(
  {
    title: { type: String, required: true },
    subtitle: { type: String, default: "" },
    buttonText: { type: String, default: "Shop Now" },
    buttonLink: { type: String, default: "/shop" },
    desktopImage: { type: String, default: "" },
    mobileImage: { type: String, default: "" },
    // 0 (no overlay) - 1 (fully opaque black), applied as the CTA-readability
    // scrim over the background image — same technique as OnStageSection's
    // flat bg-black/50 overlay, just admin-configurable per banner.
    overlayOpacity: { type: Number, default: 0.35 },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const PromoBannerModel: Model<any> = models.PromoBanner || model("PromoBanner", PromoBannerSchema);
