import { Schema, model, models, type Model } from "mongoose";

// Newsletter signups from the storefront's NewsletterForm (see
// /api/newsletter). Deliberately its own small collection, not folded into
// User — a subscriber never needs an account, a password, or a cart, and
// most signups happen with no session at all.
const SubscriberSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    // Where the signup came from — always "newsletter-form" today (the one
    // public entry point), kept as a field (not a hardcoded assumption)
    // so a future second signup surface doesn't need a schema change.
    source: { type: String, default: "newsletter-form" },
  },
  { timestamps: true }
);

export const SubscriberModel: Model<any> = models.Subscriber || model("Subscriber", SubscriberSchema);
