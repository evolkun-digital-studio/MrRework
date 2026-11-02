"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { SectionCard, ORDER_STATUS_LABEL, type OrderSummary } from "@/components/account/ui";

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/orders")
      .then((res) => res.json())
      .then((data) => setOrders(data.items ?? []))
      .catch(() => setOrders([]));
  }, []);

  if (orders === null) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-brand bg-paper-2 animate-pulse" />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <SectionCard title="Orders">
        <div className="text-center py-10">
          <Package size={32} strokeWidth={1.2} className="text-stone mx-auto mb-4" />
          <p className="text-[14px] font-medium mb-1">No orders yet</p>
          <p className="text-[12.5px] text-stone mb-5">Your order history will appear here once you place one.</p>
          <Link href="/shop" className="btn btn-ghost !py-2 !px-4 text-[12px]"><span>Continue shopping</span></Link>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((o) => (
        <Link
          key={o.orderNumber}
          href={`/account/orders/${o.orderNumber}`}
          className="block border border-line rounded-brand p-5 hover:border-ink transition"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[13px]">{o.orderNumber}</div>
              <div className="text-[12px] text-stone mt-1">{new Date(o.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[14px]">{formatPrice(o.total)}</div>
              <div className="text-[12px] text-stone mt-1">{o.itemCount} {o.itemCount === 1 ? "item" : "items"}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="text-[10.5px] uppercase tracking-wide border border-line rounded-brand px-2.5 py-1">Payment: {ORDER_STATUS_LABEL[o.paymentStatus] ?? o.paymentStatus}</span>
            <span className="text-[10.5px] uppercase tracking-wide border border-line rounded-brand px-2.5 py-1">Status: {ORDER_STATUS_LABEL[o.fulfillmentStatus] ?? o.fulfillmentStatus}</span>
          </div>
          <span className="inline-block mt-4 text-[11px] uppercase tracking-wide underline">View details</span>
        </Link>
      ))}
    </div>
  );
}
