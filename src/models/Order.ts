import { Schema, model, models, type Model } from "mongoose";

const OrderItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    name: String, sku: String, size: String, color: String,
    price: Number, quantity: { type: Number, default: 1 }, image: String,
    // Additive — WooCommerce/import-sourced orders carry a real per-line
    // money breakdown (a line's subtotal can differ from its total when a
    // per-item discount applied, and tax is tracked separately from both).
    // Left unset for orders created by checkout/route.ts, which has never
    // tracked these and keeps working unchanged (price/quantity only).
    subtotal: Number, total: Number, tax: Number,
    // Every attribute WooCommerce recorded for this specific line (not just
    // size/color — mirrors Product.VariantSchema.attributes) — kept even
    // when `product`/variant reconnection fails, so the original selection
    // is never silently lost. See wooOrderMapping.ts's item linking.
    variationAttributes: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const OrderAdminNoteSchema = new Schema(
  { note: String, createdAt: { type: Date, default: Date.now }, isCustomerNote: { type: Boolean, default: false } },
  { _id: false }
);

const OrderSchema = new Schema(
  {
    orderNumber: { type: String, unique: true, index: true },
    // Idempotency guard for order creation — a retried/double-submitted
    // checkout request (double-click, network timeout retry, or two
    // concurrent tabs) reuses the same client-generated key; the unique
    // index rejects a second insert outright, and createPendingOrder()
    // returns the original order instead of creating a duplicate and
    // double-decrementing stock. Sparse since legacy/imported orders never
    // set it.
    idempotencyKey: { type: String, unique: true, sparse: true },
    // Both queried on every account order-history load and (via
    // promotionSettings.ts's getCustomerPromotionHistory) on every checkout
    // discount calculation — indexed so those stay index-scans, not
    // collection-scans, as order volume grows.
    user: { type: Schema.Types.ObjectId, ref: "User", index: true },
    email: { type: String, required: true, index: true },
    // True only for an imported order whose customer couldn't be matched to
    // any User account (see § Customer Linking, ADMIN_CMS.md) — `user` stays
    // unset in that case. Never set by the live checkout flow.
    isGuestOrder: { type: Boolean, default: false },
    items: { type: [OrderItemSchema], default: [] },
    subtotal: Number, shipping: Number, tax: Number, discount: Number, total: Number,
    currency: { type: String, default: "GBP" },
    shippingMethod: { type: String, enum: ["standard", "express", "pickup"], default: "standard" },
    coupon: String,
    // The full list of coupon codes applied — `coupon` above (a single
    // string) predates multi-coupon orders and stays populated with the
    // first code for backward compatibility with existing consumers.
    couponCodes: { type: [String], default: [] },
    // Promotion metadata — one entry per discount actually applied to this
    // order (both code-based and automatic), so `discount` above is always
    // traceable back to what produced it. See src/lib/promotions/. A field
    // named `type` inside this subdocument collides with Mongoose's own
    // `type:` schema-definition keyword — without wrapping it as
    // `{ type: String }`, Mongoose reads the whole object as a type
    // descriptor and silently casts the entire array to [String].
    appliedDiscounts: {
      type: [{
        discountId: String, code: String, type: { type: String }, description: String, amountSaved: Number,
      }],
      default: [],
    },
    shippingAddress: Schema.Types.Mixed,
    billingAddress: Schema.Types.Mixed,
    paymentMethod: {
      type: String,
      enum: ["stripe", "paypal", "card", "upi", "cash", "bank_transfer", "cod", "other"],
      default: "card",
    },
    // The original, un-normalized WooCommerce gateway id (e.g. "stripe",
    // "ppcp-gateway", "cod", "bacs") — preserved verbatim even when
    // `paymentMethod` above had to fall back to "other" for an unrecognized
    // gateway, so nothing about the real payment method is ever lost.
    paymentGatewayId: String,
    transactionId: String,
    // PayPal-specific identifiers — see src/lib/payments/paypalClient.ts.
    // `paypalOrderId` is set at create-order time (before capture);
    // `paypalCaptureId`/`paypalTransactionId`/`paypalPayerId` are only ever
    // set after a server-verified capture. `paymentMetadata` keeps the raw
    // (trimmed) capture/webhook payload for support/debugging — never
    // trusted as a source of truth, only for reference.
    paypalOrderId: String,
    paypalCaptureId: String,
    paypalTransactionId: String,
    paypalPayerId: String,
    paymentMetadata: Schema.Types.Mixed,
    paidAt: Date,
    customerNote: String,
    // WooCommerce's private/admin-only order notes (wp_comments,
    // comment_type "order_note") — informational only, never shown to the
    // customer. Best-effort: only populated when the source SQL export
    // includes wp_comments (not one of this importer's required tables).
    adminNotes: { type: [OrderAdminNoteSchema], default: [] },
    // Original WooCommerce identity, for idempotent re-import (alongside
    // orderNumber) and traceability — mirrors User.sourceSystem/sourceId.
    sourceSystem: String,
    sourceId: String,
    // The raw WooCommerce status string (e.g. "wc-completed") this order's
    // fulfillmentStatus/paymentStatus were normalized from — see
    // wooOrderMapping.ts's STATUS_MAP. Unset for organically-created orders.
    wooStatus: String,
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
    // Extended for the Admin CMS's fuller order lifecycle. "unfulfilled"
    // stays as the default the checkout API already creates orders with —
    // every other value is additive, admin-only.
    fulfillmentStatus: {
      type: String,
      enum: ["unfulfilled", "pending", "confirmed", "processing", "packed", "shipped", "delivered", "cancelled", "returned"],
      default: "unfulfilled",
    },
    // Status-change history for the admin "View Timeline" feature.
    timeline: {
      type: [{
        status: String, note: String, createdAt: { type: Date, default: Date.now },
        adminUser: { type: Schema.Types.ObjectId, ref: "User" },
      }],
      default: [],
    },
    // Set by an admin from the order detail page once a shipment goes out —
    // both optional/unset until then. Purely informational (no carrier
    // integration): trackingUrl drives the "Track Order" button in status
    // emails (src/lib/orderNotifications.ts), which is omitted entirely
    // while this is unset.
    trackingNumber: String,
    trackingUrl: String,
  },
  { timestamps: true }
);

OrderSchema.index({ sourceSystem: 1, sourceId: 1 });
// unique + sparse mirrors the exact pattern already used for
// idempotencyKey above: PayPal order ids are opaque and generated by
// PayPal itself per create-order call, so two Order documents should never
// share one — capture-order/webhook both resolve an order via
// `findOne({ paypalOrderId })`, and without this constraint a future bug
// that let two orders end up with the same id would make that lookup
// resolve non-deterministically. `sparse` excludes the many orders that
// never had a PayPal payment at all (paypalOrderId field entirely absent,
// not merely null) from the uniqueness constraint — see
// scripts/addPaypalOrderIdUniqueIndex.ts for the safe migration onto an
// already-existing collection/index.
OrderSchema.index({ paypalOrderId: 1 }, { unique: true, sparse: true });

export const OrderModel: Model<any> = models.Order || model("Order", OrderSchema);
