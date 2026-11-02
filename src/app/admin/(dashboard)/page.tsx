"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package, PoundSterling, Users, ShoppingBag, Clock, CheckCircle2, XCircle, AlertTriangle, Star,
} from "lucide-react";
import { StatCard, Card, Badge } from "@/components/admin/ui";
import MiniChart from "@/components/admin/MiniChart";
import { formatPrice } from "@/lib/utils";

interface DashboardData {
  kpis: {
    todaysOrders: number; todaysRevenue: number; totalCustomers: number; totalProducts: number;
    pendingOrders: number; completedOrders: number; cancelledOrders: number; lowStockCount: number;
  };
  recentOrders: { _id: string; orderNumber: string; email: string; total: number; paymentStatus: string; fulfillmentStatus: string; createdAt: string }[];
  latestCustomers: { _id: string; email: string; firstName: string; lastName: string; createdAt: string }[];
  recentReviews: { _id: string; author: string; rating: number; title?: string; product?: { name: string; slug: string } }[];
  revenueChart: { date: string; revenue: number }[];
  ordersChart: { date: string; count: number }[];
  topProducts: { _id: string; name: string; slug: string; salesCount: number; price: number }[];
  lowStockProducts: { name: string; slug: string; sku: string; stock: number }[];
  recentActivity: { _id: string; message: string; createdAt: string }[];
}

const weekdayLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short" });

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch("/api/admin/dashboard").then((res) => res.json()).then(setData).catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 rounded-brand bg-paper-2 dark:bg-[#1a1712] animate-pulse" />)}
      </div>
    );
  }

  const { kpis } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold">Dashboard</h1>
        <p className="text-[12.5px] text-stone mt-1">An overview of today&apos;s store activity.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Today's orders" value={kpis.todaysOrders} icon={<Package size={15} />} />
        <StatCard label="Today's revenue" value={formatPrice(kpis.todaysRevenue)} icon={<PoundSterling size={15} />} />
        <StatCard label="Customers" value={kpis.totalCustomers} icon={<Users size={15} />} />
        <StatCard label="Products" value={kpis.totalProducts} icon={<ShoppingBag size={15} />} />
        <StatCard label="Pending orders" value={kpis.pendingOrders} icon={<Clock size={15} />} />
        <StatCard label="Completed orders" value={kpis.completedOrders} icon={<CheckCircle2 size={15} />} />
        <StatCard label="Cancelled orders" value={kpis.cancelledOrders} icon={<XCircle size={15} />} />
        <StatCard label="Low stock" value={kpis.lowStockCount} icon={<AlertTriangle size={15} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Revenue" description="Last 7 days">
          <MiniChart data={data.revenueChart.map((d) => ({ label: weekdayLabel(d.date), value: d.revenue }))} formatValue={(v) => formatPrice(v)} />
        </Card>
        <Card title="Orders" description="Last 7 days">
          <MiniChart data={data.ordersChart.map((d) => ({ label: weekdayLabel(d.date), value: d.count }))} />
        </Card>
      </div>

      <Card
        title="Recent orders"
        action={<Link href="/admin/orders" className="text-[11px] uppercase tracking-wide underline hover:text-stone transition">View all</Link>}
      >
        {data.recentOrders.length === 0 ? (
          <p className="text-[12.5px] text-stone">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-line dark:divide-[#332e26]">
            {data.recentOrders.map((o) => (
              <li key={o._id} className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/admin/orders/${o._id}`} className="font-mono text-[13px] hover:underline">{o.orderNumber}</Link>
                  <div className="text-[11.5px] text-stone mt-0.5 truncate">{o.email}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge tone={o.fulfillmentStatus === "delivered" ? "success" : o.fulfillmentStatus === "cancelled" ? "danger" : "neutral"}>{o.fulfillmentStatus}</Badge>
                  <Badge tone={o.paymentStatus === "paid" ? "success" : o.paymentStatus === "failed" ? "danger" : "neutral"}>{o.paymentStatus}</Badge>
                  <span className="font-mono text-[13px]">{formatPrice(o.total)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Latest customers" action={<Link href="/admin/customers" className="text-[11px] uppercase tracking-wide underline hover:text-stone transition">View all</Link>}>
          {data.latestCustomers.length === 0 ? <p className="text-[12.5px] text-stone">No customers yet.</p> : (
            <ul className="space-y-3">
              {data.latestCustomers.map((c) => (
                <li key={c._id}>
                  <Link href={`/admin/customers/${c._id}`} className="text-[13px] hover:underline">
                    {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Guest"}
                  </Link>
                  <div className="text-[11px] text-stone">{c.email}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Top selling products" action={<Link href="/admin/products" className="text-[11px] uppercase tracking-wide underline hover:text-stone transition">View all</Link>}>
          {data.topProducts.length === 0 ? <p className="text-[12.5px] text-stone">No sales yet.</p> : (
            <ul className="space-y-3">
              {data.topProducts.map((p) => (
                <li key={p._id} className="flex items-center justify-between gap-2">
                  <Link href={`/admin/products/${p._id}`} className="text-[13px] hover:underline truncate">{p.name}</Link>
                  <span className="text-[11.5px] text-stone font-mono shrink-0">{p.salesCount} sold</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Low inventory alerts" action={<Link href="/admin/inventory" className="text-[11px] uppercase tracking-wide underline hover:text-stone transition">View all</Link>}>
          {data.lowStockProducts.length === 0 ? <p className="text-[12.5px] text-stone">All products well stocked.</p> : (
            <ul className="space-y-3">
              {data.lowStockProducts.map((p) => (
                <li key={p.sku} className="flex items-center justify-between gap-2">
                  <span className="text-[13px] truncate">{p.name}</span>
                  <Badge tone={p.stock === 0 ? "danger" : "warning"}>{p.stock === 0 ? "Out of stock" : `${p.stock} left`}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Recent reviews" action={<Link href="/admin/reviews" className="text-[11px] uppercase tracking-wide underline hover:text-stone transition">View all</Link>}>
          {data.recentReviews.length === 0 ? <p className="text-[12.5px] text-stone">No reviews yet.</p> : (
            <ul className="space-y-3">
              {data.recentReviews.map((r) => (
                <li key={r._id}>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-0.5 text-[#b8860b]">
                      {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={11} className={i < r.rating ? "fill-current" : ""} />)}
                    </span>
                    <span className="text-[12.5px] font-medium">{r.author}</span>
                  </div>
                  <p className="text-[12px] text-stone mt-0.5 truncate">{r.title || r.product?.name}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent activity">
          {data.recentActivity.length === 0 ? <p className="text-[12.5px] text-stone">Nothing yet.</p> : (
            <ul className="space-y-3">
              {data.recentActivity.map((a) => (
                <li key={a._id}>
                  <p className="text-[12.5px]">{a.message}</p>
                  <p className="text-[10.5px] text-stone mt-0.5">{new Date(a.createdAt).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
