import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { getPaypalSettingsDoc, getPaypalCredentials, setPaypalConnectionStatus } from "@/lib/payments/paypalSettings";
import { testPaypalConnection } from "@/lib/payments/paypalClient";

export const dynamic = "force-dynamic";

export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const settings = await getPaypalSettingsDoc();
  const gw = settings.paymentGateways?.paypal;
  if (!gw?.clientId || !gw?.clientSecretEncrypted) {
    return NextResponse.json({ error: "Client ID and Client Secret must be saved before testing the connection." }, { status: 400 });
  }

  // getPaypalCredentials() decrypts the stored secret — this throws if the
  // ciphertext can't be decrypted (e.g. ENCRYPTION_KEY was rotated after the
  // secret was saved), which must surface as a clean, actionable error, not
  // an unhandled 500.
  let result: { ok: boolean; message: string };
  try {
    result = await testPaypalConnection(getPaypalCredentials(gw));
  } catch {
    result = { ok: false, message: "Stored credentials could not be read. Re-enter the Client Secret and save before testing again." };
  }
  const now = new Date();
  await setPaypalConnectionStatus(result.ok ? "connected" : "error", now);

  // Never logs credentials — only the admin, the environment, and whether it succeeded.
  logActivity({
    type: "gateway_updated",
    adminUserId: String(admin._id),
    targetType: "PaymentGateway",
    targetId: "paypal",
    message: `${admin.email} tested the PayPal ${gw.environment} connection: ${result.ok ? "success" : "failed"}.`,
  });

  return NextResponse.json({ ...result, status: result.ok ? "connected" : "error", lastVerifiedAt: now });
}
