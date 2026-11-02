import "server-only";
import { cookies, headers } from "next/headers";
import { randomBytes, randomInt, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { dbConnect } from "./mongodb";
import { UserModel } from "@/models/User";

// Real authenticated sessions for storefront customers — a dedicated
// module, deliberately not importing from or sharing any state with
// src/lib/adminAuth.ts (own cookie, own token hashing call site, own
// session array, own lockout counters), even though both ultimately read/
// write the same User collection. Mirrors adminAuth.ts's *shape* (random
// 32-byte token, cookie holds the raw value, DB stores only its SHA-256
// hash) because that shape is sound, not because the code is shared.

const COOKIE = "epure_customer_sid";
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_MAX_AGE = 60 * 60 * 24; // 1 day

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_OTP_RESENDS = 5; // configurable — see the module comment on generateEmailVerificationOtp

// Exported so other server-only modules that need the same basic
// shape-check (e.g. orderCreation.ts validating a checkout email) reuse
// this one definition instead of a third copy of the same regex.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface RegisterResult {
  ok: boolean;
  error?: string;
  user?: any;
  otp?: string;
  otpExpiresAt?: Date;
}

// Upgrades an already-resolved shadow account (the caller passes in
// getOrCreateAccountUser()'s result from src/lib/account.ts — this module
// deliberately never imports account.ts itself, to avoid a circular import
// now that account.ts also depends on getCustomerSession() below) into a
// real, password-protected account in place, rather than creating a new,
// disconnected User document — so any cart/wishlist/order/address history
// already tied to this session's cookie carries straight over with nothing
// to migrate.
export async function registerCustomer(user: any, email: string, password: string, name?: string): Promise<RegisterResult> {
  const normalizedEmail = normalizeEmail(email);
  // 254 is the practical RFC 5321 maximum — the format regex below is
  // otherwise unbounded and would happily accept (and store, and index) an
  // email of any length.
  if (normalizedEmail.length > 254 || !EMAIL_RE.test(normalizedEmail)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (typeof password !== "string" || password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  // bcrypt silently truncates at 72 bytes — an explicit cap makes that
  // behavior intentional rather than an implicit side effect, and avoids
  // hashing an arbitrarily large request body.
  if (password.length > 128) {
    return { ok: false, error: "Password must be 128 characters or fewer." };
  }

  await dbConnect();

  const existing = await UserModel.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
  if (existing) return { ok: false, error: "An account with this email already exists. Log in instead." };

  const trimmedName = name?.trim();
  if (trimmedName) {
    const [firstName, ...rest] = trimmedName.split(/\s+/);
    user.firstName = firstName;
    user.lastName = rest.join(" ");
  }

  user.email = normalizedEmail;
  user.passwordHash = await bcrypt.hash(password, 12);
  user.passwordChangedAt = new Date();
  user.passwordNeedsReset = false;
  user.emailVerified = false;
  user.emailVerifiedAt = undefined;
  user.customerFailedLoginAttempts = 0;
  user.customerLockedUntil = undefined;

  // Registration now verifies over OTP (see generateEmailVerificationOtp
  // below), not the legacy emailVerificationTokenHash link — that field
  // pair is left alone on the schema for backward compatibility, just never
  // written by a fresh registration anymore.
  const otp = issueOtp(user);
  user.emailVerificationOtpResendCount = 0;

  try {
    await user.save();
  } catch (err: any) {
    // The findOne check above is racy against a concurrent register with the
    // same email — the unique index on User.email is the real guard.
    if (err?.code === 11000) return { ok: false, error: "An account with this email already exists. Log in instead." };
    throw err;
  }

  return { ok: true, user, otp, otpExpiresAt: user.emailVerificationOtpExpires };
}

export type LoginReason = "ok" | "invalid" | "locked" | "not_verified";

export interface LoginResult {
  reason: LoginReason;
  user?: any;
}

// DB-persisted lockout (survives restarts/multiple instances), scoped by
// its own customerFailedLoginAttempts/customerLockedUntil fields — never
// touches failedLoginAttempts/lockedUntil, which remain admin-login-only.
export async function verifyCustomerCredentials(email: string, password: string): Promise<LoginResult> {
  await dbConnect();
  const normalizedEmail = normalizeEmail(email);
  const user = await UserModel.findOne({ email: normalizedEmail, role: "customer" });
  if (!user || !user.passwordHash) return { reason: "invalid" };

  if (user.customerLockedUntil && user.customerLockedUntil > new Date()) return { reason: "locked" };

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    user.customerFailedLoginAttempts = (user.customerFailedLoginAttempts ?? 0) + 1;
    if (user.customerFailedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.customerLockedUntil = new Date(Date.now() + LOCKOUT_MS);
      user.customerFailedLoginAttempts = 0;
    }
    await user.save();
    return { reason: "invalid" };
  }

  if (user.customerFailedLoginAttempts || user.customerLockedUntil) {
    user.customerFailedLoginAttempts = 0;
    user.customerLockedUntil = undefined;
    await user.save();
  }

  if (!user.emailVerified) return { reason: "not_verified", user };

  return { reason: "ok", user };
}

// Issues a new session for an already-verified user and sets the cookie.
// Must be called from a Route Handler (cookie writes aren't allowed from a
// plain Server Component render).
export async function createCustomerSession(user: any, rememberMe: boolean) {
  const token = randomBytes(32).toString("hex");
  const maxAge = rememberMe ? REMEMBER_MAX_AGE : DEFAULT_MAX_AGE;
  const expiresAt = new Date(Date.now() + maxAge * 1000);

  const h = await headers();
  user.customerSessions.push({
    tokenHash: hashToken(token),
    createdAt: new Date(),
    expiresAt,
    userAgent: h.get("user-agent") ?? "",
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "",
  });
  user.lastLoginAt = new Date();
  await user.save();

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge,
    path: "/",
  });
}

