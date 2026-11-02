import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { OrderModel } from "@/models/Order";
import { UserModel } from "@/models/User";
import { ProductModel } from "@/models/Product";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const days = Math.min(90, Math.max(7, Number(req.nextUrl.searchParams.get("days")) || 30));
  const today = startOfDay(new Date());
  const from = new Date(today);
  from.setDate(from.getDate() - (days - 1));

  const [orders, customers, topProducts, topCategories] = await Promise.all([
    OrderModel.find({ createdAt: { $gte: from } }).select("total items createdAt").lean(),
    UserModel.find({ role: "customer", createdAt: { $gte: from } }).select("createdAt").lean(),
    ProductModel.find().sort({ salesCount: -1 }).limit(10).select("name salesCount price").lean(),
    ProductModel.aggregate([{ $group: { _id: "$category", sales: { $sum: "$salesCount" } } }, { $sort: { sales: -1 } }, { $limit: 8 }]),
  ]);

  const buckets: Record<string, { revenue: number; orders: number; customers: number }> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    buckets[d.toISOString().slice(0, 10)] = { revenue: 0, orders: 0, customers: 0 };
  }
  for (const o of orders as any[]) {
    const key = new Date(o.createdAt).toISOString().slice(0, 10);
    if (buckets[key]) { buckets[key].revenue += o.total ?? 0; buckets[key].orders += 1; }
  }
  for (const c of customers as any[]) {
    const key = new Date(c.createdAt).toISOString().slice(0, 10);
    if (buckets[key]) buckets[key].customers += 1;
  }

  const series = Object.entries(buckets).map(([date, v]) => ({ date, ...v }));
  const totalRevenue = series.reduce((n, d) => n + d.revenue, 0);
  const totalOrders = series.reduce((n, d) => n + d.orders, 0);
  const totalNewCustomers = series.reduce((n, d) => n + d.customers, 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return NextResponse.json({
    days, series,
    summary: { totalRevenue, totalOrders, totalNewCustomers, avgOrderValue },
    topProducts,
    topCategories: topCategories.map((c: any) => ({ category: c._id ?? "Uncategorised", sales: c.sales })),
  });
}
