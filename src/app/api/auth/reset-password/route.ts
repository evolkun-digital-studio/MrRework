import { NextRequest, NextResponse } from "next/server";
import { consumePasswordResetToken, createCustomerSession } from "@/lib/customerAuth";
import { serializeUser } from "@/lib/account";
import { getOrCreateCartSessionId } from "@/lib/cartSession";
import { mergeGuestCartIntoUser } from "@/lib/cart";
import { mergeGuestWishlistIntoUser } from "@/lib/wishlist";
import { checkRateLimit, getClientIp, rateLimitKey, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // The reset token itself is a 256-bit random value (infeasible to brute
  // force regardless), but this still throttles automated guessing/DoS
  // attempts by IP as defense-in-depth.
  const ip = getClientIp(req);
  const ipLimit = checkRateLimit(rateLimitKey("reset-password:ip", ip), { windowMs: 15 * 60 * 1000, max: 20 });
  if (!ipLimit.ok) return rateLimitResponse(ipLimit);

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!token) return NextResponse.json({ error: "Missing reset token." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

  const user = await consumePasswordResetToken(token, password);
  if (!user) return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });

  await createCustomerSession(user, false);

  const sessionId = await getOrCreateCartSessionId();
  const userId = String(user._id);
  await mergeGuestCartIntoUser(sessionId, userId);
  await mergeGuestWishlistIntoUser(sessionId, userId);

  return NextResponse.json({ user: serializeUser(user) });
}
