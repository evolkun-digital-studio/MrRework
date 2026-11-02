"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, User, X } from "lucide-react";
import { useDialogBehavior } from "@/lib/useDialogBehavior";
import Accordion from "./Accordion";
import { WOMENS_NAV_ITEMS, MENS_NAV_ITEMS, UNISEX_NAV_ITEMS } from "@/lib/genderNavItems";
import { BrandLogo } from "./BrandLogo";
import { useCustomerAuth } from "@/lib/customerAuthStore";

// The same links the desktop nav renders (Header.tsx) — this component is a
// mobile-only equivalent surface, not a redesign, so it deliberately doesn't
// introduce a different set of destinations. Women's/Men's/Unisex are each
// handled as expandable accordions here (desktop's equivalent is the hover
// mega-menu); Home/Latest Drops/Premium/Accessories stay flat links.
const FLAT_LINKS = [
  { href: "/", label: "Home" },
  { href: "/latest-drops", label: "Latest Drops" },
  { href: "/shop?category=premium", label: "Premium" },
  { href: "/shop?category=accessories", label: "Accessories" },
];

const GENDER_SECTIONS = [
  { title: "Women's", href: "/shop?category=women-s", items: WOMENS_NAV_ITEMS },
  { title: "Men's", href: "/shop?category=men-s", items: MENS_NAV_ITEMS },
  { title: "Unisex", href: "/shop", items: UNISEX_NAV_ITEMS },
];

const EASE = [0.22, 1, 0.36, 1] as const;

export default function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const { user, openModal } = useCustomerAuth();

  useDialogBehavior(open, onClose, panelRef);

  // Auto-focus the first link the instant the drawer opens, same as
  // SearchOverlay auto-focusing its input — keyboard/screen-reader users
  // land straight inside the dialog instead of needing to Tab into it.
  useEffect(() => {
    if (open) firstLinkRef.current?.focus();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        // Full-bleed, not a partial-width slide-in panel — a "luxury
        // fullscreen menu drawer" per the quiet-luxury redesign rather than
        // the old 85%-width drawer with a dimmed backdrop beside it.
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 h-[100dvh] w-full bg-white z-[1501] flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
        >
          {/* pt accounts for the iOS notch/Dynamic Island via --safe-top
              (env(safe-area-inset-top)) so this header row never renders
              underneath it once viewport-fit=cover is in effect. */}
          <div
            className="flex items-center justify-between px-6 pb-5"
            style={{ paddingTop: "calc(1.25rem + var(--safe-top))", borderBottom: "1px solid #efefef" }}
          >
            <Link href="/" onClick={onClose} aria-label="MrRework home">
              <BrandLogo compact />
            </Link>
            {/* 44x44px (was 36x36) for the minimum comfortable touch
                target; -mr-2 kept so the icon's own visual position is
                unchanged relative to the panel's right edge. */}
            <button type="button" onClick={onClose} aria-label="Close menu" className="w-11 h-11 -mr-2 grid place-items-center hover:opacity-60 transition">
              <X size={22} strokeWidth={1.5} />
            </button>
          </div>

          {/* pb accounts for the home-indicator gesture area via
              --safe-bottom so the last link isn't crowded by it.
              data-lenis-prevent: this app's page-scroll is driven by Lenis,
              which attaches its own global wheel/touch listener
              independently of native scrolling. While a dialog is open,
              useDialogBehavior calls lenis.stop() — but Lenis's own
              handler, when stopped, calls event.preventDefault() on EVERY
              scroll gesture site-wide, unless the element carries this
              attribute (Lenis's own documented escape hatch for nested
              scrollable regions, already used by SearchOverlay.tsx). */}
          <motion.nav
            data-lenis-prevent
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: EASE }}
            className="flex-1 overflow-y-auto px-6 pt-10"
            style={{ paddingBottom: "calc(2rem + var(--safe-bottom))", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
          >
            <ul className="flex flex-col gap-1">
              {FLAT_LINKS.map((link, i) => (
                <li key={link.label}>
                  <Link
                    ref={i === 0 ? firstLinkRef : undefined}
                    href={link.href}
                    onClick={onClose}
                    className="block py-4 text-[14px] font-display font-medium uppercase tracking-[0.01em] border-b border-line hover:opacity-60 transition"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}

              {GENDER_SECTIONS.map((section) => (
                <li key={section.title}>
                  <Accordion title={section.title}>
                    <ul className="flex flex-col">
                      <li>
                        <Link
                          href={section.href}
                          onClick={onClose}
                          className="block py-2.5 pl-4 text-[14.5px] text-ink-2 hover:text-ink transition"
                        >
                          Shop All
                        </Link>
                      </li>
                      {section.items.map((item) => (
                        <li key={item.slug}>
                          <Link
                            href={item.slug === "#" ? "#" : `/shop?${item.filter ?? "category"}=${encodeURIComponent(item.slug)}`}
                            onClick={onClose}
                            className="block py-2.5 pl-4 text-[14.5px] text-ink-2 hover:text-ink transition"
                          >
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Accordion>
                </li>
              ))}
            </ul>

            <div className="mt-8 grid grid-cols-2 gap-3 border-t border-line pt-6">
              {user ? (
                <Link
                  href="/account"
                  onClick={onClose}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-line px-4 text-[13px] font-medium transition hover:border-ink"
                >
                  <User size={17} strokeWidth={1.6} />
                  My Account
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openModal("login");
                  }}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-line px-4 text-[13px] font-medium transition hover:border-ink"
                >
                  <User size={17} strokeWidth={1.6} />
                  My Account
                </button>
              )}
              <Link
                href="/wishlist"
                onClick={onClose}
                className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-line px-4 text-[13px] font-medium transition hover:border-ink"
              >
                <Heart size={17} strokeWidth={1.6} />
                Wishlist
              </Link>
            </div>
          </motion.nav>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
