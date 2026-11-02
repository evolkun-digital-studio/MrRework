import { Schema, model, models, type Model } from "mongoose";

// Singleton — the app always works with the first (and only) document,
// created lazily by getOrCreateSettings() in src/lib/adminData.ts. This is
// an admin-editable settings surface, not yet wired into checkout's own
// pricing engine (src/lib/pricing.ts, still env-var driven) — see that
// file's comment for why this is deliberately not rewired in this pass.
const StoreSettingsSchema = new Schema(
  {
    storeName: { type: String, default: "MrRework" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: {
      line1: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      postalCode: { type: String, default: "" },
      country: { type: String, default: "" },
    },
    currency: { type: String, default: "GBP" },
    taxRate: { type: Number, default: 0 },
    shippingFlatRate: { type: Number, default: 12 },
    shippingExpressRate: { type: Number, default: 25 },
    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },
    social: {
      instagram: { type: String, default: "" },
      facebook: { type: String, default: "" },
      twitter: { type: String, default: "" },
      pinterest: { type: String, default: "" },
    },
    // Payment gateway configuration — one sub-object per gateway so a future
    // Stripe/Razorpay/etc. addition is a new sibling key, not a schema
    // migration. `clientSecretEncrypted` is the only place a gateway secret
    // is ever persisted — see src/lib/crypto.ts and
    // src/lib/payments/paypalSettings.ts, which is the sole reader/writer.
    paymentGateways: {
      paypal: {
        enabled: { type: Boolean, default: false },
        environment: { type: String, enum: ["sandbox", "live"], default: "sandbox" },
        clientId: { type: String, default: "" },
        clientSecretEncrypted: { type: String, default: "" },
        webhookId: { type: String, default: "" },
        // PayPal's own merchant/payer id and email for whichever account the
        // stored clientId/clientSecretEncrypted authenticate as — filled in
        // by the "Connect PayPal" flow (src/lib/payments/paypalSettings.ts)
        // after PayPal itself confirms the credentials, never typed in by
        // the admin except optionally as a fallback for merchantId.
        merchantId: { type: String, default: "" },
        merchantEmail: { type: String, default: "" },
        currency: { type: String, default: "GBP" },
        lastVerifiedAt: Date,
        status: { type: String, enum: ["not_configured", "connected", "error"], default: "not_configured" },
      },
    },
    // Shipping configuration — reuses the existing shippingFlatRate/
    // shippingExpressRate fields above (finally wired into
    // src/lib/pricing.ts's calculation, see that file) rather than
    // duplicating them here; this object only holds the genuinely new
    // fields. Defaults match today's hardcoded copy/env values exactly, so
    // an unconfigured store behaves identically to before this existed.
    shipping: {
      localPickupEnabled: { type: Boolean, default: true },
      internationalShippingEnabled: { type: Boolean, default: true },
      estimatedDeliveryText: { type: String, default: "7-12 working days" },
      returnPolicyText: {
        type: String,
        default: "Free returns within 30 days, unworn with tags attached. Refunds processed within 5 working days of receipt.",
      },
      processingTimeText: { type: String, default: "Dispatched within 3-5 working days." },
      originCountry: { type: String, default: "" },
      originState: { type: String, default: "" },
      originCity: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

export const StoreSettingsModel: Model<any> = models.StoreSettings || model("StoreSettings", StoreSettingsSchema);
