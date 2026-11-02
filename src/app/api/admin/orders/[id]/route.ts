import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { OrderModel } from "@/models/Order";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { isValidObjectId, invalidIdResponse, asOptionalString } from "@/lib/validation";
import { releaseOrderStock } from "@/lib/stockRelease";
import { captureError } from "@/lib/errorMonitoring";
import { notifyOrderStatusChange } from "@/lib/orderNotifications";

export const dynamic = "force-dynamic";

const FULFILLMENT_STATUSES = ["unfulfilled", "pending", "confirmed", "processing", "packed", "shipped", "delivered", "cancelled", "returned"];
const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const order = await OrderModel.findById(id).lean<any>();
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  // .lean() returns the raw stored document, so orders created before the
  // `timeline` field existed on this schema come back without that key at
  // all (Mongoose only applies schema defaults through the hydrated
  // Document layer, not .lean()) — normalize it here rather than have every
  // consumer defend against a missing array.
  return NextResponse.json({ order: { ...order, timeline: order.timeline ?? [] } });
}

// PATCH — update fulfillment/payment status. Every fulfillment change is
// appended to the order's own timeline (see the Order model) for the
// "View Timeline" feature, and separately logged to ActivityLog for the
// dashboard/audit trail.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  await dbConnect();
  const order = await OrderModel.findById(id);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  // Captured before either field is overwritten below — notifyOrderStatusChange()
  // (and the existing wasRefunded check) need the pre-mutation values to tell
  // "just transitioned into X" apart from "already was X, admin re-saved the
  // same value" (which must not re-send an email or double-release stock).
  const prevFulfillmentStatus = order.fulfillmentStatus;
  const prevPaymentStatus = order.paymentStatus;

  if ("fulfillmentStatus" in body) {
    if (!FULFILLMENT_STATUSES.includes(body.fulfillmentStatus)) {
      return NextResponse.json({ error: "Invalid fulfillment status." }, { status: 400 });
    }
    order.fulfillmentStatus = body.fulfillmentStatus;
    order.timeline.push({ status: body.fulfillmentStatus, note: body.note ?? "", createdAt: new Date(), adminUser: admin._id });
  }
  const wasRefunded = prevPaymentStatus === "refunded";

  if ("paymentStatus" in body) {
    if (!PAYMENT_STATUSES.includes(body.paymentStatus)) {
      return NextResponse.json({ error: "Invalid payment status." }, { status: 400 });
    }
    order.paymentStatus = body.paymentStatus;
  }

  if ("trackingNumber" in body) order.trackingNumber = asOptionalString(body.trackingNumber) ?? "";
  if ("trackingUrl" in body) order.trackingUrl = asOptionalString(body.trackingUrl) ?? "";

  await order.save();
  void notifyOrderStatusChange({ order: order.toObject(), prevFulfillmentStatus, prevPaymentStatus });

  // Marking an order refunded means those units are coming back into
  // sellable inventory — stock was reserved at order-creation time and,
  // until now, only ever released by the abandoned-checkout sweep or a
  // failed create-order/capture-order call, never here (see the pre-launch
  // certification audit / production hardening sprint). Only fires on the
  // actual transition into "refunded", not a re-save of an order that was
  // already refunded, so it can never double-release the same order's stock.
  if (order.paymentStatus === "refunded" && !wasRefunded) {
    await releaseOrderStock(order.items).catch((err) =>
      captureError(err, { context: "admin order refund stock release", orderId: String(order._id) })
    );
  }

  logActivity({
    type: "order_status_change", adminUserId: String(admin._id), targetType: "Order", targetId: String(order._id),
    message: `${admin.email} updated order ${order.orderNumber} (${order.fulfillmentStatus} / ${order.paymentStatus}).`,
  });

  return NextResponse.json({ order: order.toObject() });
}
