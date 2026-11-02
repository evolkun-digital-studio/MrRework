import "server-only";
import { OrderModel } from "@/models/Order";
import { releaseOrderStock } from "@/lib/stockRelease";

// How long an order can sit "pending" (created, stock already decremented
// — see orderCreation.ts — but payment never completed) before it's
// treated as abandoned. Generous relative to how long a real PayPal popup
// flow takes, so no legitimate slow customer is ever caught by this.
const ABANDONED_ORDER_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

// Releases the stock reserved by checkouts that were started (an Order
// created, stock decremented) but never completed — the customer closed
// the tab, declined at the PayPal step, or otherwise abandoned the flow
// without ever reaching a successful capture. Without this, that stock
// stays locked away from real buyers indefinitely, since nothing else ever
// revisits a "pending" order on its own.
//
// Originally PayPal-only (releaseAbandonedPaypalCheckouts); broadened to
// every payment method — a "card"/other non-PayPal order has no capture
// step at all in this codebase (see docs/ROADMAP.md: those methods don't
// collect real payment yet), so it would otherwise sit "pending" with its
// stock decremented forever, identical in effect to an abandoned PayPal
// checkout, just via a different mechanism (see the pre-launch
// certification audit / production hardening sprint).
//
// Deliberately independent of orderCreation.ts — never imports from or
// modifies it, and only ever acts on orders long after that function has
// already returned. Does not touch capture-order/webhook logic either:
// once a PayPal order is marked "failed" here, a late-arriving capture
// attempt is already safely rejected by capture-order's own existing
// pending-only check (`if (order.paymentStatus !== "pending") return 409`)
// — nothing about that route needed to change for this to be safe. A
// non-PayPal order has no equivalent later step that could race with this
// at all.
//
// Claims each stale order atomically (paymentStatus "pending" -> "failed"
// in one findOneAndUpdate, conditioned on it still being "pending" at that
// exact moment) before releasing its stock, so two concurrent callers of
// this sweep — or a sweep racing a real, in-flight PayPal capture — can
// never both "win" the same order and double-release its stock.
export async function releaseAbandonedOrderStock(): Promise<{ releasedOrders: number }> {
  const cutoff = new Date(Date.now() - ABANDONED_ORDER_MAX_AGE_MS);
  const stale = await OrderModel.find({
    paymentStatus: "pending",
    createdAt: { $lt: cutoff },
  })
    .select("_id items")
    .lean<{ _id: unknown; items: { product: unknown; size?: string; color?: string; quantity: number }[] }[]>();

  if (!stale.length) return { releasedOrders: 0 };

  let releasedOrders = 0;

  for (const order of stale) {
    // Atomic claim — only proceeds if this order is STILL "pending" right
    // now (not already claimed by a concurrent sweep, and not in the
    // middle of a real capture that completed between the query above and
    // this line).
    const claimed = await OrderModel.findOneAndUpdate(
      { _id: order._id, paymentStatus: "pending" },
      { $set: { paymentStatus: "failed" } }
    );
    if (!claimed) continue;

    await releaseOrderStock(order.items ?? []);
    releasedOrders += 1;
  }

  return { releasedOrders };
}
