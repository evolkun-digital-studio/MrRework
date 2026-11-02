"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCurrency, SUPPORTED_CURRENCIES, CURRENCY_META } from "@/lib/currencyStore";

// Fixed tab, independent of the header row entirely so it stays reachable
// while scrolling. Desktop: pinned to the right edge, vertically centered,
// opened by hover (mouse-only gesture). Mobile/touch has no hover state at
// all, so below `sm` this also opens on tap, and sits bottom-right instead
// of vertically centered — centered-on-the-right had no safe margin on a
// narrow screen and ended up overlapping buttons/images/text wherever the
// page happened to be scrolled (confirmed on every page at 375px width);
// bottom-right stays clear of that (the one other fixed corner element on
// this site — a chat widget — lives bottom-LEFT).
export function CurrencySelector() {
  const { currency, setCurrency } = useCurrency();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Portalled to body, same as SearchOverlay/MobileNav below — some page
  // content elsewhere (a Framer Motion element with an active `transform`)
  // creates its own stacking context that painted above this even at
  // z-[900], swallowing taps meant for the currency options. Body-level
  // portalling guarantees this always sits in the topmost layer regardless
  // of what any other page's stacking contexts are doing.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function openMenu() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function closeMenu() {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  // Tap-to-toggle needs its own outside-tap-to-close — hover has no
  // equivalent of "the pointer left the element" on touch, so nothing would
  // ever close this otherwise.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={rootRef}
      className="fixed z-[900] bottom-5 right-4 sm:bottom-auto sm:right-0 sm:top-1/2 sm:-translate-y-1/2"
      onMouseEnter={openMenu}
      onMouseLeave={closeMenu}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onFocus={openMenu}
        // Always opens (never toggles) — a tap can fire both a native
        // touch-click and a synthesized compatibility mouse-click on some
        // engines, and a toggle (`setOpen(v => !v)`) flips open then
        // immediately closed again on that double-fire, netting no visible
        // change. Closing already has its own paths: tap-outside (the
        // pointerdown listener above) and picking an option.
        onClick={openMenu}
        className="flex items-center justify-center w-11 h-11 sm:w-auto sm:h-auto px-2.5 py-3 rounded-full sm:rounded-l-brand sm:rounded-r-none bg-black border border-black shadow-[0_4px_14px_rgba(17,17,17,0.25)] text-[15px] font-mono font-medium text-white hover:bg-green hover:border-green transition-colors duration-200"
      >
        {CURRENCY_META[currency].symbol}
      </button>

      <div
        className={`absolute bottom-full right-0 mb-2 sm:bottom-auto sm:right-full sm:top-1/2 sm:mb-0 sm:-translate-y-1/2 sm:pr-2 w-[160px] transition-all duration-[220ms] ease-brand ${
          open ? "opacity-100 translate-y-0 sm:translate-x-0 pointer-events-auto" : "opacity-0 translate-y-2 sm:translate-y-0 sm:translate-x-2 pointer-events-none"
        }`}
      >
        <ul
          role="listbox"
          aria-label="Currency"
          className="bg-black border border-black rounded-brand-lg shadow-[0_16px_40px_rgba(0,0,0,0.35)] p-2"
        >
          {SUPPORTED_CURRENCIES.map((code) => (
            <li key={code} role="option" aria-selected={code === currency}>
              <button
                type="button"
                onClick={() => { setCurrency(code); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-brand text-[13.5px] text-left transition-colors duration-150 hover:bg-ink-2 ${
                  code === currency ? "text-white font-medium" : "text-white/60"
                }`}
              >
                <span className="font-mono w-4">{CURRENCY_META[code].symbol}</span>
                {code}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}
