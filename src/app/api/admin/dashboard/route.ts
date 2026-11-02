import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ProductModel } from "@/models/Product";
import { OrderModel } from "@/models/Order";
import { UserModel } from "@/models/User";
import { ReviewModel } from "@/models/Review";
import { ActivityLogModel } from "@/models/ActivityLog";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const PENDING_STATUSES = ["unfulfilled", "pending", "confirmed"];
const LOW_STOCK_THRESHOLD = 5;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();

  const today = startOfDay(new Date());
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // inclusive of today = 7 days

  // Low-stock / out-of-stock — a variant-tracked product qualifies once its
  // variants' stock sums to LOW_STOCK_THRESHOLD or below; a non-variant
  // product qualifies (at stock 0) once `inStock` is false. Previously
  // computed by pulling every product into Node (`ProductModel.find()` with
  // no filter) and summing/filtering in a JS loop — this pushes the same
  // logic into the query itself via $facet, so only the matching documents
  // (and only the fields actually used) ever cross out of MongoDB, and both
  // the capped list and the true total count come back in one round trip
  // instead of computing the total by counting a fully-materialized JS
  // array. Verified byte-for-byte identical output against the old
  // implementation on the live dataset before this change (see Sprint 3
  // write-up) — same 6 items, same order, same total count.
  const lowStockAggPromise = ProductModel.aggregate([
    { $addFields: { _totalVariantStock: { $sum: "$variants.stock" } } },
    {
      $match: {
        $or: [
          { "variants.0": { $exists: true }, _totalVariantStock: { $lte: LOW_STOCK_THRESHOLD } },
          { "variants.0": { $exists: false }, inStock: false },
        ],
      },
    },
    {
      $project: {
        _id: 0, name: 1, slug: 1, sku: 1,
        stock: { $cond: [{ $gt: [{ $size: { $ifNull: ["$variants", []] } }, 0] }, "$_totalVariantStock", 0] },
      },
    },
    { $facet: { items: [{ $limit: 6 }], totalCount: [{ $count: "count" }] } },
  ]);

  const [
    todaysOrders, totalCustomers, totalProducts,
    pendingOrders, completedOrders, cancelledOrders,
    recentOrders, latestCustomers, recentReviews,
    windowOrders, topProducts, activity,
    [lowStockAgg],
  ] = await Promise.all([
    OrderModel.find({ createdAt: { $gte: today } }).select("total").lean(),
    UserModel.countDocuments({ role: "customer" }),
    ProductModel.countDocuments(),
    OrderModel.countDocuments({ fulfillmentStatus: { $in: PENDING_STATUSES } }),
    OrderModel.countDocuments({ fulfillmentStatus: "delivered" }),
    OrderModel.countDocuments({ fulfillmentStatus: "cancelled" }),
    OrderModel.find().sort({ createdAt: -1 }).limit(5).select("orderNumber email total paymentStatus fulfillmentStatus createdAt").lean(),
    UserModel.find({ role: "customer" }).sort({ createdAt: -1 }).limit(5).select("email firstName lastName createdAt").lean(),
    ReviewModel.find().sort({ createdAt: -1 }).limit(5).populate("product", "name slug").lean(),
    OrderModel.find({ createdAt: { $gte: sevenDaysAgo } }).select("total createdAt").lean(),
    ProductModel.find().sort({ salesCount: -1 }).limit(5).select("name slug salesCount price images").lean(),
    ActivityLogModel.find().sort({ createdAt: -1 }).limit(8).lean(),
    lowStockAggPromise,
  ]);

  const todaysRevenue = todaysOrders.reduce((sum: number, o: any) => sum + (o.total ?? 0), 0);
  const lowStockProducts: { name: string; slug: string; sku: string; stock: number }[] = lowStockAgg?.items ?? [];
  const lowStockCount: number = lowStockAgg?.totalCount?.[0]?.count ?? 0;

  // 7-day daily revenue/order buckets for the dashboard charts.
  const buckets: Record<string, { revenue: number; count: number }> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenDaysAgo);
    d.setDate(d.getDate() + i);
    buckets[d.toISOString().slice(0, 10)] = { revenue: 0, count: 0 };
  }
  for (const o of windowOrders as any[]) {
    const key = new Date(o.createdAt).toISOString().slice(0, 10);
    if (buckets[key]) {
      buckets[key].revenue += o.total ?? 0;
      buckets[key].count += 1;
    }
  }
  const revenueChart = Object.entries(buckets).map(([date, v]) => ({ date, revenue: v.revenue }));
  const ordersChart = Object.entries(buckets).map(([date, v]) => ({ date, count: v.count }));

  return NextResponse.json({
    kpis: {
      todaysOrders: todaysOrders.length,
      todaysRevenue,
      totalCustomers,
      totalProducts,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      lowStockCount,
    },
    recentOrders,
    latestCustomers,
    recentReviews,
    revenueChart,
    ordersChart,
    topProducts,
    lowStockProducts,
    recentActivity: activity,
  });
}
