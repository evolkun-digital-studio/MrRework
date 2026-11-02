"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const DEFAULT_ITEM_CLASS =
  "block py-2.5 text-[14px] tracking-[0.01em] text-ink-2 cursor-pointer transition-colors duration-150 hover:text-ink focus-visible:text-ink focus-visible:outline-none";

const EASE = [0.22, 1, 0.36, 1] as const;

export interface NavDropdownItem {
  label: string;
  /** Value passed to the storefront filter, or # for a placeholder. */
  slug: string;
  filter?: "category" | "brand";
}

// Shared "hover dropdown under a header nav item" — trigger link + fade/
// slide panel + all the open/close intent handling (hover, focus, Escape,
// blur-out) lives here once instead of being reimplemented per nav item.
// Used by Header.tsx for both "Collection" and "Outerwear".
export function NavDropdown({
  href, label, items, itemClassName = DEFAULT_ITEM_CLASS, filter = "category",
}: { href: string; label: string; items: NavDropdownItem[]; itemClassName?: string; filter?: "category" | "brand" }) {
  // Legacy header markup used collection-04 as the category-menu trigger.
  // It is not a real "all categories" filter, so clicking the trigger must
  // return to the complete wholesale catalog instead of an empty subset.
  const triggerHref = href === "/shop?collection=collection-04" ? "/shop" : href;
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  // Small delay on close (not on open) — lets the cursor cross the gap
  // between the trigger and the dropdown panel below it without the menu
  // flickering shut mid-transit.
  function openMenu() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }
  // Whether the last known pointer position is still over the trigger or
  // the panel — checked against real rects (not just the mouseleave/
  // mouseenter pairing) because that pairing alone can race: a header
  // re-render or the scroll-triggered padding shrink can shift the panel by
  // a few pixels between the mouseleave firing and the mouseenter that's
  // supposed to cancel it, closing the menu while the cursor is still on
  // it. This is the fix for that "closes on its own" report.
  function pointerStillInside() {
    const p = pointerRef.current;
    if (!p) return false;
    return [rootRef.current, panelRef.current].some((el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
    });
  }
  function closeMenu(immediate = false) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (immediate) { setOpen(false); return; }
    closeTimer.current = setTimeout(() => {
      if (pointerStillInside()) return;
      setOpen(false);
    }, 150);
  }
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onPointerMove(e: PointerEvent) {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    }
    // Tap-outside-to-close — this menu has no true hover state on a
    // touchscreen (see the trigger's onClick below), so without this a
    // touch user who opened it has no way to dismiss it short of hitting
    // Escape (no keyboard) or tapping an item.
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeMenu(true);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("click", onDocClick);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("click", onDocClick);
    };
  }, [open]);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={openMenu}
      onMouseLeave={() => closeMenu()}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) closeMenu(true);
      }}
    >
      <Link
        ref={triggerRef}
        href={triggerHref}
        aria-haspopup="menu"
        aria-expanded={open}
        onFocus={openMenu}
        // A touchscreen (iPad, reachable at md:) has no real hover state —
        // the first tap here would otherwise just navigate straight through
        // via the href, never opening the menu at all. If the menu isn't
        // already open, this tap's job is to open it, not navigate; a mouse
        // user never hits this branch since mouseenter already set
        // `open=true` before any click fires, so desktop behavior (click
        // navigates straight through) is unchanged.
        onClick={(e) => { if (!open) { e.preventDefault(); openMenu(); } }}
        className="relative py-1 flex items-center gap-1 text-[13px] font-normal uppercase tracking-[0.02em] text-[#222] hover:opacity-70 transition-all duration-300 after:content-[''] after:absolute after:left-1/2 after:-translate-x-1/2 after:-bottom-0.5 after:w-[55%] after:h-px after:bg-[#222] after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-300"
      >
        {label}
        <ChevronDown size={13} strokeWidth={1.75} aria-hidden className={`text-stone transition-transform duration-300 ease-brand ${open ? "rotate-180" : ""}`} />
      </Link>

      {/* Dropdown panel — padding-top (not margin) keeps the hoverable box
          flush against the trigger's bottom edge, so there's no dead zone
          for the cursor to cross. Framer Motion (not the old CSS transition)
          drives the editorial fade + slight-upward entrance so it can be
          mounted/unmounted with AnimatePresence rather than always being in
          the DOM at opacity:0. */}
      <div
        ref={panelRef}
        className="absolute left-1/2 -translate-x-1/2 top-full pt-4"
        onMouseEnter={openMenu}
        onMouseLeave={() => closeMenu()}
      >
        <AnimatePresence>
          {open && (
            // data-lenis-prevent: without it, a mouse-wheel scroll over this
            // open panel gets hijacked by Lenis and smooth-scrolls the PAGE
            // behind it instead of this panel's own list — Lenis's own
            // escape hatch for nested scrollable regions.
            <motion.div
              role="menu"
              aria-label={`${label} menu`}
              data-lenis-prevent
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="w-[300px] bg-white rounded-[4px] shadow-[0_24px_56px_rgba(17,17,17,0.10)] ring-1 ring-black/[0.04] px-7 py-6 z-[950] max-h-[70dvh] overflow-y-auto no-scrollbar"
              style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
            >
              <div className="flex flex-col divide-y divide-line/70">
                {items.map((item) => (
                  <Link
                    key={`${item.filter ?? filter}:${item.slug}`}
                    href={item.slug === "#" ? "#" : `/shop?${item.filter ?? filter}=${encodeURIComponent(item.slug)}`}
                    role="menuitem"
                    onClick={() => closeMenu(true)}
                    className={itemClassName}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