export async function getCustomerSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  await dbConnect();
  const tokenHash = hashToken(token);
  const user = await UserModel.findOne({ role: "customer", "customerSessions.tokenHash": tokenHash });
  if (!user) return null;

  const session = user.customerSessions.find((s: any) => s.tokenHash === tokenHash);
  if (!session || session.expiresAt < new Date()) return null;

  return user;
}

export async function requireCustomer() {
  return getCustomerSession();
}

export async function clearCustomerSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await dbConnect();
    const tokenHash = hashToken(token);
    await UserModel.updateOne({ "customerSessions.tokenHash": tokenHash }, { $pull: { customerSessions: { tokenHash } } });
  }
  jar.delete(COOKIE);
}

// Revokes every OTHER session for this account after a security-sensitive
// change made from an authenticated session (password change, email
// change) — keeps only the session making THIS request, if any, so the
// user isn't logged out of the device they're actively using. Called with
// the same `user` document the caller is about to (or just did) save, so
// the caller must still persist it — this only mutates the in-memory array.
export function clearOtherCustomerSessionsInMemory(user: any, currentTokenHash: string | null) {
  user.customerSessions = currentTokenHash
    ? user.customerSessions.filter((s: any) => s.tokenHash === currentTokenHash)
    : [];
}

// Cookie-aware wrapper around the above for the common case (an /account
// route acting on the session making the current request) — reads the raw
// token from the request's own cookie, hashes it, revokes every other
// session, and saves.
export async function clearOtherCustomerSessions(user: any) {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  clearOtherCustomerSessionsInMemory(user, token ? hashToken(token) : null);
  await user.save();
}

// crypto.randomInt is uniform (no modulo bias, unlike Math.random()) —
// zero-padded so every code is always exactly 6 digits, including ones
// with leading zeros.
function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// The actual mutation, shared by both "issue the first OTP" (registration)
// and "issue a replacement" (resend) — overwriting these fields is what
// makes a previous code single-use: once a new hash is stored, the old raw
// code can never match it again, whether or not it was ever submitted.
// Caller is responsible for save()-ing and for resendCount bookkeeping.
function issueOtp(user: any): string {
  const otp = generateOtp();
  user.emailVerificationOtpHash = hashToken(otp);
  user.emailVerificationOtpExpires = new Date(Date.now() + OTP_TTL_MS);
  user.emailVerificationOtpAttempts = 0;
  user.emailVerificationOtpCreatedAt = new Date();
  user.emailVerificationOtpLastSentAt = new Date();
  return otp;
}

export type OtpResendReason = "ok" | "cooldown" | "max_resends";
export interface OtpResendResult {
  reason: OtpResendReason;
  otp?: string;
  otpExpiresAt?: Date;
  retryAfterSeconds?: number;
}

// "Resend OTP" — invalidates whatever code existed before (issueOtp
// overwrites it), resets the 10-minute expiry, and enforces both the
// 60-second cooldown and the total-resend cap. Both limits are DB-
// persisted on the user document (not the in-memory rate limiter also
// applied at the route level) so they hold across a server restart or
// multiple instances — same reasoning as admin-login's lockout in
// adminAuth.ts.
export async function resendEmailVerificationOtp(user: any): Promise<OtpResendResult> {
  if (user.emailVerificationOtpLastSentAt) {
    const elapsedMs = Date.now() - new Date(user.emailVerificationOtpLastSentAt).getTime();
    if (elapsedMs < OTP_RESEND_COOLDOWN_MS) {
      return { reason: "cooldown", retryAfterSeconds: Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsedMs) / 1000) };
    }
  }
  if ((user.emailVerificationOtpResendCount ?? 0) >= MAX_OTP_RESENDS) {
    return { reason: "max_resends" };
  }

  const otp = issueOtp(user);
  user.emailVerificationOtpResendCount = (user.emailVerificationOtpResendCount ?? 0) + 1;
  await user.save();
  return { reason: "ok", otp, otpExpiresAt: user.emailVerificationOtpExpires };
}

