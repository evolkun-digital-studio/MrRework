import { NextRequest, NextResponse } from "next/server";
import { getOrCreateAccountUser, serializeUser } from "@/lib/account";

export const dynamic = "force-dynamic";

const BRANDS = ["visa", "mastercard", "amex", "other"];

// GET — list saved (display-only) payment methods.
export async function GET() {
  const user = await getOrCreateAccountUser();
  return NextResponse.json({ items: serializeUser(user).paymentMethods });
}

// POST — save a card for display purposes only. Deliberately only ever
// accepts the last 4 digits, never a full card number or CVV — this route
// (and the whole feature) is UI-only, ready to be replaced by a real Stripe
// SetupIntent/PaymentMethod flow later (see `gatewayId` on the schema).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { brand, last4, expMonth, expYear, holderName, isDefault } = body;

  if (!BRANDS.includes(brand)) return NextResponse.json({ error: "Invalid card brand." }, { status: 400 });
  if (!/^\d{4}$/.test(String(last4 ?? ""))) return NextResponse.json({ error: "last4 must be exactly 4 digits." }, { status: 400 });
  const month = Number(expMonth), year = Number(expYear);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid expiry month." }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < new Date().getFullYear()) {
    return NextResponse.json({ error: "Invalid or expired year." }, { status: 400 });
  }

  const user = await getOrCreateAccountUser();
  const isFirst = user.paymentMethods.length === 0;
  const card = {
    brand, last4: String(last4), expMonth: month, expYear: year,
    holderName: String(holderName ?? "").trim().slice(0, 80),
    isDefault: isFirst || !!isDefault,
  };
  if (card.isDefault) for (const c of user.paymentMethods) c.isDefault = false;

  user.paymentMethods.push(card);
  await user.save();

  return NextResponse.json({ items: serializeUser(user).paymentMethods }, { status: 201 });
}
