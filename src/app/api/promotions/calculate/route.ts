import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { getOrCreateAccountUser } from "@/lib/account";
import { buildCandidateDiscounts } from "@/lib/promotions/promotionSettings";
import { calculatePromotions } from "@/lib/promotions/promotionEngine";
import type { CartLine } from "@/lib/promotions/promotionValidation";
import { checkRateLimit, getClientIp, rateLimitKey, rateLimitResponse } from "@/lib/rateLimit";
import { asOptionalString } from "@/lib/validation";

export const dynamic = "force-dynamic";

// Public — the one place discount math is ever run for a live preview
// (checkout calls this exactly like it already calls
// /api/shipping/calculate); orderCreation.ts calls the same underlying
// calculatePromotions() in-process for the authoritative, final charge, so
// there is never a second implementation of this arithmetic.
export async function POST(req: NextRequest) {
  // Public/unauthenticated — rate-limited by IP to blunt scripted
  // enumeration of coupon codes against this endpoint, while staying
  // generous enough for a real checkout page's normal live-preview traffic.
  const ip = getClientIp(req);
  const ipLimit = checkRateLimit(rateLimitKey("promotions-calculate:ip", ip), { windowMs: 60 * 1000, max: 30 });
  if (!ipLimit.ok) return rateLimitResponse(ipLimit);

  const body = await req.json().catch(() => null);
  if (Array.isArray(body?.items) && body.items.length > 200) {
    return NextResponse.json({ error: "Too many items." }, { status: 400 });
  }
  const items: CartLine[] = Array.isArray(body?.items)
    ? body.items.map((i: any) => ({ productId: String(i.productId), category: i.category, price: Number(i.price), quantity: Number(i.quantity) }))
    : [];
  const subtotal = Number(body?.subtotal);
  const shipping = Number(body?.shipping) || 0;
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    return NextResponse.json({ error: "Invalid subtotal." }, { status: 400 });
  }

  // A non-string code (array/number/object) previously reached
  // buildCandidateDiscounts()/calculatePromotions() and threw a TypeError
  // (.trim() on a non-string) instead of failing validation cleanly.
  const safeCode = asOptionalString(body?.code);

  await dbConnect();
  const account = await getOrCreateAccountUser();
  const { candidates, customerOrderCount } = await buildCandidateDiscounts(safeCode, account);

  const result = calculatePromotions(
    { subtotal, items, shipping, requestedCode: safeCode, customerOrderCount },
    candidates
  );

  return NextResponse.json(result);
}
