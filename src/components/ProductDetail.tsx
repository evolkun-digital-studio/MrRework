"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Heart, Plus, Minus, Truck, Lock, BadgeCheck } from "lucide-react";
import { motion, type PanInfo } from "framer-motion";
import { Frame } from "./Frame";
import ProductCard from "./ProductCard";
import RichContent from "./RichContent";
import Accordion from "./Accordion";
import { useCart } from "@/lib/store";
import { useWishlist } from "@/lib/wishlistStore";
import { requireCustomerAuth } from "@/lib/customerAuthStore";
import { formatConvertedPrice, formatConvertedProductPrice, resolveStock } from "@/lib/utils";
import { recordRecentlyViewed } from "@/lib/recentlyViewed";
import { useCategoryName } from "@/lib/categoryStore";
import { useCurrency } from "@/lib/currencyStore";
import type { Product } from "@/lib/types";

const TRUST_BADGES = [
  { icon: Lock, label: "Secure Checkout" },
  { icon: BadgeCheck, label: "Authentic Products" },
  { icon: Truck, label: "Fast Shipping" },
];

interface ShippingConfig {
  estimatedDeliveryText: string; returnPolicyText: string; processingTimeText: string;
}

export default function ProductDetail({ product, related, descriptionHtml }: { product: Product; related: Product[]; descriptionHtml: string }) {
  const add = useCart((s) => s.add);
  const wishlisted = useWishlist((s) => s.items.some((i) => i.id === product._id));
  const toggleWishlist = useWishlist((s) => s.toggle);
  const categoryName = useCategoryName(product.category);
  const { currency, rate } = useCurrency();
  const [color, setColor] = useState(product.colors[0] ?? "");
  const [size, setSize] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [active, setActive] = useState(0);
  const [err, setErr] = useState(false);
  const [shippingConfig, setShippingConfig] = useState<ShippingConfig | null>(null);
  const hasColors = product.colors.length > 0;
  const requiresSize = product.sizes.length > 0;
  const sizeSectionRef = useRef<HTMLDivElement>(null);

  // Powers "Recently Viewed" in the search overlay and the account
  // dashboard — a lightweight client-side view log, not a backend feature.
  useEffect(() => {
    recordRecentlyViewed(product);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product._id]);

  // Live, admin-configured shipping/returns copy (see Admin > Settings >
  // Shipping) — never hardcoded here.
  useEffect(() => {
    fetch("/api/shipping/config").then((res) => res.json()).then(setShippingConfig).catch(() => {});
  }, []);

  function onToggleWishlist() {
    if (!requireCustomerAuth()) return;
    toggleWishlist({
      id: product._id, slug: product.slug, name: product.name, sku: product.sku,
      price: product.price, compareAtPrice: product.compareAtPrice, image: product.images?.[0] ?? "",
      collection: product.collection, colors: product.colors, sizes: product.sizes,
      size: size || undefined, color: color || undefined, available: product.inStock,
    });
  }

  const images = product.images?.length ? product.images : [undefined, undefined];

  // `!product.inStock` always wins (defensive — guards against any product
  // saved before the admin-side inStock/variant-stock recompute fix landed,
  // where the two could still be out of sync). Otherwise, until a required
  // size is actually chosen there's no specific variant to check stock
  // against yet, so this deliberately reads as "not blocked" (Infinity) —
  // the existing "select a size" validation in addToCart() below already
  // handles that case; this only starts gating once there's a real
  // size/color combination to resolve.
  const currentStock = !product.inStock ? 0 : (!requiresSize || size) ? resolveStock(product, size, color) : Infinity;
  const outOfStock = currentStock <= 0;

  function addToCart() {
    // The mobile sticky bar (below) calls this same function but renders
    // far below the size selector — without scrolling there, its "Select a
    // size to continue" error would be invisible off-screen above the fold.
    if (requiresSize && !size) { setErr(true); sizeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    // The button calling this is already disabled when out of stock, but
    // this is the real gate — both the desktop button and the mobile sticky
    // bar call this same function, so guarding here covers both at once
    // rather than trusting each call site's own disabled state.
    if (resolveStock(product, size, color) <= 0) return;
    add(
      { id: product._id, slug: product.slug, name: product.name, sku: product.sku, price: product.price, image: product.images?.[0] ?? "", size, color },
      qty
    );
  }

  // Mobile swipe on the hero image — framer-motion's own drag gesture
  // (already a dependency, used elsewhere in this file for the accordion),
  // not a new library. Clamped to valid indices, same as the thumbnail rail.
  function onHeroDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -60) setActive((a) => Math.min(a + 1, images.length - 1));
    else if (info.offset.x > 60) setActive((a) => Math.max(a - 1, 0));
  }

  return (
    <div className="pt-24 pb-24 lg:pb-0">
      <nav className="px-5 md:px-12 py-4 font-mono text-[11px] tracking-wide text-stone uppercase">
        <Link href="/" className="hover:text-ink">Home</Link> / <Link href="/shop" className="hover:text-ink">Shop</Link> / <Link href={`/shop?category=${product.category}`} className="hover:text-ink">{categoryName}</Link> / <span className="text-ink">{product.name}</span>
      </nav>

      <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 px-5 md:px-12 pb-20">
        {/* gallery */}
        <div className="grid grid-cols-1 gap-3">
          <div className="relative aspect-[3/3.7] rounded-brand overflow-hidden bg-paper-2 group">
            <motion.div
              className="absolute inset-0"
              drag="x" dragSnapToOrigin dragElastic={0.3}
              onDragEnd={onHeroDragEnd}
            >
              <Frame
                src={images[active]} alt={`${product.name} — image ${active + 1} of ${images.length}`} tone={active}
                priority={active === 0}
                className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-105"
              />
            </motion.div>
            {product.isLimited && <span className="absolute top-4 left-4 bg-ink text-paper font-mono text-[10px] tracking-wider uppercase px-2.5 py-1.5 rounded-full pointer-events-none">Limited run</span>}
          </div>
          <div className="grid grid-cols-4 gap-3">
            {images.slice(0, 4).map((src, i) => (
              <button type="button"
                key={i} onClick={() => setActive(i)}
                aria-label={`Show image ${i + 1} of ${images.length}`}
                aria-current={active === i}
                className={`relative aspect-square rounded-brand overflow-hidden bg-paper-2 border transition-colors duration-200 ${active === i ? "border-ink" : "border-transparent hover:border-line"}`}
              >
                <Frame src={src} alt={`${product.name} thumbnail ${i + 1}`} tone={i} className="absolute inset-0 transition-transform duration-300 hover:scale-105" />
              </button>
            ))}
          </div>
        </div>

        {/* info — sticky on desktop */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <span className="eyebrow">{product.sku} · {categoryName}</span>
          <h1 className="font-display uppercase mt-4" style={{ fontWeight: 800, fontSize: "clamp(30px,3.6vw,52px)", lineHeight: 0.95, letterSpacing: "-0.02em" }}>{product.name}</h1>

          <div className="flex items-center gap-3 mt-5">
            <span className="font-mono text-[20px]">{formatConvertedProductPrice(product, currency, rate)}</span>
            {product.compareAtPrice && <span className="font-mono text-[15px] text-stone line-through">{formatConvertedPrice(product.compareAtPrice, currency, rate)}</span>}
            {product.rating > 0 && <span className="text-[12px] text-stone ml-1">★ {product.rating.toFixed(1)} ({product.reviewCount})</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-2.5 text-[12px] text-stone">
            <span className={`w-1.5 h-1.5 rounded-full ${!outOfStock ? "bg-ink" : "bg-stone"}`} aria-hidden />
            {outOfStock ? "Currently unavailable" : "In stock, ready to ship"}
          </div>

          {hasColors && (
            <div className="mt-9">
              <div className="flex justify-between mb-3"><span className="eyebrow">Colour</span><span className="text-[12px] text-stone">{color}</span></div>
              <div className="flex flex-wrap gap-2">
                {product.colors.map((c) => (
                  <button type="button" key={c} onClick={() => setColor(c)} className={`text-[12px] font-mono px-3 py-2 rounded-brand border transition ${color === c ? "bg-ink text-paper border-ink" : "border-line hover:border-ink"}`}>{c}</button>
                ))}
              </div>
            </div>
          )}

          {requiresSize && (
            <div className="mt-7" ref={sizeSectionRef}>
              <div className="flex justify-between mb-3">
                <span className="eyebrow">Size</span>
                <Link href="/size-guide" className="text-[12px] text-stone underline">Size guide</Link>
              </div>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((s) => {
                  // Only meaningfully "sold out" for a size when real
                  // per-variant stock data exists for it — a product with no
                  // `variants` array at all has no per-size stock to check,
                  // so every size stays selectable there (same fallback the
                  // simple product-level inStock flag already covers).
                  const sizeSoldOut = !!product.variants?.length && resolveStock(product, s, color) <= 0;
                  return (
                    <button
                      type="button" key={s} disabled={sizeSoldOut}
                      onClick={() => { setSize(s); setErr(false); }}
                      aria-label={sizeSoldOut ? `${s} (sold out)` : s}
                      className={`min-w-[52px] text-[13px] font-mono px-3 py-2.5 rounded-brand border transition ${
                        size === s ? "bg-ink text-paper border-ink"
                        : sizeSoldOut ? "border-line text-stone/50 line-through cursor-not-allowed"
                        : "border-line hover:border-ink"
                      }`}
                    >{s}</button>
                  );
                })}
              </div>
              {err && <p role="alert" className="text-[12px] text-stone mt-2">Select a size to continue.</p>}
            </div>
          )}

          {/* qty + add */}
          <div className="flex gap-3 mt-9">
            <div className={`flex items-center border border-line rounded-brand ${outOfStock ? "opacity-40" : ""}`}>
              <button type="button" aria-label="Decrease quantity" disabled={outOfStock} className="px-3.5 py-3 disabled:cursor-not-allowed" onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus size={14} /></button>
              <span className="font-mono text-[14px] w-8 text-center" aria-live="polite">{qty}</span>
              <button
                type="button" aria-label="Increase quantity" disabled={outOfStock || qty >= currentStock}
                className="px-3.5 py-3 disabled:cursor-not-allowed"
                onClick={() => setQty((q) => Math.min(q + 1, currentStock))}
              ><Plus size={14} /></button>
            </div>
            <button type="button" onClick={addToCart} disabled={outOfStock} className="btn flex-1 justify-center disabled:opacity-40 disabled:pointer-events-none">
              <span>{outOfStock ? "Sold out" : `Add to bag — ${formatConvertedPrice(product.price * qty, currency, rate)}`}</span>
            </button>
            <button type="button"
              aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
              aria-pressed={wishlisted}
              onClick={onToggleWishlist}
              className={`border rounded-brand px-4 grid place-items-center transition ${wishlisted ? "border-ink" : "border-line hover:border-ink"}`}
            >
              <Heart size={17} className={wishlisted ? "fill-current" : ""} />
            </button>
          </div>

          {/* trust indicators */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-7 pt-6 border-t border-line">
            {TRUST_BADGES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-[12px] text-stone">
                <Icon size={15} className="shrink-0 text-ink-2" aria-hidden />
                {label}
              </div>
            ))}
          </div>

          {/* product information */}
          <div className="mt-10 border-t border-line">
            <Accordion title="Description" defaultOpen>
              <RichContent html={descriptionHtml} className="max-w-[460px]" />
            </Accordion>
            <Accordion title="Shipping">
              <div className="text-[14px] text-ink-2 leading-relaxed max-w-[460px] space-y-1.5">
                <p>{shippingConfig?.processingTimeText ?? "Dispatched within 3-5 working days."}</p>
                <p>Estimated delivery: {shippingConfig?.estimatedDeliveryText ?? "7-12 working days"}.</p>
              </div>
            </Accordion>
            <Accordion title="Materials & care">
              <p className="text-[14px] text-ink-2 leading-relaxed max-w-[460px]">{product.materials || "Crafted from premium natural fibres. Specialist clean recommended."}</p>
            </Accordion>
            <Accordion title="Authenticity">
              <p className="text-[14px] text-ink-2 leading-relaxed max-w-[460px]">Every piece is inspected and verified before it&rsquo;s listed. If anything about your order doesn&rsquo;t meet that standard, our returns policy has you covered.</p>
            </Accordion>
          </div>
        </div>
      </div>

      {/* related */}
      {related.length > 0 && (
        <section className="px-5 md:px-12 py-16 border-t border-line">
          <div className="flex justify-between items-end mb-10">
            <h2 className="display" style={{ fontSize: "clamp(26px,3.5vw,48px)" }}>Complete the look</h2>
            <Link href={`/shop?category=${product.category}`} className="text-[12px] uppercase tracking-wide underline">View all</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 md:gap-6">
            {related.map((p, i) => <ProductCard key={p._id} product={p} index={i} />)}
          </div>
        </section>
      )}

      {/* Mobile sticky "Add to bag" bar — the main add-to-bag control above
          is only `sticky` from `lg:` up (see the info panel wrapper), so on
          mobile it scrolls away with the rest of the info column and a
          customer has to scroll back up past the accordion to reach it
          again. This mirrors the same addToCart()/qty/price already used
          above rather than duplicating any cart logic. pb accounts for the
          iOS home-indicator gesture area via --safe-bottom. */}
      <div
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex items-center gap-3 px-5 pt-3 bg-paper border-t border-line shadow-[0_-4px_20px_rgba(17,17,17,0.06)]"
        style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium truncate">{product.name}</div>
          <div className="font-mono text-[13px] text-ink-2">{formatConvertedPrice(product.price * qty, currency, rate)}</div>
        </div>
        <button type="button" onClick={addToCart} disabled={outOfStock} className="btn shrink-0 disabled:opacity-40 disabled:pointer-events-none">
          <span>{outOfStock ? "Sold out" : "Add to bag"}</span>
        </button>
      </div>
    </div>
  );
}
