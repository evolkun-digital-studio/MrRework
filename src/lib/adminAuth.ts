import "server-only";
import { cookies, headers } from "next/headers";
import { randomBytes, randomInt, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { dbConnect } from "./mongodb";
import { UserModel } from "@/models/User";

const COOKIE = "epure_admin_sid";
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_MAX_AGE = 60 * 60 * 24; // 1 day

// Real authenticated sessions for the Admin CMS — deliberately a separate
// cookie/mechanism from the customer account's guest-session cookie (see
// src/lib/cartSession.ts). Nothing here auto-provisions a user the way
// getOrCreateAccountUser() does; a session only ever exists after a
// password has been verified against a role:"admin" user.

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// DB-persisted brute-force lockout — 10 wrong passwords in a row locks the
// account for 15 minutes. Counts against the account being attacked, not
// the caller's IP, so it can't be bypassed by rotating source addresses.
export async function verifyAdminCredentials(email: string, password: string) {
  await dbConnect();
  const user = await UserModel.findOne({ email: email.trim().toLowerCase(), role: "admin" });
  if (!user || !user.passwordHash) return null;
  if (user.status !== "active") return null;

  if (user.lockedUntil && user.lockedUntil > new Date()) return null;

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCKOUT_MS);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    return null;
  }

  if (user.failedLoginAttempts || user.lockedUntil) {
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    await user.save();
  }
  return user;
}

// Issues a new session for an already-verified admin user and sets the
// cookie. Must be called from a Route Handler or Server Action (cookie
// writes aren't allowed from a plain Server Component render).
export async function createAdminSession(user: any, rememberMe: boolean) {
  const token = randomBytes(32).toString("hex");
  const maxAge = rememberMe ? REMEMBER_MAX_AGE : DEFAULT_MAX_AGE;
  const expiresAt = new Date(Date.now() + maxAge * 1000);

  const h = await headers();
  // Opportunistic pruning: drop sessions that have already expired before
  // adding the new one. getAdminSession() already rejects an expired entry
  // on lookup (`session.expiresAt < new Date()`), so a stale entry left in
  // the array was never a working session — this only removes rows that
  // were already dead weight (unbounded growth over time, each carrying a
  // hashed token/IP/user-agent with no retention policy), never a session
  // that could still authenticate.
  const now = new Date();
  user.adminSessions = user.adminSessions.filter((s: any) => s.expiresAt > now);
  user.adminSessions.push({
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

// Reads the session cookie and resolves it to a live admin User document.
// Returns null for anyone not authenticated — this never creates a user,
// unlike the customer account's shadow-account pattern.
export async function getAdminSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  await dbConnect();
  const tokenHash = hashToken(token);
  const user = await UserModel.findOne({
    role: "admin",
    status: "active",
    "adminSessions.tokenHash": tokenHash,
  });
  if (!user) return null;

  const session = user.adminSessions.find((s: any) => s.tokenHash === tokenHash);
  if (!session || session.expiresAt < new Date()) return null;

  return user;
}

// Convenience wrapper for API routes: returns the admin user or null so the
// route can short-circuit with a 401 in one line.
export async function requireAdmin() {
  return getAdminSession();
}

export async function clearAdminSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await dbConnect();
    const tokenHash = hashToken(token);
    await UserModel.updateOne({ "adminSessions.tokenHash": tokenHash }, { $pull: { adminSessions: { tokenHash } } });
  }
  jar.delete(COOKIE);
}

export function serializeAdminUser(user: any) {
  return {
    _id: String(user._id),
    email: user.email ?? null,
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    profileImage: user.profileImage ?? null,
    role: user.role,
    // "child" only for an account created via Settings > Admin Management;
    // every other admin (including every admin that predates this field)
    // reads as "parent" — see the schema comment on adminRole in User.ts.
    adminRole: user.adminRole === "child" ? "child" : "parent",
    status: user.status,
    mustChangePassword: !!user.mustChangePassword,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt ?? null,
    twoFactorEnabled: !!user.twoFactorEnabled,
  };
}

export type SafeAdminUser = ReturnType<typeof serializeAdminUser>;

// Single source of truth for "can this admin manage other admins" — every
// admin-management route (and the Settings > Admin Management page itself)
// calls this instead of re-deriving the check, so the rule can't drift
// between call sites. Deliberately the inverse of "adminRole === 'child'"
// (not "adminRole === 'parent'") so an admin predating this feature
// (adminRole unset) is treated as a Parent Admin, matching serializeAdminUser.
export function isParentAdmin(user: { adminRole?: string } | null | undefined): boolean {
  return !!user && user.adminRole !== "child";
}

// Secure random temporary password for a newly invited/reset Child Admin —
// mixed character classes so it satisfies any reasonable password policy,
// generated with crypto.randomInt (uniform, no modulo bias) rather than
// Math.random(). Excludes visually-ambiguous characters (0/O, 1/l/I) since
// this has to be retyped by hand from an email at least once.
const TEMP_PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
export function generateTempPassword(length = 14): string {
  let password = "";
  for (let i = 0; i < length; i++) {
    password += TEMP_PASSWORD_CHARS[randomInt(TEMP_PASSWORD_CHARS.length)];
  }
  return password;
}