export type OtpVerifyReason = "ok" | "already_verified" | "not_found" | "expired" | "incorrect" | "max_attempts";
export interface OtpVerifyResult {
  reason: OtpVerifyReason;
  user?: any;
}

// Consumes a submitted OTP — single-use (cleared on success), time-limited,
// attempt-capped. Deliberately looked up by email (this is a public,
// unauthenticated endpoint reached right after registration, before any
// session exists) rather than by a session/token the caller doesn't have
// yet.
export async function consumeEmailVerificationOtp(email: string, otp: string): Promise<OtpVerifyResult> {
  await dbConnect();
  const user = await UserModel.findOne({ email: normalizeEmail(email), role: "customer" });
  if (!user) return { reason: "not_found" };
  if (user.emailVerified) return { reason: "already_verified", user };
  if (!user.emailVerificationOtpHash) return { reason: "not_found" };

  if (user.emailVerificationOtpExpires && new Date(user.emailVerificationOtpExpires) < new Date()) {
    return { reason: "expired", user };
  }
  if ((user.emailVerificationOtpAttempts ?? 0) >= MAX_OTP_ATTEMPTS) {
    return { reason: "max_attempts", user };
  }

  const matches = user.emailVerificationOtpHash === hashToken(otp);
  if (!matches) {
    user.emailVerificationOtpAttempts = (user.emailVerificationOtpAttempts ?? 0) + 1;
    await user.save();
    return { reason: "incorrect", user };
  }

  user.emailVerified = true;
  user.emailVerifiedAt = new Date();
  user.emailVerificationOtpHash = undefined;
  user.emailVerificationOtpExpires = undefined;
  user.emailVerificationOtpAttempts = 0;
  user.emailVerificationOtpCreatedAt = undefined;
  user.emailVerificationOtpLastSentAt = undefined;
  user.emailVerificationOtpResendCount = 0;
  await user.save();
  return { reason: "ok", user };
}

// Regenerates and stores a fresh verification token for an unverified
// account — used by both register and "resend verification email".
export async function generateEmailVerificationToken(user: any): Promise<string> {
  const token = randomBytes(32).toString("hex");
  user.emailVerificationTokenHash = hashToken(token);
  user.emailVerificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
  await user.save();
  return token;
}

// Consumes a verification token (single-use, time-limited) and marks the
// account verified. Returns null for anything invalid/expired — callers
// must not distinguish "wrong token" from "expired token" in their response.
export async function consumeEmailVerificationToken(rawToken: string) {
  await dbConnect();
  const tokenHash = hashToken(rawToken);
  const user = await UserModel.findOne({
    emailVerificationTokenHash: tokenHash,
    emailVerificationExpires: { $gt: new Date() },
  });
  if (!user) return null;

  user.emailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();
  return user;
}

// Always safe to call regardless of whether the email exists — callers must
// return the same generic response either way to avoid leaking which emails
// are registered.
export async function generatePasswordResetToken(email: string): Promise<{ user: any; token: string } | null> {
  await dbConnect();
  const user = await UserModel.findOne({ email: normalizeEmail(email), role: "customer" });
  if (!user) return null;

  const token = randomBytes(32).toString("hex");
  user.passwordResetTokenHash = hashToken(token);
  user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  await user.save();
  return { user, token };
}

// Consumes a password-reset token (single-use, time-limited), sets the new
// password, and marks the account verified — successfully following the
// emailed link is itself proof of inbox access.
export async function consumePasswordResetToken(rawToken: string, newPassword: string) {
  await dbConnect();
  const tokenHash = hashToken(rawToken);
  const user = await UserModel.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpires: { $gt: new Date() },
  });
  if (!user) return null;

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.passwordChangedAt = new Date();
  user.passwordNeedsReset = false;
  user.emailVerified = true;
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  user.customerFailedLoginAttempts = 0;
  user.customerLockedUntil = undefined;
  // A password reset is a "my account may be compromised" action — any
  // session issued before this point (e.g. a stolen cookie) must not
  // survive it. There's no "current" session to preserve here (the caller
  // authenticated with a one-time reset token, not a session cookie), so
  // this clears everything; createCustomerSession() right after issues a
  // fresh one for the browser that completed the reset.
  clearOtherCustomerSessionsInMemory(user, null);
  await user.save();
  return user;
}
