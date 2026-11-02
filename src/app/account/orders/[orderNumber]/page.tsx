"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { Frame } from "@/components/Frame";
import { formatPrice } from "@/lib/utils";
import { SectionCard, Banner } from "@/components/account/ui";
import type { Order } from "@/lib/types";

const FULFILLMENT_STEPS = ["unfulfilled", "processing", "shipped", "delivered"] as const;
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", paid: "Paid", failed: "Failed", refunded: "Refunded",
  unfulfilled: "Order placed", processing: "Processing", shipped: "Shipped", delivered: "Delivered",
};
const SHIPPING_LABEL: Record<string, string> = { standard: "Standard Delivery", express: "Express Delivery", pickup: "Collect in Atelier" };

function AddressBlock({ title, address }: { title: string; address: Record<string, any> | undefined }) {
  if (!address) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-stone mb-1.5">{title}</div>
      <p className="text-[13.5px] leading-relaxed">
        {address.firstName} {address.lastName}<br />
        {address.address}{address.apartment ? `, ${address.apartment}` : ""}<br />
        {address.city}{address.state ? `, ${address.state}` : ""} {address.postalCode}<br />
        {address.country}
        {address.phone && <><br />{address.phone}</>}
      </p>
    </div>
  );
}

export default function OrderDetailPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/orders/${orderNumber}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Order not found.");
        setOrder(data.order);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Order not found."));
  }, [orderNumber]);

  if (error) {
    return (
      <SectionCard title="Order not found">
        <Banner tone="error">{error}</Banner>
        <Link href="/account/orders" className="inline-block mt-4 text-[12px] uppercase tracking-wide underline">Back to orders</Link>
      </SectionCard>
    );
  }

  if (!order) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 rounded-brand bg-paper-2 animate-pulse" />)}
      </div>
    );
  }

  const stepIndex = FULFILLMENT_STEPS.indexOf(order.fulfillmentStatus as any);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/account/orders" className="text-[11px] uppercase tracking-wide text-stone hover:text-ink transition">← Back to orders</Link>
          <div className="font-mono text-[16px] mt-2">{order.orderNumber}</div>
          <div className="text-[12px] text-stone mt-1">{new Date(order.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="text-[10.5px] uppercase tracking-wide border border-line rounded-brand px-2.5 py-1">Payment: {STATUS_LABEL[order.paymentStatus] ?? order.paymentStatus}</span>
        </div>
      </div>

      <SectionCard title="Order status">
        <div className="relative">
            <div className="absolute top-3.5 left-0 right-0 h-px bg-line" aria-hidden="true" />
            <div
              className="absolute top-3.5 left-0 h-px bg-ink transition-all duration-500"
              style={{ width: `${(Math.max(stepIndex, 0) / (FULFILLMENT_STEPS.length - 1)) * 100}%` }}
              aria-hidden="true"
            />
            <ol className="relative flex items-start justify-between gap-2">
              {FULFILLMENT_STEPS.map((step, i) => {
                const done = i <= stepIndex;
                return (
                  <li key={step} className="flex-1 flex flex-col items-center text-center min-w-0">
                    <span className={`w-7 h-7 rounded-full grid place-items-center border shrink-0 ${done ? "bg-ink border-ink text-paper" : "bg-paper border-line text-stone"}`}>
                      {done ? <Check size={13} /> : <Circle size={8} className="fill-current" />}
                    </span>
                    <span className={`text-[11px] uppercase tracking-wide mt-2 truncate w-full ${done ? "text-ink" : "text-stone"}`}>{STATUS_LABEL[step]}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </SectionCard>

      <SectionCard title="Products">
        <div className="divide-y divide-line">
          {order.items.map((item, i) => (
            <div key={i} className="flex gap-4 py-4 first:pt-0 last:pb-0">
              <div className="relative w-16 h-20 rounded-brand overflow-hidden bg-paper-2 shrink-0">
                <Frame src={item.image} alt={item.name} className="absolute inset-0" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-3">
                  <span className="text-[14px] font-medium">{item.name}</span>
                  <span className="font-mono text-[13px] shrink-0">{formatPrice(item.price * item.quantity)}</span>
                </div>
                <div className="text-[12px] text-stone mt-1">{[item.color, item.size].filter(Boolean).join(" · ")} · Qty {item.quantity}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Shipping">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <AddressBlock title="Shipping address" address={order.shippingAddress} />
          <AddressBlock title="Billing address" address={order.billingAddress} />
        </div>
        <div className="mt-5 pt-5 border-t border-line text-[13.5px]">
          <span className="text-stone">Shipping method: </span>{SHIPPING_LABEL[order.shippingMethod] ?? order.shippingMethod}
        </div>
      </SectionCard>

      <SectionCard title="Totals">
        <dl className="space-y-2 text-[13.5px]">
          <div className="flex justify-between"><dt className="text-stone">Subtotal</dt><dd className="font-mono">{formatPrice(order.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-stone">Shipping</dt><dd className="font-mono">{order.shipping === 0 ? "Free" : formatPrice(order.shipping)}</dd></div>
          {order.tax > 0 && <div className="flex justify-between"><dt className="text-stone">Tax</dt><dd className="font-mono">{formatPrice(order.tax)}</dd></div>}
          {order.discount > 0 && <div className="flex justify-between"><dt className="text-stone">Discount</dt><dd className="font-mono">-{formatPrice(order.discount)}</dd></div>}
          <div className="flex justify-between pt-2 mt-2 border-t border-line text-[14px] font-medium"><dt>Total</dt><dd className="font-mono">{formatPrice(order.total)}</dd></div>
        </dl>
      </SectionCard>
    </div>
  );
}
