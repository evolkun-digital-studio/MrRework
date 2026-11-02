import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCredentials, createAdminSession, serializeAdminUser } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { checkRateLimit, getClientIp, rateLimitKey, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { email, password, rememberMe } = body ?? {};

  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  // Same defense-in-depth reasoning as the customer login route, ahead of
  // adminAuth.ts's own DB-persisted 10-attempt/15-minute lockout — the
  // admin panel is a higher-value target, so this is throttled at least as
  // tightly as the storefront login.
  const ip = getClientIp(req);
  const ipLimit = checkRateLimit(rateLimitKey("admin-login:ip", ip), { windowMs: 15 * 60 * 1000, max: 20 });
  if (!ipLimit.ok) return rateLimitResponse(ipLimit);
  const emailLimit = checkRateLimit(rateLimitKey("admin-login:email", email), { windowMs: 15 * 60 * 1000, max: 10 });
  if (!emailLimit.ok) return rateLimitResponse(emailLimit);

  const user = await verifyAdminCredentials(email, password);
  if (!user) {
    // Deliberately the same message for "no such admin" and "wrong
    // password" so login can't be used to enumerate admin email addresses.
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  await createAdminSession(user, !!rememberMe);
  logActivity({
    type: "admin_login", adminUserId: String(user._id), targetType: "User", targetId: String(user._id),
    message: `${user.email} signed in to the admin panel.`,
  });

  return NextResponse.json({ user: serializeAdminUser(user) });
}
