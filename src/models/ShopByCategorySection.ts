import { Schema, model, models, type Model } from "mongoose";

const ItemSchema = new Schema({
  categorySlug: { type: String, required: true },
  customImage: { type: String, default: "" },
  enabled: { type: Boolean, default: true },
  displayOrder: { type: Number, default: 0 },
}, { _id: false });

const SectionSchema = new Schema({
  enabled: { type: Boolean, default: true },
  title: { type: String, default: "Shop by Category" },
  subtitle: { type: String, default: "Discover our collections" },
  categories: { type: [ItemSchema], default: [] },
}, { timestamps: true });

export const ShopByCategorySectionModel: Model<any> = models.ShopByCategorySection || model("ShopByCategorySection", SectionSchema);
