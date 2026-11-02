import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { createPendingOrder, OrderCreationError } from "@/lib/orderCreation";
import { getPaypalSettingsDoc, getPaypalCredentials } from "@/lib/payments/paypalSettings";
import { createPaypalOrder } from "@/lib/payments/paypalClient";
import { requireCustomer } from "@/lib/customerAuth";
import { checkRateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rateLimit";
import { releaseOrderStock } from "@/lib/stockRelease";
import { captureError } from "@/lib/errorMonitoring";

export const dynamic = "force-dynamic";

// Public (customer checkout) — mirrors POST /api/orders's input shape
// exactly, reusing the same createPendingOrder() validation/repricing, then
// additionally creates the matching PayPal Checkout order. The Order is
// created here (paymentStatus: "pending") and only ever flips to "paid" in
// capture-order below, after PayPal itself confirms the payment server-side.
//
// Guests may not check out — enforced here too (not just the checkout
// page's UI) so this endpoint can't be hit directly to bypass the login
// modal gate. Checked before any existing order/PayPal logic runs.
export async function POST(req: NextRequest) {
  const customer = await requireCustomer();
  if (!customer) return NextResponse.json({ error: "Please log in to complete checkout." }, { status: 401 });

  // Same policy/reasoning as POST /api/orders — keyed by account, since this
  // route is authenticated and the concern is one account's repeated
  // create-then-abandon cycles, not a shared-IP false positive.
  const accountLimit = checkRateLimit(rateLimitKey("checkout:account", String(customer._id)), {
    windowMs: 5 * 60 * 1000,
    max: 20,
  });
  if (!accountLimit.ok) return rateLimitResponse(accountLimit);

  const body = await req.json().catch(() => null);
  const { email, items, shippingAddress, shippingMethod, coupon, idempotencyKey } = body ?? {};

  await dbConnect();

  const settings = await getPaypalSettingsDoc();
  const gw = settings.paymentGateways?.paypal;
  if (!gw?.enabled || !gw?.clientId || !gw?.clientSecretEncrypted) {
    return NextResponse.json({ error: "PayPal is not available." }, { status: 400 });
  }

  let order;
  try {
    order = await createPendingOrder({
      email, items, shippingAddress, shippingMethod, coupon, paymentMethod: "paypal",
      idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey : undefined,
    });
  } catch (err) {
    if (err instanceof OrderCreationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  try {
    const paypalOrder = await createPaypalOrder(getPaypalCredentials(gw), {
      total: order.total,
      currency: order.currency || gw.currency || "GBP",
      customId: String(order._id),
      invoiceId: order.orderNumber,
      requestId: String(order._id),
    });
    order.paypalOrderId = paypalOrder.id;
    await order.save();
    return NextResponse.json({ orderNumber: order.orderNumber, paypalOrderId: paypalOrder.id }, { status: 201 });
  } catch (err) {
    // The Order row already exists (pending) but can never be captured
    // without a PayPal order id — mark it failed rather than leaving it
    // looking like an active pending order. createPendingOrder() already
    // decremented stock for these items; releasing it here is required or
    // it stays locked away from real buyers forever — this exact gap
    // (previously just `order.paymentStatus = "failed"` with no stock
    // release) was a silent inventory leak on every ordinary PayPal
    // API failure, not just a rare edge case (see the pre-launch
    // certification audit / production hardening sprint).
    order.paymentStatus = "failed";
    await order.save();
    await releaseOrderStock(order.items).catch((releaseErr) => captureError(releaseErr, { context: "create-order stock release", orderId: String(order._id) }));
    return NextResponse.json({ error: "Could not start the PayPal payment. Please try again." }, { status: 502 });
  }
}
