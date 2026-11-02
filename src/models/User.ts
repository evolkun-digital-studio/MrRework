import { Schema, model, models, type Model } from "mongoose";

// Addresses live on the User document itself (not a separate collection) —
// there's exactly one owner per address and no other model needs to
// reference them independently, so embedding avoids a redundant join.
const AddressSchema = new Schema(
  {
    firstName: String, lastName: String, phone: String, company: String,
    country: String, state: String, city: String,
    address: String, apartment: String, postalCode: String,
    isDefaultShipping: { type: Boolean, default: false },
    isDefaultBilling: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// UI-only for now (see /api/account/payment-methods) — intentionally never
// stores a full card number or CVV, only what's needed to display a saved
// card. `gatewayId` is reserved for a future Stripe PaymentMethod id.
const PaymentMethodSchema = new Schema(
  {
    brand: { type: String, enum: ["visa", "mastercard", "amex", "other"], default: "other" },
    last4: { type: String, required: true },
    expMonth: { type: Number, required: true },
    expYear: { type: Number, required: true },
    holderName: String,
    isDefault: { type: Boolean, default: false },
    gatewayId: String,
  },
  { timestamps: true }
);

const NotificationSettingsSchema = new Schema(
  {
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
    marketing: { type: Boolean, default: false },
    orderUpdates: { type: Boolean, default: true },
    newsletter: { type: Boolean, default: false },
  },
  { _id: false }
);

// One entry per browser/device that has touched this account — the closest
// honest analog to "recent devices / login history" before real auth exists.
// Once login ships, the same array keeps working, just also gets written on
// explicit sign-in events instead of only on session creation.
const SessionEntrySchema = new Schema(
  {
    sessionId: { type: String, required: true },
    device: String,
    userAgent: String,
    ip: String,
    createdAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Real authenticated sessions for the Admin CMS (see src/lib/adminAuth.ts) —
// distinct from `sessions` above, which is just guest-activity tracking for
// the customer account. Only ever populated for role:"admin" users. Stores a
// SHA-256 hash of the session token, never the raw token (mirrors the
// password-hashing principle; a fast hash is fine here since the token
// itself is already a high-entropy random value, not a low-entropy secret).
// Deliberately keeps its default auto-generated _id (unlike SessionEntry
// above) — the admin Profile > Security page needs a stable per-session
// identifier to revoke a specific device, without exposing the tokenHash
// itself as that identifier.
const AdminSessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    userAgent: String,
    ip: String,
  }
);

// Real authenticated sessions for storefront customers (see
// src/lib/customerAuth.ts) — deliberately its own array, own cookie, own
// hashing call site, entirely separate from AdminSessionSchema/adminSessions
// above even though both live on this same User document. Shape mirrors
// AdminSessionSchema on purpose (same reasoning: SHA-256 of an
// already-high-entropy token, default auto _id so a specific device/session
// can be revoked from Account > Security).
const CustomerSessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    userAgent: String,
    ip: String,
  }
);

