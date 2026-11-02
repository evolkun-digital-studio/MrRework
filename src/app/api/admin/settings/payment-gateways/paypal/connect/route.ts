import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { testPaypalConnection, fetchMerchantIdentity } from "@/lib/payments/paypalClient";
import { saveConnectedPaypalCredentials, serializePaypalSettings } from "@/lib/payments/paypalSettings";
import { checkRateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// Admin submits Client ID/Client Secret/(optional) Merchant ID from the
// settings page. PayPal has no "which environment is this credential pair
// for" lookup — sandbox and live are separate API hosts — so the only way
// to find out is to try authenticating against one, then the other. Live is
// tried first since a merchant connecting their real account cares about
// that one; reuses testPaypalConnection() (the exact same auth check the
// legacy "Test Connection" action used) rather than reimplementing it.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  // Each attempt makes a live outbound call to PayPal's OAuth endpoint
  // (twice, live then sandbox) — rate-limited per admin to stop repeated
  // credential-testing from hammering PayPal's API or this app's outbound
  // connection pool.
  const adminLimit = checkRateLimit(rateLimitKey("paypal-connect:admin", String(admin._id)), {
    windowMs: 15 * 60 * 1000,
    max: 10,
  });
  if (!adminLimit.ok) return rateLimitResponse(adminLimit);

  const body = await req.json().catch(() => null);
  const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
  const clientSecret = typeof body?.clientSecret === "string" ? body.clientSecret.trim() : "";
  const manualMerchantId = typeof body?.merchantId === "string" ? body.merchantId.trim() : "";

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Client ID and Client Secret are required." }, { status: 400 });
  }

  let environment: "sandbox" | "live" | null = null;
  let lastMessage = "";
  for (const env of ["live", "sandbox"] as const) {
    const result = await testPaypalConnection({ clientId, clientSecret, environment: env });
    if (result.ok) { environment = env; break; }
    lastMessage = result.message;
  }
  if (!environment) {
    return NextResponse.json(
      { error: lastMessage || "Could not authenticate with PayPal using the provided credentials." },
      { status: 400 }
    );
  }

  // Best-effort enrichment — authentication already succeeded above, so a
  // REST app that lacks the identity/userinfo scope still gets connected,
  // just falling back to whatever Merchant ID the admin typed in manually.
  let merchantId = manualMerchantId;
  let merchantEmail = "";
  let accountStatus = "unknown";
  try {
    const identity = await fetchMerchantIdentity({ clientId, clientSecret, environment });
    merchantId = identity.merchantId || manualMerchantId;
    merchantEmail = identity.email;
    accountStatus = identity.accountStatus;
  } catch {
    // Ignored — see comment above.
  }

  const settings = await saveConnectedPaypalCredentials({ clientId, clientSecret, merchantId, merchantEmail, environment });

  logActivity({
    type: "gateway_enabled",
    adminUserId: String(admin._id),
    targetType: "PaymentGateway",
    targetId: "paypal",
    message: `${admin.email} connected PayPal (${environment}, ${accountStatus}) for merchant ${merchantEmail || merchantId || clientId}.`,
  });

  return NextResponse.json({ paypal: serializePaypalSettings(settings) });
}
