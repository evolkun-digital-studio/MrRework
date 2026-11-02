"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { Card, Table, Th, Td, Badge, Input, Select, EmptyState, Button } from "@/components/admin/ui";
import { formatPrice } from "@/lib/utils";

interface OrderRow {
  _id: string; orderNumber: string; email: string; total: number;
  paymentStatus: string; fulfillmentStatus: string; createdAt: string;
}

const FULFILLMENT_OPTIONS = [
  { value: "", label: "All statuses" },
  ...["unfulfilled", "pending", "confirmed", "processing", "packed", "shipped", "delivered", "cancelled", "returned"].map((s) => ({ value: s, label: s })),
];
const PAYMENT_OPTIONS = [
  { value: "", label: "All payments" },
  ...["pending", "paid", "failed", "refunded"].map((s) => ({ value: s, label: s })),
];

function fulfillmentTone(status: string): "success" | "danger" | "warning" | "neutral" {
  if (status === "delivered") return "success";
  if (status === "cancelled" || status === "returned") return "danger";
  if (status === "shipped" || status === "packed" || status === "processing") return "warning";
  return "neutral";
}
function paymentTone(status: string): "success" | "danger" | "neutral" {
  if (status === "paid") return "success";
  if (status === "failed") return "danger";
  return "neutral";
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [q, setQ] = useState("");
  const [fulfillmentStatus, setFulfillmentStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      const sp = new URLSearchParams({ page: String(page), limit: "20" });
      if (q.trim()) sp.set("q", q.trim());
      if (fulfillmentStatus) sp.set("fulfillmentStatus", fulfillmentStatus);
      if (paymentStatus) sp.set("paymentStatus", paymentStatus);
      fetch(`/api/admin/orders?${sp}`)
        .then((res) => res.json())
        .then((data) => { setOrders(data.items ?? []); setTotal(data.total ?? 0); setPages(data.pages ?? 1); })
        .catch(() => setOrders([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, fulfillmentStatus, paymentStatus, page]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold">Orders</h1>
        <p className="text-[12.5px] text-stone mt-1">{total} total orders.</p>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="flex-1 min-w-[200px]"><Input placeholder="Search order number or email…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <div className="w-48"><Select options={FULFILLMENT_OPTIONS} value={fulfillmentStatus} onChange={(e) => { setFulfillmentStatus(e.target.value); setPage(1); }} /></div>
          <div className="w-40"><Select options={PAYMENT_OPTIONS} value={paymentStatus} onChange={(e) => { setPaymentStatus(e.target.value); setPage(1); }} /></div>
        </div>

        {orders === null ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-11 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
        ) : orders.length === 0 ? (
          <EmptyState icon={<Package size={28} strokeWidth={1.3} />} title="No orders found" description="Try adjusting your search or filters." />
        ) : (
          <>
            <Table>
              <thead><tr><Th>Order</Th><Th>Date</Th><Th>Customer</Th><Th>Fulfillment</Th><Th>Payment</Th><Th className="text-right">Total</Th><Th /></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o._id}>
                    <Td><span className="font-mono">{o.orderNumber}</span></Td>
                    <Td>{new Date(o.createdAt).toLocaleDateString()}</Td>
                    <Td className="max-w-[200px] truncate">{o.email}</Td>
                    <Td><Badge tone={fulfillmentTone(o.fulfillmentStatus)}>{o.fulfillmentStatus}</Badge></Td>
                    <Td><Badge tone={paymentTone(o.paymentStatus)}>{o.paymentStatus}</Badge></Td>
                    <Td className="text-right font-mono">{formatPrice(o.total)}</Td>
                    <Td><Link href={`/admin/orders/${o._id}`} className="text-[11px] uppercase tracking-wide underline hover:text-stone transition">View</Link></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {pages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="text-[12px] text-stone">Page {page} of {pages}</span>
                <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
