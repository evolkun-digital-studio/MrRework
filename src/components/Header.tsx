"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Search, User, Menu, Heart, ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/store";
import { useWishlist } from "@/lib/wishlistStore";
import { useCustomerAuth } from "@/lib/customerAuthStore";
import { useCurrency } from "@/lib/currencyStore";
import { formatConvertedPrice } from "@/lib/utils";
import { WOMENS_NAV_ITEMS, MENS_NAV_ITEMS, UNISEX_NAV_ITEMS } from "@/lib/genderNavItems";
import { NavDropdown } from "./NavDropdown";
import { CurrencySelector } from "./CurrencySelector";
import SearchOverlay from "./SearchOverlay";
import MobileNav from "./MobileNav";
import { BrandLogo } from "./BrandLogo";

// Quiet-luxury nav link — small, light-weight, barely-tracked uppercase
// type (COS/Massimo Dutti reference), not a bold/heavily-tracked treatment.
// A thin, short (55%-width) underline marks the active page and appears on
// hover via opacity rather than a scale-x reveal, so it reads as a quiet
// accent rather than a strong ecommerce-style indicator.
const NAV_LINK_CLASS =
  "relative py-1 text-[13px] font-normal uppercase tracking-[0.02em] text-[#222] hover:opacity-70 transition-all duration-300 after:content-[''] after:absolute after:left-1/2 after:-translate-x-1/2 after:-bottom-0.5 after:w-[55%] after:h-px after:bg-[#222] after:transition-opacity after:duration-300";

