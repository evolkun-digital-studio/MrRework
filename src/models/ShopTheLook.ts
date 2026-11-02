import { Schema, model, models, type Model } from "mongoose";

// x/y are percentages (0-100) of the slide image's own width/height — not
// pixels — so a hotspot's position stays correct at every card size/
// breakpoint without the admin having to re-place it per device.
const HotspotSchema = new Schema(
  {
    x: { type: Number, required: true, min: 0, max: 100 },
    y: { type: Number, required: true, min: 0, max: 100 },
    product: { type: Schema.Types.ObjectId, ref: "Product" },
  },
  { timestamps: false }
);

const ShopTheLookSchema = new Schema(
  {
    image: { type: String, default: "" },
    mobileImage: { type: String, default: "" },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    hotspots: { type: [HotspotSchema], default: [] },
  },
  { timestamps: true }
);

export const ShopTheLookModel: Model<any> = models.ShopTheLook || model("ShopTheLook", ShopTheLookSchema);
