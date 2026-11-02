"use client";
import Link from "next/link";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { Frame } from "@/components/Frame";
import { useCart } from "@/lib/store";
import { formatConvertedPrice } from "@/lib/utils";
import { useCurrency } from "@/lib/currencyStore";
import { useCartStockLookup, cartStockKey } from "@/lib/useCartStockLookup";

export default function CartPage() {
  const { items, setQty, remove, totals } = useCart();
  const { subtotal: sub, shipping, tax, total } = totals();
  const { currency, rate } = useCurrency();
  const price = (amountGBP: number) => formatConvertedPrice(amountGBP, currency, rate);
  const stockLookup = useCartStockLookup(true);
  const hasUnavailable = items.some((i) => stockLookup.get(cartStockKey(i.id, i.size, i.color))?.available === false);

  // Same empty-state shape as /wishlist (icon, heading, supporting copy,
  // centered) — previously just a single left-aligned line of text, out of
  // step with the sibling page for the same kind of "nothing here yet"
  // moment.
  if (items.length === 0) {
    return (
      <div className="px-5 md:px-12 pt-32 pb-24 min-h-[70dvh] flex flex-col items-center justify-center text-center">
        <ShoppingBag size={48} strokeWidth={1.2} className="text-stone mb-6" />
        <h1 className="display mb-3" style={{ fontSize: "clamp(28px,4vw,48px)" }}>Your bag is empty</h1>
        <p className="text-stone mb-8 max-w-[420px]">Add something you love, and it'll show up here.</p>
        <Link href="/shop" className="btn"><span>Continue shopping</span></Link>
      </div>
    );
  }

  return (
    <div className="px-5 md:px-12 pt-32 pb-24 min-h-[70dvh]">
      <h1 className="display mb-10" style={{ fontSize: "clamp(34px,5.5vw,76px)" }}>Your bag</h1>

      <div className="grid lg:grid-cols-[1fr_360px] gap-12">
        <div className="divide-y divide-line border-t border-line">
          {items.map((i) => {
            const stock = stockLookup.get(cartStockKey(i.id, i.size, i.color));
            const unavailable = stock?.available === false;
            const atMax = typeof stock?.maxQuantity === "number" && i.quantity >= stock.maxQuantity;
            return (
              <div key={`${i.id}-${i.size}-${i.color}`} className="flex gap-5 py-6">
                <Link href={`/product/${i.slug}`} className="relative w-24 h-32 rounded-brand overflow-hidden bg-paper-2 shrink-0">
                  <Frame src={i.image} alt={i.name} className={`absolute inset-0 ${unavailable ? "opacity-50" : ""}`} />
                </Link>
                <div className="flex-1">
                  <div className="flex justify-between">
                    <Link href={`/product/${i.slug}`} className="text-[15px] font-medium">{i.name}</Link>
                    <span className="font-mono text-[14px]">{price(i.price * i.quantity)}</span>
                  </div>
                  <div className="font-mono text-[11px] text-stone mt-1">{i.sku} · {i.color} · {i.size}</div>
                  {unavailable && <p className="text-[11px] text-[#4a1414] mt-1">Sold out — remove to continue.</p>}
                  <div className="flex items-center justify-between mt-4">
                    <div className={`flex items-center border border-line rounded-brand ${unavailable ? "opacity-40" : ""}`}>
                      <button type="button" disabled={unavailable} className="px-3 py-3 disabled:cursor-not-allowed" onClick={() => setQty(i.id, i.size, i.color, i.quantity - 1)} aria-label={`Decrease quantity of ${i.name}`}><Minus size={13} /></button>
                      <span className="font-mono text-[13px] w-7 text-center">{i.quantity}</span>
                      <button type="button" disabled={unavailable || atMax} className="px-3 py-3 disabled:cursor-not-allowed" onClick={() => setQty(i.id, i.size, i.color, i.quantity + 1)} aria-label={`Increase quantity of ${i.name}`}><Plus size={13} /></button>
                    </div>
                    <button type="button" className="text-[11px] uppercase tracking-wide text-stone hover:text-ink" onClick={() => remove(i.id, i.size, i.color)}>Remove</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start border border-line rounded-brand p-6 h-fit">
          <h2 className="eyebrow mb-5">Order summary</h2>
          <Row label="Subtotal" value={price(sub)} />
          <Row label="Shipping" value={shipping === 0 ? "Free" : price(shipping)} />
          {tax > 0 ? <Row label="Taxes" value={price(tax)} /> : <Row label="Taxes" value="Calculated at checkout" muted />}
          <div className="border-t border-line mt-4 pt-4 flex justify-between">
            <span className="text-[15px] font-medium">Total</span>
            <span className="font-mono text-[16px]">{price(total)}</span>
          </div>
          {hasUnavailable && <p className="text-[11px] text-[#4a1414] mt-4">Remove sold-out items to continue to checkout.</p>}
          <Link
            href="/checkout"
            onClick={(e) => { if (hasUnavailable) e.preventDefault(); }}
            aria-disabled={hasUnavailable}
            className={`btn w-full justify-center mt-6 ${hasUnavailable ? "pointer-events-none opacity-40" : ""}`}
          >
            <span>Proceed to checkout</span>
          </Link>
          <Link href="/shop" className="block text-center text-[12px] uppercase tracking-wide text-stone mt-4 hover:text-ink">Continue shopping</Link>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between py-1.5 text-[14px]">
      <span className="text-stone">{label}</span>
      <span className={muted ? "text-stone text-[12px]" : "font-mono"}>{value}</span>
    </div>
  );
}