export default function Header() {
  const pathname = usePathname();
  // Selector-based, not a bare `useCart()` call — `open` is a stable action
  // reference defined once in the store (see store.ts), so this never
  // re-renders Header on its own; previously the whole-store subscription
  // meant Header re-rendered on every cart mutation anywhere in the app
  // (add-to-cart from any product card, drawer open/close, quantity
  // change), even though the actual live item count below is already kept
  // in sync by the manual `useCart.subscribe(...)` a few lines down.
  const open = useCart((s) => s.open);
  const { user, openModal } = useCustomerAuth();
  const { currency, rate } = useCurrency();
  const [n, setN] = useState(0);
  const [w, setW] = useState(0);
  const [sub, setSub] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // One-time initial read, not a subscription — `count()`'s return value
  // isn't reactive on its own (it's a plain getter), and the live count is
  // already kept current by the `useCart.subscribe(...)` below.
  useEffect(() => setN(useCart.getState().count()), []);
  useEffect(() => setW(useWishlist.getState().items.length), []);
  useEffect(() => setSub(useCart.getState().subtotal()), []);
  useEffect(() => setMounted(true), []);
  // Seeds the cart store's live shipping settings once per page load, so
  // the cart drawer's total matches checkout/order-creation instead of the
  // env-var fallback (src/lib/pricing.ts's default constants).
  useEffect(() => {
    fetch("/api/shipping/config")
      .then((res) => res.json())
      .then((c) => useCart.getState().setShippingSettings({
        flatRate: c.flatRate, expressRate: c.expressRate,
        localPickupEnabled: c.localPickupEnabled, internationalShippingEnabled: c.internationalShippingEnabled,
        estimatedDeliveryText: c.estimatedDeliveryText, returnPolicyText: c.returnPolicyText, processingTimeText: c.processingTimeText,
        originCountry: "", originState: "", originCity: "",
      }))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const unsub = useCart.subscribe((s) => {
      setN(s.items.reduce((a, i) => a + i.quantity, 0));
      setSub(useCart.getState().subtotal());
    });
    const unsubWishlist = useWishlist.subscribe((s) => setW(s.items.length));
    return () => { unsub(); unsubWishlist(); };
  }, []);

  return (
    <>
      <header
        className="fixed top-0 left-0 w-full z-[900] bg-white"
        style={{
          // The header itself must clear a notch/Dynamic Island too — the
          // safe-area inset is padding on this outer element, kept separate
          // from the fixed 72px bar below so that bar's height never grows
          // on a notched device. The Handpick iframe reads the matching
          // unscrolled height from --header-clearance, so its first content
          // can never begin behind this fixed element.
          paddingTop: "var(--safe-top)",
          borderBottom: "1px solid #ececec",
        }}
      >
        <div className="h-[72px] flex items-center px-4 sm:px-6 xl:px-10 2xl:px-12">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[auto_minmax(0,1fr)_auto] items-center w-full gap-3 xl:gap-6">
            <div className="flex min-w-0 items-center gap-3 xl:pl-1">
            {/* Compact equivalent of the desktop <nav> a few lines down.
                It remains available through tablet and small-laptop widths,
                where the complete navigation cannot fit without collisions. */}
            {/* The shared tap-target size keeps the menu comfortable to use
                without enlarging its 22px visual glyph. */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
              aria-haspopup="dialog"
              aria-expanded={mobileNavOpen}
              className="flex xl:hidden tap-target shrink-0 items-center justify-center hover:text-ink hover:scale-110 active:scale-95 transition-all duration-200"
            >
              <Menu size={22} />
            </button>
            <Link href="/" aria-label="MrRework home" className="min-w-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink">
              <span className="sm:hidden"><BrandLogo compact /></span>
              <span className="hidden sm:inline-flex"><BrandLogo /></span>
            </Link>
          </div>
          <nav className="hidden xl:flex min-w-0 justify-self-center items-center gap-5 2xl:gap-8">
            <Link
              href="/"
              className={`${NAV_LINK_CLASS} ${pathname === "/" ? "after:opacity-100" : "after:opacity-0 hover:after:opacity-100"}`}
            >
              Home
            </Link>
            <Link href="/latest-drops" className={`${NAV_LINK_CLASS} after:opacity-0 hover:after:opacity-100`}>Latest&nbsp;Drops</Link>
            <Link href="/shop?category=premium" className={`${NAV_LINK_CLASS} after:opacity-0 hover:after:opacity-100`}>Premium</Link>
            <Link href="/shop?category=accessories" className={`${NAV_LINK_CLASS} after:opacity-0 hover:after:opacity-100`}>Accessories</Link>
            <NavDropdown href="/shop?category=women-s" label="Women's" items={WOMENS_NAV_ITEMS} />
            <NavDropdown href="/shop?category=men-s" label="Men's" items={MENS_NAV_ITEMS} />
            <NavDropdown href="/shop" label="Unisex" items={UNISEX_NAV_ITEMS} />
          </nav>
          <div className="flex shrink-0 justify-self-end gap-1 sm:gap-3 lg:gap-5 text-[13px] text-[#222] items-center">
            {/* Static "My Account" label regardless of auth state (was
                Login/Register text swapping to the user's first name) —
                same underlying action either way, just a quieter, single
                label per the reference. */}
            {user ? (
              <>
                <Link href="/account" aria-label="My Account" className="hidden lg:inline hover:opacity-70 transition-opacity duration-300">
                  My Account
                </Link>
                <Link href="/account" aria-label="My Account" className="hidden items-center hover:text-ink hover:scale-110 active:scale-95 transition-all duration-200 sm:flex lg:hidden tap-target">
                  <User size={18} strokeWidth={1.75} />
                </Link>
              </>
            ) : (
              <>
                <button
                  type="button" onClick={() => openModal("login")}
                  aria-haspopup="dialog"
                  className="hidden lg:inline hover:opacity-70 transition-opacity duration-300"
                >
                  My Account
                </button>
                {/* Tablet-sized icon equivalent for the same login trigger;
                    phones expose this action inside the menu drawer. */}
                <button
                  type="button" onClick={() => openModal("login")}
                  aria-label="My Account" aria-haspopup="dialog"
                  className="hidden items-center hover:text-ink hover:scale-110 active:scale-95 transition-all duration-200 sm:flex lg:hidden tap-target"
                >
                  <User size={18} strokeWidth={1.75} />
                </button>
              </>
            )}
            <button
              type="button" onClick={() => setSearchOpen(true)}
              aria-label="Search" aria-expanded={searchOpen} aria-haspopup="dialog"
              className="tap-target flex items-center hover:text-ink hover:scale-110 active:scale-95 transition-all duration-200"
            >
              <Search size={18} strokeWidth={1.75} />
            </button>
            {/* Plain icon, no count badge — the reference shows an
                unbadged heart, so the item count stays screen-reader-only
                (aria-label) rather than a visual overlay. */}
            <Link href="/wishlist" aria-label={`Wishlist, ${w} items`} className="hidden sm:flex tap-target items-center hover:text-ink hover:scale-110 active:scale-95 transition-all duration-200">
              <Heart size={18} strokeWidth={1.75} />
            </Link>
            {/* Cart count/price sit inline next to the icon ("0 / $0.00"),
                not as an overlapping badge. */}
            <button type="button" onClick={open} aria-label={`Cart, ${n} items, ${formatConvertedPrice(sub, currency, rate)}`} className="tap-target relative flex items-center gap-1.5 hover:text-ink hover:scale-105 active:scale-95 transition-all duration-200">
              <ShoppingBag size={18} strokeWidth={1.75} />
              <span className="sm:hidden absolute right-0.5 top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-ink px-1 text-[9px] leading-none text-white">{n > 99 ? "99+" : n}</span>
              <span className="hidden sm:inline font-mono text-[12.5px]">{n}<span className="hidden lg:inline"> / {formatConvertedPrice(sub, currency, rate)}</span></span>
            </button>
          </div>
        </div>
        </div>
      </header>

      {/* Fixed to the viewport's right edge, independent of the header row
          entirely — not part of scrolling page content, so it stays
          reachable at any scroll position. Hidden on the homepage only. */}
      {pathname !== "/" && <CurrencySelector />}

      {/* Portalled to body so the overlay's `fixed inset-0` always covers the
          viewport, independent of the header's own backdrop-filter/transform
          stacking context. */}
      {mounted && createPortal(<SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />, document.body)}
      {mounted && createPortal(<MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />, document.body)}
    </>
  );
}
