"use client";
import { use, useEffect, useState } from "react";
import { Printer, Circle } from "lucide-react";
import { Card, Badge, Select, Input, Button, Banner } from "@/components/admin/ui";
import { formatPrice } from "@/lib/utils";

interface OrderItem { name: string; sku: string; size: string; color: string; price: number; quantity: number; image: string }
interface Order {
  _id: string; orderNumber: string; email: string; items: OrderItem[];
  subtotal: number; shipping: number; tax: number; discount: number; total: number;
  shippingMethod: string; paymentMethod: string; paymentStatus: string; fulfillmentStatus: string;
  shippingAddress: Record<string, any>; billingAddress: Record<string, any>;
  timeline: { status: string; note: string; createdAt: string }[];
  trackingNumber?: string; trackingUrl?: string;
  createdAt: string;
}

const FULFILLMENT_STATUSES = ["unfulfilled", "pending", "confirmed", "processing", "packed", "shipped", "delivered", "cancelled", "returned"];
const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"];

function AddressBlock({ title, address }: { title: string; address?: Record<string, any> }) {
  if (!address) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-stone mb-1.5">{title}</div>
      <p className="text-[13px] leading-relaxed">
        {address.firstName} {address.lastName}<br />
        {address.address}{address.apartment ? `, ${address.apartment}` : ""}<br />
        {address.city}{address.state ? `, ${address.state}` : ""} {address.postalCode}<br />
        {address.country}{address.phone && <><br />{address.phone}</>}
      </p>
    </div>
  );
}

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [fulfillmentStatus, setFulfillmentStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [note, setNote] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function load() {
    fetch(`/api/admin/orders/${id}`).then((res) => res.json()).then((data) => {
      setOrder(data.order);
      setFulfillmentStatus(data.order?.fulfillmentStatus ?? "");
      setPaymentStatus(data.order?.paymentStatus ?? "");
      setTrackingNumber(data.order?.trackingNumber ?? "");
      setTrackingUrl(data.order?.trackingUrl ?? "");
    }).catch(() => setOrder(null));
  }
  useEffect(load, [id]);

  async function saveStatus() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fulfillmentStatus, paymentStatus, trackingNumber, trackingUrl, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrder(data.order);
      setNote("");
      setMessage("Order updated.");
    } catch {
      setMessage("Could not update order.");
    } finally {
      setSaving(false);
    }
  }

  if (!order) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 print:block">
        <div>
          <h1 className="text-[20px] font-semibold font-mono">{order.orderNumber}</h1>
          <p className="text-[12.5px] text-stone mt-1">{new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <Button variant="ghost" onClick={() => window.print()} className="print:hidden"><Printer size={14} /> Print invoice</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card title="Products">
            <div className="divide-y divide-line dark:divide-[#332e26]">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div>
                    <div className="text-[13.5px] font-medium">{item.name}</div>
                    <div className="text-[11.5px] text-stone mt-0.5">{[item.color, item.size].filter(Boolean).join(" · ")} · SKU {item.sku} · Qty {item.quantity}</div>
                  </div>
                  <span className="font-mono text-[13px] shrink-0">{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Addresses">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <AddressBlock title="Shipping address" address={order.shippingAddress} />
              <AddressBlock title="Billing address" address={order.billingAddress} />
            </div>
          </Card>

          <Card title="Timeline">
            {order.timeline.length === 0 ? (
              <p className="text-[12.5px] text-stone">No status changes recorded yet.</p>
            ) : (
              <ol className="space-y-4">
                {[...order.timeline].reverse().map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-1"><Circle size={8} className="fill-current text-stone" /></span>
                    <div>
                      <div className="text-[13px]"><Badge tone="neutral">{t.status}</Badge></div>
                      {t.note && <p className="text-[12.5px] mt-1">{t.note}</p>}
                      <p className="text-[11px] text-stone mt-1">{new Date(t.createdAt).toLocaleString()}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-5 print:hidden">
          <Card title="Update status">
            <div className="space-y-3">
              <Select label="Fulfillment status" value={fulfillmentStatus} onChange={(e) => setFulfillmentStatus(e.target.value)} options={FULFILLMENT_STATUSES.map((s) => ({ value: s, label: s }))} />
              <Select label="Payment status" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} options={PAYMENT_STATUSES.map((s) => ({ value: s, label: s }))} />
              <Input label="Tracking number" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="e.g. 1Z999AA10123456784" />
              <Input label="Tracking URL" value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://carrier.example.com/track/…" />
              <div>
                <span className="text-[11px] uppercase tracking-wide text-stone">Note (optional)</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full mt-1.5 bg-transparent border border-line dark:border-[#332e26] rounded-brand px-3 py-2 text-[13px] outline-none focus:border-ink dark:focus:border-[#f3efe8]" />
              </div>
              {message && <Banner>{message}</Banner>}
              <Button onClick={saveStatus} disabled={saving} className="w-full justify-center">{saving ? "Saving…" : "Save changes"}</Button>
            </div>
          </Card>

          <Card title="Summary">
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between"><dt className="text-stone">Subtotal</dt><dd className="font-mono">{formatPrice(order.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-stone">Shipping ({order.shippingMethod})</dt><dd className="font-mono">{order.shipping === 0 ? "Free" : formatPrice(order.shipping)}</dd></div>
              {order.tax > 0 && <div className="flex justify-between"><dt className="text-stone">Tax</dt><dd className="font-mono">{formatPrice(order.tax)}</dd></div>}
              {order.discount > 0 && <div className="flex justify-between"><dt className="text-stone">Discount</dt><dd className="font-mono">-{formatPrice(order.discount)}</dd></div>}
              <div className="flex justify-between pt-2 mt-2 border-t border-line dark:border-[#332e26] text-[14px] font-medium"><dt>Total</dt><dd className="font-mono">{formatPrice(order.total)}</dd></div>
              <div className="flex justify-between pt-2 text-stone"><dt>Payment method</dt><dd className="capitalize">{order.paymentMethod}</dd></div>
              <div className="flex justify-between text-stone"><dt>Customer</dt><dd className="truncate max-w-[160px]">{order.email}</dd></div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
