import { NextResponse } from "next/server";
import { getShippingSettingsDoc, getShippingSettings } from "@/lib/shipping/shippingSettings";

export const dynamic = "force-dynamic";

// Public — the storefront (cart drawer, checkout, product pages) reads this
// to render live, admin-configured shipping copy/thresholds. Origin
// address is deliberately omitted: it's a calculation input for
// /api/shipping/calculate, not something a customer needs to see.
export async function GET() {
  const settings = await getShippingSettingsDoc();
  const s = getShippingSettings(settings);

  return NextResponse.json({
    flatRate: s.flatRate,
    expressRate: s.expressRate,
    localPickupEnabled: s.localPickupEnabled,
    internationalShippingEnabled: s.internationalShippingEnabled,
    estimatedDeliveryText: s.estimatedDeliveryText,
    returnPolicyText: s.returnPolicyText,
    processingTimeText: s.processingTimeText,
  });
}
