import { NextResponse } from "next/server";
import { getPaypalSettingsDoc } from "@/lib/payments/paypalSettings";

export const dynamic = "force-dynamic";

// Public — the storefront checkout calls this to decide whether to render
// the PayPal option at all. Only ever returns the public Client ID, never
// the secret.
export async function GET() {
  const settings = await getPaypalSettingsDoc();
  const gw = settings.paymentGateways?.paypal;
  const enabled = !!gw?.enabled && !!gw?.clientId && !!gw?.clientSecretEncrypted;

  return NextResponse.json({
    enabled,
    clientId: enabled ? gw.clientId : "",
    currency: gw?.currency ?? "GBP",
  });
}
