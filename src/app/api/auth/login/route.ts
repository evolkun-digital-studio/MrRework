import { NextRequest, NextResponse } from "next/server";
import { verifyCustomerCredentials, createCustomerSession } from "@/lib/customerAuth";
import { serializeUser } from "@/lib/account";
import { getOrCreateCartSessionId } from "@/lib/cartSession";
import { mergeGuestCartIntoUser } from "@/lib/cart";
import { mergeGuestWishlistIntoUser } from "@/lib/wishlist";
import { checkRateLimit, getClientIp, rateLimitKey, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const REASON_MESSAGES: Record<string, string> = {
  invalid: "Incorrect email or password.",
  locked: "Too many failed attempts. Try again in 15 minutes.",
  not_verified: "Please verify your email address before logging in.",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const rememberMe = !!body?.rememberMe;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  // Defense-in-depth ahead of the DB-persisted 10-attempt/15-minute lockout
  // in verifyCustomerCredentials() — that lockout is per-account; these two
  // additionally throttle request *rate* by IP (blunts distributed guessing
  // across many emails) and by the submitted email (blunts guessing one
  // account's password before its own lockout even trips).
  const ip = getClientIp(req);
  const ipLimit = checkRateLimit(rateLimitKey("login:ip", ip), { windowMs: 15 * 60 * 1000, max: 30 });
  if (!ipLimit.ok) return rateLimitResponse(ipLimit);
  const emailLimit = checkRateLimit(rateLimitKey("login:email", email), { windowMs: 15 * 60 * 1000, max: 10 });
  if (!emailLimit.ok) return rateLimitResponse(emailLimit);

  const result = await verifyCustomerCredentials(email, password);
  if (result.reason !== "ok" || !result.user) {
    const status = result.reason === "locked" ? 423 : result.reason === "not_verified" ? 403 : 401;
    return NextResponse.json(
      { error: REASON_MESSAGES[result.reason] ?? "Could not log in.", reason: result.reason },
      { status }
    );
  }

  await createCustomerSession(result.user, rememberMe);

  const sessionId = await getOrCreateCartSessionId();
  const userId = String(result.user._id);
  await mergeGuestCartIntoUser(sessionId, userId);
  await mergeGuestWishlistIntoUser(sessionId, userId);

  return NextResponse.json({ user: serializeUser(result.user) });
}
