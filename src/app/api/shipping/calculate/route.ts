import { NextRequest, NextResponse } from "next/server";
import { getShippingSettingsDoc, getShippingSettings } from "@/lib/shipping/shippingSettings";
import { getAvailableShippingMethods } from "@/lib/shipping/shippingCalculator";

export const dynamic = "force-dynamic";

// Public — the reusable shipping calculation service. Given a subtotal and
// (optionally) a destination, returns every currently sellable method with
// its cost/availability/free-shipping-eligibility/estimated delivery. This
// is the same src/lib/shipping/shippingCalculator.ts function
// src/lib/orderCreation.ts calls in-process for the authoritative,
// final repricing — never a duplicate calculation.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const subtotal = Number(body?.subtotal);
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    return NextResponse.json({ error: "Invalid subtotal." }, { status: 400 });
  }

  const settingsDoc = await getShippingSettingsDoc();
  const settings = getShippingSettings(settingsDoc);
  const methods = getAvailableShippingMethods(
    { subtotal, country: body?.country, state: body?.state, city: body?.city },
    settings
  );

  return NextResponse.json({ methods });
}
