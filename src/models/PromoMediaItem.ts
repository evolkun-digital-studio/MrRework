import { Schema, model, models, type Model } from "mongoose";

// Backs the homepage "Campaign Wall" infinite marquee (CampaignMediaWall.tsx)
// — Admin -> Content -> Promotional Banners -> Media Wall Items tab.
const PromoMediaItemSchema = new Schema(
  {
    type: { type: String, enum: ["image", "video"], default: "image" },
    url: { type: String, required: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const PromoMediaItemModel: Model<any> = models.PromoMediaItem || model("PromoMediaItem", PromoMediaItemSchema);
