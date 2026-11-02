import { Schema, model, models, type Model } from "mongoose";

const CollectionSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    season: { type: String },
    description: { type: String, default: "" },
    heroImage: { type: String },
    featured: { type: Boolean, default: false },
    // Admin CMS additions.
    homepage: { type: Boolean, default: false },
    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },
  },
  { timestamps: true }
);

export const CollectionModel: Model<any> = models.Collection || model("Collection", CollectionSchema);
