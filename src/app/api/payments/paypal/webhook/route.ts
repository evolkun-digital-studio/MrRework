import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { OrderModel } from "@/models/Order";
import { logActivity } from "@/lib/activityLog";
import { getPaypalSettingsDoc, getPaypalCredentials } from "@/lib/payments/paypalSettings";
import { verifyPaypalWebhookSignature } from "@/lib/payments/paypalClient";
import { sendOrderConfirmation } from "@/lib/orderNotifications";

export const dynamic = "force-dynamic";

// Defense-in-depth for interrupted client flows — the primary capture path
// is POST /api/payments/paypal/capture-order. This never processes a
// webhook body before its signature is verified against the stored
// Webhook ID, and it only ever moves an Order from pending to paid, never
// the other way around from an unverified or unmatched event.
export async function POST(req: NextRequest) {
  const event = await req.json().catch(() => null);
  if (!event) return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });

  const transmissionId = req.headers.get("paypal-transmission-id") ?? "";
  const transmissionTime = req.headers.get("paypal-transmission-time") ?? "";
  const certUrl = req.headers.get("paypal-cert-url") ?? "";
  const authAlgo = req.headers.get("paypal-auth-algo") ?? "";
  const transmissionSig = req.headers.get("paypal-transmission-sig") ?? "";
  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return NextResponse.json({ error: "Missing webhook signature headers." }, { status: 400 });
  }

  await dbConnect();

  const settings = await getPaypalSettingsDoc();
  const gw = settings.paymentGateways?.paypal;
  if (!gw?.webhookId || !gw?.clientId || !gw?.clientSecretEncrypted) {
    return NextResponse.json({ error: "PayPal is not configured." }, { status: 400 });
  }

  // Anything that stops us from getting a definite verification result
  // (PayPal auth failure, network error, etc.) must be treated the same as
  // "verification failed" — an uncaught throw here would otherwise surface
  // as a raw 500 instead of a clean rejection.
  let verified = false;
  try {
    verified = await verifyPaypalWebhookSignature(getPaypalCredentials(gw), {
      transmissionId, transmissionTime, certUrl, authAlgo, transmissionSig,
      webhookId: gw.webhookId,
      webhookEvent: event,
    });
  } catch {
    verified = false;
  }
  if (!verified) {
    return NextResponse.json({ error: "Webhook signature verification failed." }, { status: 400 });
  }

  logActivity({ type: "webhook_received", targetType: "PaymentGateway", targetId: "paypal", message: `PayPal webhook received: ${event.event_type ?? "unknown"}.` });

  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
    return NextResponse.json({ received: true });
  }

  const resource = event.resource ?? {};
  const paypalOrderId: string | undefined = resource.supplementary_data?.related_ids?.order_id;
  const order = paypalOrderId ? await OrderModel.findOne({ paypalOrderId }) : null;
  // Only ever transitions FROM "pending" — never re-applies to an order
  // that's already paid (idempotent against redelivery/replay of the same
  // event) and never resurrects one an admin has since marked "refunded"/
  // "failed" from a stale or replayed webhook.
  if (!order || order.paymentStatus !== "pending") {
    return NextResponse.json({ received: true });
  }

  const amountMatches =
    resource.amount?.currency_code === order.currency &&
    Math.abs(Number(resource.amount?.value ?? NaN) - order.total) < 0.01;
  if (!amountMatches) {
    return NextResponse.json({ received: true });
  }

  order.paymentStatus = "paid";
  order.paidAt = new Date();
  order.paypalCaptureId = resource.id;
  order.paypalTransactionId = resource.id;
  order.paymentMetadata = event;
  await order.save();
  void sendOrderConfirmation(order.toObject());

  return NextResponse.json({ received: true });
}
