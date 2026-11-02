import Link from "next/link";
import { notFound } from "next/navigation";
import { Frame } from "@/components/Frame";
import { getOrderByNumber } from "@/lib/data";
import { formatPrice } from "@/lib/utils";
import { SHIPPING_OPTIONS } from "@/lib/pricing";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: orderNumber } = await searchParams;
  if (!orderNumber) notFound();

  const order = await getOrderByNumber(orderNumber);
  if (!order) notFound();

  return (
    <div className="px-5 md:px-12 pt-32 pb-24 min-h-[70dvh]">
      <span className="eyebrow">Order {order.orderNumber}</span>
      <h1 className="display mt-3 mb-4" style={{ fontSize: "clamp(30px,4.5vw,60px)" }}>Thank you.</h1>
      <p className="text-stone max-w-[520px] mb-10">
        Your order has been placed and is being prepared. A confirmation has been sent to <span className="text-ink">{order.email}</span>.
      </p>

      <div className="grid lg:grid-cols-[1fr_360px] gap-12 max-w-[900px]">
        <div className="divide-y divide-line border-t border-line">
          {order.items.map((i, idx) => (
            <div key={idx} className="flex gap-5 py-6">
              <div className="relative w-20 h-24 shrink-0 rounded-brand overflow-hidden bg-paper-2">
                <Frame src={i.image} alt={i.name} className="absolute inset-0" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between">
                  <span className="text-[15px] font-medium">{i.name}</span>
                  <span className="font-mono text-[14px]">{formatPrice(i.price * i.quantity)}</span>
                </div>
                <div className="font-mono text-[11px] text-stone mt-1">{i.sku} · {i.color} · {i.size} · Qty {i.quantity}</div>
              </div>
            </div>
          ))}
        </div>

        <aside className="border border-line rounded-brand p-6 h-fit">
          <h2 className="eyebrow mb-5">Order summary</h2>
          <Row label="Subtotal" value={formatPrice(order.subtotal)} />
          <Row
            label={SHIPPING_OPTIONS.find((o) => o.id === order.shippingMethod)?.label ?? "Shipping"}
            value={order.shipping === 0 ? "Free" : formatPrice(order.shipping)}
          />
          <Row label="Taxes" value={formatPrice(order.tax)} />
          {order.discount > 0 && <Row label="Discount" value={`-${formatPrice(order.discount)}`} />}
          <div className="border-t border-line mt-4 pt-4 flex justify-between">
            <span className="text-[15px] font-medium">Total</span>
            <span className="font-mono text-[16px]">{formatPrice(order.total)}</span>
          </div>
          <p className="text-[12px] text-stone mt-4 uppercase tracking-wide">Payment: {order.paymentMethod} · {order.paymentStatus}</p>
          <Link href="/shop" className="btn w-full justify-center mt-6"><span>Continue shopping</span></Link>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 text-[14px]">
      <span className="text-stone">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
