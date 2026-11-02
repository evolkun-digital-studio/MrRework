"use client";
import { memo } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { SectionCard, ORDER_STATUS_LABEL, type OrderSummary } from "@/components/account/ui";
import EmptyMini from "./EmptyMini";

function RecentOrders({ orders }: { orders: OrderSummary[] | null }) {
  return (
    <SectionCard
      title="Recent orders"
      action={orders && orders.length > 0 ? (
        <Link href="/account/orders" className="text-[11px] uppercase tracking-wide underline hover:text-stone transition shrink-0">
          View all
        </Link>
      ) : undefined}
    >
      {orders === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-brand bg-paper-2 animate-pulse" />)}
        </div>
      ) : orders.length === 0 ? (
        <EmptyMini icon={Package} text="No orders yet — your order history will appear here." ctaLabel="Start shopping" ctaHref="/shop" />
      ) : (
        <ul className="divide-y divide-line">
          {orders.slice(0, 5).map((o) => (
            <li key={o.orderNumber} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-[13px] truncate">{o.orderNumber}</div>
                  <div className="text-[11.5px] text-stone mt-0.5">
                    {new Date(o.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide border border-line rounded-brand px-2 py-1">
                    {ORDER_STATUS_LABEL[o.fulfillmentStatus] ?? o.fulfillmentStatus}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide border border-line rounded-brand px-2 py-1">
                    {ORDER_STATUS_LABEL[o.paymentStatus] ?? o.paymentStatus}
                  </span>
                  <span className="font-mono text-[13px] ml-1">{formatPrice(o.total)}</span>
                  <Link
                    href={`/account/orders/${o.orderNumber}`}
                    className="text-[11px] uppercase tracking-wide underline hover:text-stone transition ml-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink rounded-brand"
                  >
                    View details
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export default memo(RecentOrders);
