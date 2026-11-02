import { NextRequest, NextResponse } from "next/server";
import { generatePasswordResetToken } from "@/lib/customerAuth";
import { sendMail } from "@/lib/mail";
import { checkRateLimit, getClientIp, rateLimitKey, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const GENERIC_MESSAGE = "If that account exists, we've sent a password reset link.";

// Always returns the same generic response regardless of whether the email
// exists — prevents user enumeration via this public, unauthenticated route.
export async function POST(req: NextRequest) {
  // Rate-limited by IP (general throttle) AND by the submitted email (the
  // real threat this closes: email-bombing one victim's inbox with reset
  // links, which unlimited requests previously allowed outright — see the
  // audit finding). The email-scoped check runs even for an email that
  // doesn't exist, so this can't be used to distinguish "rate limited
  // because it's real" from "not rate limited because it doesn't exist."
  const ip = getClientIp(req);
  const ipLimit = checkRateLimit(rateLimitKey("forgot-password:ip", ip), { windowMs: 15 * 60 * 1000, max: 20 });
  if (!ipLimit.ok) return rateLimitResponse(ipLimit);

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";

  if (email) {
    const emailLimit = checkRateLimit(rateLimitKey("forgot-password:email", email), { windowMs: 15 * 60 * 1000, max: 3 });
    if (!emailLimit.ok) return rateLimitResponse(emailLimit);

    const result = await generatePasswordResetToken(email);
    if (result) {
      const resetUrl = new URL("/reset-password", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
      resetUrl.searchParams.set("token", result.token);
      await sendMail({
        to: result.user.email,
        subject: "Reset your password",
        text: `Reset your password:\n\n${resetUrl.toString()}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
      });
    }
  }

  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}
