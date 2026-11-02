import { NextRequest, NextResponse } from "next/server";
import { consumeEmailVerificationToken } from "@/lib/customerAuth";
import { checkRateLimit, getClientIp, rateLimitKey, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

function homeUrl(req: NextRequest, params: Record<string, string>): URL {
  const url = new URL("/", process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}

// The link a verification email points at. Consumes the one-time token and
// marks the account verified — nothing more. This is a public,
// unauthenticated GET: it must stay safe/idempotent and must never
// establish a session, because whoever's browser happens to load this URL
// (not necessarily the account owner — links get forwarded, auto-previewed
// by mail clients/scanners, or clicked by someone other than the
// registrant) would otherwise be logged in as that account. A prior
// version of this route did call createCustomerSession() here and also
// merged the *requesting browser's* guest cart/wishlist into the verified
// account — both were removed: this was a full account-takeover /
// session-fixation vulnerability (see the pre-launch certification audit).
// The customer logs in normally afterward, the same as any other visit;
// the guest-cart/wishlist merge already happens at that explicit login
// step (mergeGuestCartIntoUser/mergeGuestWishlistIntoUser are still called
// from the real login path in customerAuth.ts — untouched).
export async function GET(req: NextRequest) {
  // Throttles automated token-guessing against this public, unauthenticated
  // link — the token itself is high-entropy, but this is defense-in-depth.
  const ip = getClientIp(req);
  const ipLimit = checkRateLimit(rateLimitKey("verify-email:ip", ip), { windowMs: 15 * 60 * 1000, max: 30 });
  if (!ipLimit.ok) return rateLimitResponse(ipLimit);

  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return NextResponse.redirect(homeUrl(req, { authError: "invalid_token" }));

  const user = await consumeEmailVerificationToken(token);
  if (!user) return NextResponse.redirect(homeUrl(req, { authError: "invalid_token" }));

  return NextResponse.redirect(homeUrl(req, { verified: "1" }));
}
