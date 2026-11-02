import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { OrderModel } from "@/models/Order";
import { getOrCreateAccountUser } from "@/lib/account";
import { requireCustomer } from "@/lib/customerAuth";
import { createPendingOrder, OrderCreationError } from "@/lib/orderCreation";
import { checkRateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// GET — order history for the current account (see /account/orders). Scoped
// by both `user` (once linked, see below) and `email` so orders placed
// before this account existed still show up once the same email is used.
export async function GET() {
  await dbConnect();
  const account = await getOrCreateAccountUser();

  const or: Record<string, unknown>[] = [{ user: account._id }];
  if (account.email) or.push({ email: account.email });

  const orders = await OrderModel.find({ $or: or })
    .sort({ createdAt: -1 })
    .select("orderNumber createdAt items total paymentStatus fulfillmentStatus")
    .lean<any[]>();

  const items = orders.map((o) => ({
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    itemCount: (o.items ?? []).reduce((n: number, i: any) => n + (i.quantity ?? 1), 0),
    total: o.total,
    paymentStatus: o.paymentStatus,
    fulfillmentStatus: o.fulfillmentStatus,
  }));

  return NextResponse.json({ items });
}

// Guests may not check out — this is enforced here (not just in the
// checkout page's UI) so a script hitting this endpoint directly can't
// bypass the login modal gate. Checked before any existing order-creation
// logic runs; createPendingOrder() itself is untouched.
export async function POST(req: NextRequest) {
  const customer = await requireCustomer();
  if (!customer) return NextResponse.json({ error: "Please log in to complete checkout." }, { status: 401 });

  // Keyed by account, not IP — this route is already authenticated, and the
  // thing worth throttling is one account hammering order-creation (e.g.
  // repeatedly starting and abandoning checkout against limited stock),
  // not a shared-IP false positive against unrelated customers.
  const accountLimit = checkRateLimit(rateLimitKey("checkout:account", String(customer._id)), {
    windowMs: 5 * 60 * 1000,
    max: 20,
  });
  if (!accountLimit.ok) return rateLimitResponse(accountLimit);

  const body = await req.json().catch(() => null);
  const { email, items, shippingAddress, paymentMethod, shippingMethod, coupon, idempotencyKey } = body ?? {};

  await dbConnect();

  try {
    const order = await createPendingOrder({
      email, items, shippingAddress, shippingMethod, coupon,
      paymentMethod: paymentMethod ?? "card",
      idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey : undefined,
    });
    return NextResponse.json({ orderNumber: order.orderNumber, total: order.total }, { status: 201 });
  } catch (err) {
    if (err instanceof OrderCreationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
