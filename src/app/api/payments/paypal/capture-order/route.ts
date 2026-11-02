import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { OrderModel } from "@/models/Order";
import { logActivity } from "@/lib/activityLog";
import { getPaypalSettingsDoc, getPaypalCredentials } from "@/lib/payments/paypalSettings";
import { capturePaypalOrder } from "@/lib/payments/paypalClient";
import { releaseOrderStock } from "@/lib/stockRelease";
import { captureError } from "@/lib/errorMonitoring";
import { sendOrderConfirmation, sendOrderStatusEmail } from "@/lib/orderNotifications";

export const dynamic = "force-dynamic";

// Public (customer checkout, called from the PayPal Buttons' onApprove) —
// the only place a PayPal-funded Order is ever marked "paid". Never trusts
// anything the client sends about payment status/amount; re-fetches the
// capture result from PayPal itself and cross-checks it against the Order's
// own stored total before touching paymentStatus.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const paypalOrderId = body?.paypalOrderId;
  if (!paypalOrderId || typeof paypalOrderId !== "string") {
    return NextResponse.json({ error: "Missing PayPal order id." }, { status: 400 });
  }

  await dbConnect();

  const order = await OrderModel.findOne({ paypalOrderId });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  // Idempotent — a retried/duplicate onApprove call (or a race with the
  // webhook) never re-captures or re-processes an already-paid order. Only
  // ever transitions FROM "pending" — an order the admin already marked
  // "refunded" (or any other non-pending state) must never be silently
  // flipped back to "paid" by a delayed/duplicate client call.
  if (order.paymentStatus === "paid") {
    return NextResponse.json({ orderNumber: order.orderNumber, paymentStatus: order.paymentStatus });
  }
  if (order.paymentStatus !== "pending") {
    return NextResponse.json({ error: "This order is no longer awaiting payment." }, { status: 409 });
  }

  const settings = await getPaypalSettingsDoc();
  const gw = settings.paymentGateways?.paypal;
  if (!gw?.enabled || !gw?.clientId || !gw?.clientSecretEncrypted) {
    return NextResponse.json({ error: "PayPal is not available." }, { status: 400 });
  }

  let paypalOrder;
  try {
    paypalOrder = await capturePaypalOrder(getPaypalCredentials(gw), paypalOrderId);
  } catch {
    return NextResponse.json({ error: "PayPal could not capture this payment." }, { status: 502 });
  }

  const capture = paypalOrder.purchaseUnits?.[0]?.payments?.captures?.[0];
  const amountMatches =
    capture?.amount?.currencyCode === order.currency &&
    Math.abs(Number(capture?.amount?.value ?? NaN) - order.total) < 0.01;

  if (!capture || capture.status !== "COMPLETED" || !amountMatches) {
    // Stock was decremented back when this order was created (create-order
    // route) — a declined/mismatched capture means it never will be paid,
    // so that reservation must be released now, not left locked away from
    // real buyers forever (see the pre-launch certification audit /
    // production hardening sprint).
    order.paymentStatus = "failed";
    order.paymentMetadata = paypalOrder;
    await order.save();
    await releaseOrderStock(order.items).catch((releaseErr) => captureError(releaseErr, { context: "capture-order stock release", orderId: String(order._id) }));
    void sendOrderStatusEmail(order.toObject(), "failed");
    return NextResponse.json({ error: "Payment could not be verified." }, { status: 402 });
  }

  order.paymentStatus = "paid";
  order.paidAt = new Date();
  order.paypalCaptureId = capture.id;
  order.paypalTransactionId = capture.id;
  order.paypalPayerId = paypalOrder.payer?.payerId ?? undefined;
  order.paymentMetadata = paypalOrder;
  await order.save();
  void sendOrderConfirmation(order.toObject());

  logActivity({
    type: "payment_captured",
    targetType: "Order",
    targetId: String(order._id),
    message: `PayPal payment captured for order ${order.orderNumber}.`,
  });

  return NextResponse.json({ orderNumber: order.orderNumber, paymentStatus: order.paymentStatus });
}
