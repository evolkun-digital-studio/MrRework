"use client";
import { Minus, Plus, X } from "lucide-react";
import { Frame } from "@/components/Frame";
import { useCart, type CartItem } from "@/lib/store";
import { formatConvertedPrice } from "@/lib/utils";
import type { CartTotals } from "@/lib/pricing";

interface OrderSummaryProps {
  items: CartItem[];
  totals: CartTotals;
  shippingLabel: string;
  coupon: string;
  onCouponChange: (v: string) => void;
  onApplyCoupon: () => void;
  couponMessage?: string;
  // Every totals figure above is GBP — this only changes how it's displayed
  // once the address form's country resolves to a different currency (see
  // src/app/checkout/page.tsx). Defaults to a no-op GBP passthrough.
  displayCurrency?: string;
  exchangeRate?: number;
}

// Shared by the desktop sticky column and the mobile collapsible disclosure —
// quantity/remove act directly on the cart store so every other cart surface
// (badge, drawer, /cart) reflects the change instantly, with no local copy of
// cart state kept here.
export default function OrderSummary({
  items, totals, shippingLabel, coupon, onCouponChange, onApplyCoupon, couponMessage,
  displayCurrency = "GBP", exchangeRate = 1,
}: OrderSummaryProps) {
  const { setQty, remove } = useCart();
  const { subtotal, shipping, tax, discount, total } = totals;
  const price = (amountGBP: number) => formatConvertedPrice(amountGBP, displayCurrency, exchangeRate);

  return (
    <div>
      <h2 className="eyebrow mb-5">Order summary</h2>

      <div className="divide-y divide-line mb-5 max-h-[400px] overflow-y-auto no-scrollbar">
        {items.map((i) => (
          <div key={`${i.id}-${i.size}-${i.color}`} className="flex gap-4 py-4 first:pt-0">
            <div className="relative w-16 h-20 shrink-0 rounded-brand overflow-hidden bg-paper-2">
              <Frame src={i.image} alt={i.name} className="absolute inset-0" />
              <span className="absolute -top-1.5 -right-1.5 bg-ink text-paper font-mono text-[10px] w-5 h-5 rounded-full grid place-items-center">{i.quantity}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between gap-2">
                <span className="text-[13px] font-medium truncate">{i.name}</span>
                <span className="font-mono text-[12px] whitespace-nowrap">{price(i.price * i.quantity)}</span>
              </div>
              <div className="font-mono text-[11px] text-stone mt-1">{i.color} · {i.size}</div>
              <div className="flex items-center justify-between mt-2.5">
                <div className="flex items-center border border-line rounded-brand">
                  <button
                    type="button" aria-label={`Decrease quantity of ${i.name}`}
                    className="px-2.5 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                    onClick={() => setQty(i.id, i.size, i.color, i.quantity - 1)}
                  >
                    <Minus size={12} />
                  </button>
                  <span className="font-mono text-[11px] w-5 text-center" aria-live="polite">{i.quantity}</span>
                  <button
                    type="button" aria-label={`Increase quantity of ${i.name}`}
                    className="px-2.5 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                    onClick={() => setQty(i.id, i.size, i.color, i.quantity + 1)}
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <button
                  type="button" aria-label={`Remove ${i.name} from bag`}
                  className="text-stone hover:text-ink transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink rounded-brand"
                  onClick={() => remove(i.id, i.size, i.color)}
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-5">
        <label className="sr-only" htmlFor="coupon">Coupon code</label>
        <input
          id="coupon" type="text" value={coupon} onChange={(e) => onCouponChange(e.target.value)}
          placeholder="Coupon code"
          className="flex-1 min-w-0 bg-transparent border border-line rounded-brand px-3.5 py-2.5 text-[13px] outline-none transition focus:border-ink placeholder:text-stone"
        />
        <button
          type="button" onClick={onApplyCoupon}
          className="text-[11px] uppercase tracking-wide px-4 rounded-brand border border-line hover:border-ink transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          Apply
        </button>
      </div>
      {couponMessage && <p className="text-[12px] text-stone -mt-3 mb-5">{couponMessage}</p>}

      <Row label="Subtotal" value={price(subtotal)} />
      <Row label={shippingLabel} value={shipping === 0 ? "Free" : price(shipping)} />
      <Row label="Taxes" value={price(tax)} />
      {discount > 0 && <Row label="Discount" value={`-${price(discount)}`} />}
      <div className="border-t border-line mt-4 pt-4 flex justify-between">
        <span className="text-[15px] font-medium">Total</span>
        <span className="font-mono text-[16px]" aria-live="polite">{price(total)}</span>
      </div>
      {displayCurrency !== "GBP" && (
        <p className="text-[11px] text-stone mt-2">
          Shown in {displayCurrency} at today&rsquo;s rate · charged in GBP
        </p>
      )}
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
