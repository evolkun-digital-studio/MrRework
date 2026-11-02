import { Schema, model, models, type Model } from "mongoose";

const CategorySchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, default: "" },
    image: { type: String },
    order: { type: Number, default: 0 },

    // Admin CMS additions — nesting, icon, and SEO. `parent` is null for a
    // top-level category; the storefront's flat category list/filters are
    // untouched by this (they don't read `parent` at all).
    parent: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    icon: { type: String, default: "" },
    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },
  },
  { timestamps: true }
);

export const CategoryModel: Model<any> = models.Category || model("Category", CategorySchema);
