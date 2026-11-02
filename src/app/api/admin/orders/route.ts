import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { OrderModel } from "@/models/Order";
import { requireAdmin } from "@/lib/adminAuth";
import { escapeRegex } from "@/lib/search";
import { releaseAbandonedOrderStock } from "@/lib/paypalAbandonedCheckout";
import { captureError } from "@/lib/errorMonitoring";

export const dynamic = "force-dynamic";

// GET — list orders for the admin Orders section: search by order number or
// email, filter by fulfillment/payment status, paginated.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();

  // Opportunistic sweep, same pattern as the ImportJob cleanup on the
  // Import Center's own list route — no cron/scheduler exists in this app
  // (see docs/DEPLOYMENT.md), so a lazy pass tied to an existing,
  // already-admin-authenticated read is the lowest-risk way to release
  // stock reserved by abandoned checkouts. Best-effort: a failure here
  // must never break the admin's ability to view orders, but must still be
  // reported rather than silently swallowed.
  await releaseAbandonedOrderStock().catch((err) => captureError(err, { context: "abandoned order stock sweep" }));

  const sp = req.nextUrl.searchParams;

  const filter: Record<string, unknown> = {};
  const q = sp.get("q")?.trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ orderNumber: rx }, { email: rx }];
  }
  const fulfillmentStatus = sp.get("fulfillmentStatus");
  if (fulfillmentStatus) filter.fulfillmentStatus = fulfillmentStatus;
  const paymentStatus = sp.get("paymentStatus");
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  // Optional date range — used by the Reports section to reuse this same
  // endpoint instead of standing up a parallel orders query there.
  const from = sp.get("from");
  const to = sp.get("to");
  if (from || to) {
    filter.createdAt = {
      ...(from ? { $gte: new Date(from) } : {}),
      ...(to ? { $lte: new Date(to) } : {}),
    };
  }

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(500, Number(sp.get("limit")) || 20);

  const [items, total] = await Promise.all([
    OrderModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    OrderModel.countDocuments(filter),
  ]);

  return NextResponse.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
}
