import "server-only";
import { headers } from "next/headers";
import { dbConnect } from "./mongodb";
import { getOrCreateCartSessionId } from "./cartSession";
import { getCustomerSession } from "./customerAuth";
import { UserModel } from "@/models/User";

// A rough, dependency-free device label from the User-Agent string — good
// enough for a "recent devices" list without pulling in a UA-parsing library.
// Exported so the real-session route (security/sessions/route.ts) can reuse
// it instead of re-implementing UA parsing for its own list.
export function labelDevice(ua: string): string {
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Unknown OS";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Unknown browser";
  return `${browser} on ${os}`;
}

// The single reused identity resolver for every /account API route. A real
// logged-in customer session (src/lib/customerAuth.ts) always wins — that's
// what makes login mean something across devices — and only falls back to
// today's guest-cookie shadow-account lookup when there is no session,
// exactly as before. Lazily creates a "shadow" account on first guest touch;
// email/password get filled in later by Register or the Security page.
//
// Deliberately never stamps the current device's sessionId onto a *logged-in*
// user's document: `sessionId` has a unique index, and this device may
// already have its own, separate guest shadow account under that exact
// sessionId — reassigning it here would collide with that document. Cart/
// wishlist merging (which is what actually needs to correlate "this
// browser's guest cookie" with "the account that just logged in") happens
// explicitly at login/register/verify time instead, against the Cart/
// Wishlist collections directly, not via this field.
export async function getOrCreateAccountUser() {
  await dbConnect();
  const sessionId = await getOrCreateCartSessionId();

  let user = await getCustomerSession();
  if (!user) {
    user = await UserModel.findOne({ sessionId });
    if (!user) user = await UserModel.create({ sessionId });
  }

  // Best-effort device/activity tracking — never blocks the request.
  try {
    const h = await headers();
    const ua = h.get("user-agent") ?? "";
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "";
    const now = new Date();
    const existing = user.sessions.find((s: any) => s.sessionId === sessionId);
    if (existing) {
      existing.lastSeenAt = now;
    } else {
      user.sessions.push({ sessionId, device: labelDevice(ua), userAgent: ua, ip, createdAt: now, lastSeenAt: now });
    }
    user.lastLoginAt = now;
    await user.save();
  } catch {
    // Activity tracking is a nice-to-have, not load-bearing.
  }

  return user;
}

// Whitelisted view of a User document — never leaks passwordHash, sessionId,
// or raw Mongo internals to the client.
export function serializeUser(user: any) {
  return {
    _id: String(user._id),
    email: user.email ?? null,
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    phone: user.phone ?? "",
    dateOfBirth: user.dateOfBirth ?? null,
    gender: user.gender ?? null,
    country: user.country ?? "",
    language: user.language ?? "en",
    currency: user.currency ?? "GBP",
    theme: user.theme ?? "system",
    profileImage: user.profileImage ?? null,
    status: user.status ?? "active",
    role: user.role ?? "customer",
    hasPassword: !!user.passwordHash,
    passwordChangedAt: user.passwordChangedAt ?? null,
    twoFactorEnabled: !!user.twoFactorEnabled,
    memberSince: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
    addresses: (user.addresses ?? []).map((a: any) => ({
      _id: String(a._id),
      firstName: a.firstName ?? "", lastName: a.lastName ?? "", phone: a.phone ?? "",
      country: a.country ?? "", state: a.state ?? "", city: a.city ?? "",
      address: a.address ?? "", apartment: a.apartment ?? "", postalCode: a.postalCode ?? "",
      isDefaultShipping: !!a.isDefaultShipping, isDefaultBilling: !!a.isDefaultBilling,
    })),
    paymentMethods: (user.paymentMethods ?? []).map((p: any) => ({
      _id: String(p._id),
      brand: p.brand, last4: p.last4, expMonth: p.expMonth, expYear: p.expYear,
      holderName: p.holderName ?? "", isDefault: !!p.isDefault,
    })),
    notificationSettings: {
      email: user.notificationSettings?.email ?? true,
      sms: user.notificationSettings?.sms ?? false,
      marketing: user.notificationSettings?.marketing ?? false,
      orderUpdates: user.notificationSettings?.orderUpdates ?? true,
      newsletter: user.notificationSettings?.newsletter ?? false,
    },
    sessions: (user.sessions ?? [])
      .map((s: any) => ({ sessionId: s.sessionId, device: s.device, ip: s.ip, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt }))
      .sort((a: any, b: any) => +new Date(b.lastSeenAt) - +new Date(a.lastSeenAt)),
  };
}

export type SafeUser = ReturnType<typeof serializeUser>;
