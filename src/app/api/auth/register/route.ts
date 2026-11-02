import { NextRequest, NextResponse } from "next/server";
import { getOrCreateAccountUser } from "@/lib/account";
import { registerCustomer } from "@/lib/customerAuth";
import { sendEmailVerificationOTP } from "@/lib/mail";
import { checkRateLimit, getClientIp, rateLimitKey, rateLimitResponse } from "@/lib/rateLimit";
import { notifyAdminsOfCustomerRegistration } from "@/lib/adminNotifications";
import { logActivity } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

// Upgrades the current browser's guest shadow account into a real,
// password-protected one (see registerCustomer() for why it's an upgrade,
// not a new document) and emails a 6-digit OTP. No session is created here
// — login is blocked until the OTP is verified on /verify-email (see
// /api/auth/verify-otp and the emailVerified gate in /api/auth/login).
export async function POST(req: NextRequest) {
  // Per-IP only (no account exists yet to key a second limit off) — blunts
  // mass/automated account creation from one source.
  const ip = getClientIp(req);
  const ipLimit = checkRateLimit(rateLimitKey("register:ip", ip), { windowMs: 60 * 60 * 1000, max: 10 });
  if (!ipLimit.ok) return rateLimitResponse(ipLimit);

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" ? body.name : "";

  const user = await getOrCreateAccountUser();
  const result = await registerCustomer(user, email, password, name);
  if (!result.ok || !result.user || !result.otp) {
    return NextResponse.json({ error: result.error ?? "Could not create account." }, { status: 400 });
  }

  logActivity({
    type: "customer_otp_generated",
    targetType: "User",
    targetId: String(result.user._id),
    message: `Verification OTP generated for ${result.user.email} (registration).`,
  });

  await sendEmailVerificationOTP(result.user.email, result.user.firstName ?? "", result.otp);

  logActivity({
    type: "customer_otp_sent",
    targetType: "User",
    targetId: String(result.user._id),
    message: `Verification OTP emailed to ${result.user.email}.`,
  });

  // Deliberately not awaited — this notifies opted-in admins, it isn't
  // part of the customer's own signup flow, so it must never add latency
  // to (or, per notifyAdminsOfCustomerRegistration's own try/catch, ever
  // be able to fail) this response.
  notifyAdminsOfCustomerRegistration(result.user);

  return NextResponse.json({
    ok: true,
    email: result.user.email,
    otpExpiresAt: result.otpExpiresAt,
    message: "We've sent a 6-digit verification code to your email.",
  });
}
