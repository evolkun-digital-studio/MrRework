import { Schema, model, models, type Model } from "mongoose";

const CartItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    slug: String, name: String, sku: String, image: String,
    price: { type: Number, required: true },
    size: String, color: String,
    quantity: { type: Number, required: true, default: 1, min: 1 },
  },
  { _id: false }
);

const CartSchema = new Schema(
  {
    // Guest carts are keyed by an httpOnly session cookie; once auth exists,
    // a login should attach `user` and merge/retire the guest sessionId cart.
    sessionId: { type: String, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", index: true },
    items: { type: [CartItemSchema], default: [] },
  },
  { timestamps: true }
);

export const CartModel: Model<any> = models.Cart || model("Cart", CartSchema);
