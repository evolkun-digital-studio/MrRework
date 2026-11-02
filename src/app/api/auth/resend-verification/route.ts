import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { generateEmailVerificationToken } from "@/lib/customerAuth";
import { sendVerificationEmail } from "@/lib/mail";
import { checkRateLimit, getClientIp, rateLimitKey, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const GENERIC_MESSAGE = "If that account exists and isn't verified yet, we've sent a new verification email.";

// Always returns the same generic response regardless of whether the email
// exists or is already verified — this is a public, unauthenticated
// endpoint, so it must not leak which emails are registered.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipLimit = checkRateLimit(rateLimitKey("resend-verification:ip", ip), { windowMs: 15 * 60 * 1000, max: 20 });
  if (!ipLimit.ok) return rateLimitResponse(ipLimit);

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (email) {
    // Keyed by the submitted email string itself (not by DB match), so a
    // nonexistent email gets rate-limited identically to a real one — the
    // enumeration-resistance of the generic response above is preserved.
    const emailLimit = checkRateLimit(rateLimitKey("resend-verification:email", email), { windowMs: 15 * 60 * 1000, max: 3 });
    if (!emailLimit.ok) return rateLimitResponse(emailLimit);

    await dbConnect();
    const user = await UserModel.findOne({ email, role: "customer" });
    if (user && !user.emailVerified) {
      const token = await generateEmailVerificationToken(user);
      const verifyUrl = new URL("/api/auth/verify-email", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
      verifyUrl.searchParams.set("token", token);
      await sendVerificationEmail(user.email, verifyUrl.toString());
    }
  }

  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}
