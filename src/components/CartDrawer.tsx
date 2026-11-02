"use client";
import { useRef } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { X, Minus, Plus } from "lucide-react";
import { Frame } from "./Frame";
import { useCart } from "@/lib/store";
import { formatConvertedPrice } from "@/lib/utils";
import { useCurrency } from "@/lib/currencyStore";
import { useDialogBehavior } from "@/lib/useDialogBehavior";
import { useCartStockLookup, cartStockKey } from "@/lib/useCartStockLookup";

export default function CartDrawer() {
  const { items, isOpen, close, remove, setQty, totals } = useCart();
  const { itemCount, subtotal, shipping, tax, total } = totals();
  const { currency, rate } = useCurrency();
  const price = (amountGBP: number) => formatConvertedPrice(amountGBP, currency, rate);
  const panelRef = useRef<HTMLDivElement>(null);
  const stockLookup = useCartStockLookup(isOpen);
  const hasUnavailable = items.some((i) => stockLookup.get(cartStockKey(i.id, i.size, i.color))?.available === false);

  // Same dialog role/Escape/focus-trap behavior SearchOverlay and AuthModal
  // already have — this drawer previously had neither (see useDialogBehavior.ts).
  useDialogBehavior(isOpen, close, panelRef);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-ink/40 z-[1000]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={close}
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Your bag"
            className="fixed top-0 right-0 h-full w-full sm:w-[440px] bg-paper z-[1001] flex flex-col"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-line">
              <span className="font-display text-lg" style={{ fontWeight: 800 }}>Your bag ({itemCount})</span>
              {/* p-3 -m-3: grows the tap area to ~44px without changing the
                  icon's visual size/position (padding and the matching
                  negative margin cancel out in the layout). */}
              <button type="button" onClick={close} aria-label="Close" className="p-3 -m-3"><X size={20} /></button>
            </div>

            {/* data-lenis-prevent: without it, Lenis's global scroll handler
                calls preventDefault() on every touch/wheel gesture while
                stopped (useDialogBehavior calls lenis.stop() whenever this
                drawer is open) — blocking scroll inside this list entirely,
                not just the page behind it. Same fix as MobileNav.tsx /
                SearchOverlay.tsx, Lenis's own documented escape hatch. */}
            <div data-lenis-prevent className="flex-1 overflow-y-auto px-6 no-scrollbar">
              {items.length === 0 ? (
                <p className="text-stone text-sm mt-12 text-center">Your bag is empty.</p>
              ) : (
                items.map((i) => {
                  const stock = stockLookup.get(cartStockKey(i.id, i.size, i.color));
                  const unavailable = stock?.available === false;
                  const atMax = typeof stock?.maxQuantity === "number" && i.quantity >= stock.maxQuantity;
                  return (
                    <div key={`${i.id}-${i.size}-${i.color}`} className="flex gap-4 py-5 border-b border-line">
                      <div className="relative w-20 h-24 shrink-0 rounded-brand overflow-hidden bg-paper-2">
                        <Frame src={i.image} alt={i.name} className={`absolute inset-0 ${unavailable ? "opacity-50" : ""}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between gap-2">
                          <span className="text-[14px] font-medium">{i.name}</span>
                          <span className="font-mono text-[13px]">{price(i.price * i.quantity)}</span>
                        </div>
                        <div className="font-mono text-[11px] text-stone mt-1">{i.color} · {i.size}</div>
                        {unavailable && <p className="text-[11px] text-[#4a1414] mt-1">Sold out — remove to continue.</p>}
                        <div className="flex items-center justify-between mt-3">
                          <div className={`flex items-center border border-line rounded-brand ${unavailable ? "opacity-40" : ""}`}>
                            <button type="button" disabled={unavailable} className="px-3 py-3 disabled:cursor-not-allowed" onClick={() => setQty(i.id, i.size, i.color, i.quantity - 1)} aria-label={`Decrease quantity of ${i.name}`}><Minus size={13} /></button>
                            <span className="font-mono text-[12px] w-6 text-center">{i.quantity}</span>
                            <button type="button" disabled={unavailable || atMax} className="px-3 py-3 disabled:cursor-not-allowed" onClick={() => setQty(i.id, i.size, i.color, i.quantity + 1)} aria-label={`Increase quantity of ${i.name}`}><Plus size={13} /></button>
                          </div>
                          <button type="button" className="text-[11px] uppercase tracking-wide text-stone hover:text-ink" onClick={() => remove(i.id, i.size, i.color)} aria-label={`Remove ${i.name} from bag`}>Remove</button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* paddingBottom accounts for the iOS home-indicator gesture
                area via --safe-bottom so the Checkout CTA never sits flush
                against it. */}
            <div className="px-6 pt-5 border-t border-line" style={{ paddingBottom: "calc(1.25rem + var(--safe-bottom))" }}>
              <div className="flex justify-between mb-1 text-[14px]"><span>Subtotal</span><span className="font-mono">{price(subtotal)}</span></div>
              <div className="flex justify-between mb-1 text-[12px] text-stone"><span>Shipping</span><span className="font-mono">{shipping === 0 ? "Free" : price(shipping)}</span></div>
              {tax > 0 && <div className="flex justify-between mb-1 text-[12px] text-stone"><span>Taxes</span><span className="font-mono">{price(tax)}</span></div>}
              <div className="flex justify-between mt-3 mb-4 pt-3 border-t border-line text-[14px] font-medium"><span>Total</span><span className="font-mono">{price(total)}</span></div>
              {hasUnavailable && <p className="text-[11px] text-[#4a1414] mb-3">Remove sold-out items to continue to checkout.</p>}
              <Link
                href="/checkout"
                onClick={(e) => { if (items.length === 0 || hasUnavailable) { e.preventDefault(); return; } close(); }}
                aria-disabled={items.length === 0 || hasUnavailable}
                className={`btn w-full justify-center ${items.length === 0 || hasUnavailable ? "pointer-events-none opacity-40" : ""}`}
              >
                <span>Checkout</span>
              </Link>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
