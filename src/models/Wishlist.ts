import { Schema, model, models, type Model } from "mongoose";

const WishlistItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    // Captured only as a display hint for what the shopper was looking at —
    // never used as part of the uniqueness key, so wishlisting a product is
    // always a single entry regardless of variant.
    size: String,
    color: String,
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const WishlistSchema = new Schema(
  {
    // Guest wishlists are keyed by the same session cookie the Cart uses;
    // once auth exists, a login should attach `user` and merge/retire the
    // guest sessionId wishlist.
    sessionId: { type: String, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", index: true },
    items: { type: [WishlistItemSchema], default: [] },
  },
  { timestamps: true }
);

export const WishlistModel: Model<any> = models.Wishlist || model("Wishlist", WishlistSchema);
