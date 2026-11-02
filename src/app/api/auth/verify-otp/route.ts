import { NextRequest, NextResponse } from "next/server";
import { consumeEmailVerificationOtp, createCustomerSession } from "@/lib/customerAuth";
import { serializeUser } from "@/lib/account";
import { getOrCreateCartSessionId } from "@/lib/cartSession";
import { mergeGuestCartIntoUser } from "@/lib/cart";
import { mergeGuestWishlistIntoUser } from "@/lib/wishlist";
import { checkRateLimit, getClientIp, rateLimitKey, rateLimitResponse } from "@/lib/rateLimit";
import { logActivity } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

const REASON_MESSAGES: Record<string, string> = {
  not_found: "We couldn't find a pending verification for that email. Please register again.",
  already_verified: "This email is already verified. You can log in.",
  expired: "This verification code has expired. Please request a new one.",
  incorrect: "The verification code is incorrect.",
  max_attempts: "Too many incorrect attempts. Please request a new verification code.",
};

// Verifies a submitted OTP and, on success, logs the customer straight in
// (creates a session + merges their guest cart/wishlist, identical to the
// real login path) — unlike the legacy link-based /api/auth/verify-email
// GET route, this is safe to auto-login from: it's a POST the user
// triggered by manually typing a code they read from their own inbox, not
// a GET a link-scanning bot or a forwarded email could trigger on their
// behalf (see that route's own comment for the vulnerability this avoids).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const emailInput = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const otp = typeof body?.otp === "string" ? body.otp.trim() : "";

  if (!emailInput || !otp) {
    return NextResponse.json({ error: "Email and verification code are required." }, { status: 400 });
  }

  // Defense-in-depth ahead of consumeEmailVerificationOtp's own DB-
  // persisted MAX_OTP_ATTEMPTS cap (the real, non-bypassable-by-IP-
  // rotation limit) — this throttles request *rate*, the same dual-layer
  // pattern as admin/customer login.
  const ip = getClientIp(req);
  const ipLimit = checkRateLimit(rateLimitKey("verify-otp:ip", ip), { windowMs: 15 * 60 * 1000, max: 20 });
  if (!ipLimit.ok) return rateLimitResponse(ipLimit);
  const emailLimit = checkRateLimit(rateLimitKey("verify-otp:email", emailInput), { windowMs: 15 * 60 * 1000, max: 10 });
  if (!emailLimit.ok) return rateLimitResponse(emailLimit);

  const result = await consumeEmailVerificationOtp(emailInput, otp);

  if (result.reason !== "ok") {
    // Never logs the submitted code — only that an attempt happened and
    // why it didn't succeed.
    logActivity({
      type: result.reason === "expired" ? "customer_otp_expired_attempt" : "customer_otp_verify_failure",
      targetType: "User",
      targetId: result.user ? String(result.user._id) : "",
      message: `OTP verification failed for ${emailInput}: ${result.reason}.`,
    });
    const status = result.reason === "max_attempts" ? 429 : result.reason === "not_found" ? 404 : 400;
    return NextResponse.json({ error: REASON_MESSAGES[result.reason] ?? "Could not verify this code.", reason: result.reason }, { status });
  }

  logActivity({
    type: "customer_otp_verify_success",
    targetType: "User",
    targetId: String(result.user._id),
    message: `${emailInput} verified their email via OTP.`,
  });

  await createCustomerSession(result.user, true);

  const sessionId = await getOrCreateCartSessionId();
  const userId = String(result.user._id);
  await mergeGuestCartIntoUser(sessionId, userId);
  await mergeGuestWishlistIntoUser(sessionId, userId);

  return NextResponse.json({ user: serializeUser(result.user) });
}
