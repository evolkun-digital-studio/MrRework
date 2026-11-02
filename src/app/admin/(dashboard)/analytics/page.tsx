"use client";
import { useEffect, useState } from "react";
import { Card, StatCard, Select } from "@/components/admin/ui";
import MiniChart from "@/components/admin/MiniChart";
import { formatPrice } from "@/lib/utils";
import { useCategoryNameStore, prettifySlug } from "@/lib/categoryStore";

interface AnalyticsData {
  days: number;
  series: { date: string; revenue: number; orders: number; customers: number }[];
  summary: { totalRevenue: number; totalOrders: number; totalNewCustomers: number; avgOrderValue: number };
  topProducts: { _id: string; name: string; salesCount: number; price: number }[];
  topCategories: { category: string; sales: number }[];
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState("30");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const categoryNames = useCategoryNameStore((s) => s.names);
  const ensureCategoryNamesLoaded = useCategoryNameStore((s) => s.ensureLoaded);

  useEffect(() => {
    fetch(`/api/admin/analytics?days=${days}`).then((res) => res.json()).then(setData).catch(() => setData(null));
  }, [days]);
  useEffect(() => { ensureCategoryNamesLoaded(); }, [ensureCategoryNamesLoaded]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold">Analytics</h1>
          <p className="text-[12.5px] text-stone mt-1">Sales, revenue, orders and customer trends.</p>
        </div>
        <div className="w-40"><Select value={days} onChange={(e) => setDays(e.target.value)} options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} /></div>
      </div>

      {!data ? (
        <div className="h-64 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Revenue" value={formatPrice(data.summary.totalRevenue)} />
            <StatCard label="Orders" value={data.summary.totalOrders} />
            <StatCard label="New customers" value={data.summary.totalNewCustomers} />
            <StatCard label="Avg. order value" value={formatPrice(data.summary.avgOrderValue)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Revenue" description={`Last ${data.days} days`}>
              <MiniChart data={data.series.map((d) => ({ label: shortDate(d.date), value: d.revenue })).filter((_, i) => i % Math.ceil(data.days / 14) === 0)} formatValue={(v) => formatPrice(v)} />
            </Card>
            <Card title="Orders" description={`Last ${data.days} days`}>
              <MiniChart data={data.series.map((d) => ({ label: shortDate(d.date), value: d.orders })).filter((_, i) => i % Math.ceil(data.days / 14) === 0)} />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Top selling products">
              {data.topProducts.length === 0 ? <p className="text-[12.5px] text-stone">No sales yet.</p> : (
                <ul className="space-y-2.5">
                  {data.topProducts.map((p) => (
                    <li key={p._id} className="flex items-center justify-between text-[13px]">
                      <span className="truncate">{p.name}</span>
                      <span className="text-stone font-mono shrink-0">{p.salesCount} sold</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Sales by category">
              {data.topCategories.length === 0 ? <p className="text-[12.5px] text-stone">No data yet.</p> : (
                <ul className="space-y-2.5">
                  {data.topCategories.map((c) => (
                    <li key={c.category} className="flex items-center justify-between text-[13px]">
                      <span>{categoryNames[c.category] ?? prettifySlug(c.category)}</span>
                      <span className="text-stone font-mono">{c.sales} sold</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
