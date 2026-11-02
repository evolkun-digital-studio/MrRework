import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { OrderModel } from "@/models/Order";
import { getOrCreateAccountUser } from "@/lib/account";

export const dynamic = "force-dynamic";

// GET — a single order's full detail, for /account/orders/[orderNumber].
// Authorized to the requesting account only (by linked user id, falling back
// to email match for orders placed before accounts existed) — never returns
// another customer's order.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  await dbConnect();
  const account = await getOrCreateAccountUser();

  const order = await OrderModel.findOne({ orderNumber }).lean<any>();
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const owned = (order.user && String(order.user) === String(account._id)) || (account.email && order.email === account.email);
  if (!owned) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  // paymentMetadata is the raw PayPal capture/webhook payload, kept only for
  // internal support/debugging (see Order model) — not meant to round-trip
  // to the customer.
  const { paymentMetadata, ...safeOrder } = order;
  return NextResponse.json({ order: safeOrder });
}
