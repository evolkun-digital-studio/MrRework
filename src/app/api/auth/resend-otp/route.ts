import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { resendEmailVerificationOtp } from "@/lib/customerAuth";
import { sendEmailVerificationOTP } from "@/lib/mail";
import { checkRateLimit, getClientIp, rateLimitKey, rateLimitResponse } from "@/lib/rateLimit";
import { logActivity } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

const GENERIC_MESSAGE = "If a pending verification exists for that email, a new code has been sent.";

// Unlike /api/auth/forgot-password's fully generic response, the cooldown/
// max-resend outcomes below are surfaced with real state on purpose — the
// "Resend OTP" button's countdown timer needs it to work, and by this point
// the caller is someone actively completing the registration they just
// submitted for this exact email, not a blind guesser probing arbitrary
// addresses. A nonexistent or already-verified email still always gets the
// same generic response, so this endpoint can't be used to enumerate which
// emails are registered.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipLimit = checkRateLimit(rateLimitKey("resend-otp:ip", ip), { windowMs: 15 * 60 * 1000, max: 20 });
  if (!ipLimit.ok) return rateLimitResponse(ipLimit);

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

  const emailLimit = checkRateLimit(rateLimitKey("resend-otp:email", email), { windowMs: 15 * 60 * 1000, max: 10 });
  if (!emailLimit.ok) return rateLimitResponse(emailLimit);

  await dbConnect();
  const user = await UserModel.findOne({ email, role: "customer" });
  if (!user || user.emailVerified) {
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  }

  const result = await resendEmailVerificationOtp(user);

  if (result.reason === "cooldown") {
    return NextResponse.json(
      { ok: false, reason: "cooldown", error: "Please wait before requesting another code.", retryAfterSeconds: result.retryAfterSeconds },
      { status: 429 }
    );
  }
  if (result.reason === "max_resends") {
    return NextResponse.json(
      { ok: false, reason: "max_resends", error: "You've reached the maximum number of resend attempts. Please contact support." },
      { status: 429 }
    );
  }

  logActivity({
    type: "customer_otp_resent",
    targetType: "User",
    targetId: String(user._id),
    message: `Verification OTP resent to ${email}.`,
  });

  await sendEmailVerificationOTP(user.email, user.firstName ?? "", result.otp!);

  return NextResponse.json({ ok: true, message: "A new verification code has been sent.", otpExpiresAt: result.otpExpiresAt });
}
