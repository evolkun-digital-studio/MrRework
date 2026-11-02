import { Schema, model, models, type Model } from "mongoose";

// "Discount" is the feature name; this collection/model stays "Coupon" —
// every field below the original four is additive, so existing coupons
// (created before the Discount & Promotion System) keep working unchanged.
// See src/lib/promotions/ for the engine that actually applies these.
const CouponSchema = new Schema(
  {
    // `code` is no longer required — an `automatic: true` discount has no
    // customer-entered code at all.
    code: { type: String, unique: true, sparse: true, uppercase: true, trim: true, index: true },
    type: { type: String, enum: ["percentage", "fixed", "free_shipping", "buy_x_get_y"], required: true },
    value: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date },
    usageLimit: { type: Number },
    usageCount: { type: Number, default: 0 },
    minimumOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },

    description: { type: String, default: "" },
    startsAt: { type: Date },
    maximumDiscount: { type: Number },
    perCustomerLimit: { type: Number },
    // Automatic discounts apply without a code (requirement #4); everything
    // else about validation/stacking is identical to a code-based one.
    automatic: { type: Boolean, default: false },
    freeShipping: { type: Boolean, default: false },
    stackable: { type: Boolean, default: false },
    // Higher priority is resolved first when several discounts are eligible
    // at once — see src/lib/promotions/promotionEngine.ts.
    priority: { type: Number, default: 0 },

    applicableProducts: { type: [Schema.Types.ObjectId], ref: "Product", default: [] },
    applicableCategories: { type: [String], default: [] },
    excludedProducts: { type: [Schema.Types.ObjectId], ref: "Product", default: [] },
    excludedCategories: { type: [String], default: [] },
    firstOrderOnly: { type: Boolean, default: false },

    // Buy X Get Y — foundation only (see plan): validated as an eligibility
    // check and converted into a monetary saving equal to the free item(s)'
    // value; does not inject a new line item into the cart/order.
    buyQuantity: { type: Number },
    getQuantity: { type: Number },
    buyGetProduct: { type: Schema.Types.ObjectId, ref: "Product" },
  },
  { timestamps: true }
);

export const CouponModel: Model<any> = models.Coupon || model("Coupon", CouponSchema);