const UserSchema = new Schema(
  {
    // The app has no login yet — every account today is a "guest" account
    // keyed by the same session cookie Cart/Wishlist already use (see
    // src/lib/cartSession.ts), created lazily on first /account visit.
    // `email`/`passwordHash` become required again once real auth lands.
    sessionId: { type: String, index: true, unique: true, sparse: true },
    email: { type: String, unique: true, sparse: true, index: true },
    passwordHash: String,
    passwordChangedAt: Date,
    // Set true for accounts created by a migration (see the Customer
    // Migration System, ADMIN_CMS.md) instead of a real signup — the
    // WordPress password hash is never imported (bcrypt vs. WordPress's own
    // phpass are incompatible anyway, so it couldn't be verified against
    // even if it were), so these accounts have no usable password until the
    // owner resets one. Never true for a normal signup.
    passwordNeedsReset: { type: Boolean, default: false },

    // Real customer authentication (see src/lib/customerAuth.ts) — additive
    // fields, all defaulted, so every existing shadow account (no email/
    // password yet) and every migrated WooCommerce account is unaffected
    // until it actually registers/logs in for the first time.
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: Date,
    // Legacy link-based verification (GET /api/auth/verify-email) — kept
    // as-is, untouched, for backward compatibility with any link already
    // sent before the OTP flow below replaced it as the registration path.
    emailVerificationTokenHash: String,
    emailVerificationExpires: Date,
    // OTP-based verification (see src/lib/customerAuth.ts) — the flow every
    // new registration actually uses now. `emailVerificationOtpHash` is a
    // SHA-256 hash, never the raw 6-digit code (same principle as every
    // other *Hash field on this model). A single active OTP per user: each
    // new one (registration or resend) simply overwrites these fields, so
    // a previous code stops working the instant a new one is issued.
    emailVerificationOtpHash: String,
    emailVerificationOtpExpires: Date,
    emailVerificationOtpAttempts: { type: Number, default: 0 },
    emailVerificationOtpCreatedAt: Date,
    // When the current OTP was last (re)sent — the authoritative, DB-
    // persisted gate for the 60-second resend cooldown (survives a
    // restart/multi-instance the same way admin-login's lockout does; see
    // the comment on failedLoginAttempts/lockedUntil below).
    emailVerificationOtpLastSentAt: Date,
    // Cumulative resend count for the current pending-verification cycle —
    // resets to 0 whenever a *fresh* OTP cycle starts (registration), only
    // increments on explicit "Resend OTP" calls. Capped at MAX_OTP_RESENDS.
    emailVerificationOtpResendCount: { type: Number, default: 0 },
    passwordResetTokenHash: String,
    passwordResetExpires: Date,
    // Own brute-force lockout for customer login — deliberately separate
    // from failedLoginAttempts/lockedUntil below, which are (and remain)
    // admin-login-only. Same 10-attempts/15-minute policy, independent
    // fields/counters so the two surfaces never share mutable state.
    customerFailedLoginAttempts: { type: Number, default: 0 },
    customerLockedUntil: Date,

    username: String,
    displayName: String,
    firstName: String,
    lastName: String,
    phone: String,
    dateOfBirth: Date,
    gender: { type: String, enum: ["female", "male", "non-binary", "prefer-not-to-say"] },
    country: String,
    language: { type: String, default: "en" },
    currency: { type: String, default: "GBP" },
    theme: { type: String, enum: ["light", "dark", "system"], default: "system" },
    profileImage: String,

    status: { type: String, enum: ["active", "suspended"], default: "active" },
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
    // Parent/Child Admin distinction (only meaningful for role:"admin").
    // Deliberately its own field rather than overloading `role` above,
    // which already means customer-vs-admin. Left unset for every admin
    // created before this feature (the original seedAdmin.ts account, and
    // any created directly in the DB) — isParentAdmin() in adminAuth.ts
    // treats "anything but child" as a Parent Admin, so those accounts keep
    // full access with no migration needed. Only ever "child" for an
    // account created through Settings > Admin Management.
    adminRole: { type: String, enum: ["parent", "child"] },
    // Set true when a Child Admin is invited or has their password reset by
    // a Parent Admin; forces the change-password screen on next login (see
    // the (dashboard) layout) instead of letting them operate the store
    // with a password that came over email in plain text. Defaults false so
    // no existing admin is retroactively forced through that flow.
    mustChangePassword: { type: Boolean, default: false },
    // The Parent Admin who invited this Child Admin — informational only
    // (never read by any authorization check); unset for the original
    // seeded admin and any account predating this feature.
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    // Brute-force lockout for admin login (see verifyAdminCredentials in
    // adminAuth.ts) — DB-persisted rather than in-memory so it survives a
    // restart and holds across multiple server instances. Only ever touched
    // for role:"admin" accounts.
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: Date,
    // The imported account's ORIGINAL WordPress role (e.g. "administrator",
    // "shop_manager", "subscriber") — informational only, never read by any
    // authorization check. `role` above is always forced to "customer" for
    // every migrated account regardless of what this says: granting `admin`
    // here would mean a WordPress admin/shop-manager account gets full
    // access to this app's Admin CMS the moment it's imported, with no
    // password of its own set (passwordNeedsReset) — a real privilege
    // escalation, not a theoretical one. A real admin promotion is a
    // deliberate action taken in this app's own Admin > Team screen, never
    // an automatic side effect of a data migration.
    wooRole: String,
    // Original WooCommerce/WordPress identity, for idempotent re-import
    // (alongside email) and traceability back to the source row — mirrors
    // Media.sourceSystem's pattern.
    sourceSystem: String,
    sourceId: String,
    // The account's true original signup date on the source system —
    // deliberately its own field, not reused from Mongoose's own
    // `createdAt` (which always reflects when *this* document was written,
    // i.e. migration time, not when the person actually registered).
    registeredAt: Date,
    lastLoginAt: Date,

    addresses: { type: [AddressSchema], default: [] },
    paymentMethods: { type: [PaymentMethodSchema], default: [] },
    notificationSettings: { type: NotificationSettingsSchema, default: () => ({}) },
    sessions: { type: [SessionEntrySchema], default: [] },
    adminSessions: { type: [AdminSessionSchema], default: [] },
    customerSessions: { type: [CustomerSessionSchema], default: [] },
    twoFactorEnabled: { type: Boolean, default: false },

    wishlist: { type: [Schema.Types.ObjectId], ref: "Product", default: [] },
  },
  { timestamps: true }
);

export const UserModel: Model<any> = models.User || model("User", UserSchema);
