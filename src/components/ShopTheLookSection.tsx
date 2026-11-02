"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Star, X } from "lucide-react";
import { RAIL_PADDING_CLASS } from "@/lib/productRailLayout";
import { formatConvertedProductPrice } from "@/lib/utils";
import { useCurrency } from "@/lib/currencyStore";
import type { ShopTheLook, ShopTheLookHotspot } from "@/lib/types";

const ITEM_WIDTH_CLASS = "w-[68%] sm:w-[46%] md:w-[31%] lg:w-[23%] xl:w-[19%]";

type OpenHotspot = { key: string; hotspot: ShopTheLookHotspot; rect: DOMRect };

// Portalled to <body> and positioned `fixed` from the trigger button's own
// getBoundingClientRect() — not absolutely positioned inside the (horizontally
// scrolling, vertically clipped) carousel track, which would otherwise clip
// any popup anchored to a hotspot near the bottom of a card. Closes itself on
// scroll/resize (see the section component below) rather than trying to
// track the anchor's moving position. Anchored BELOW the dot (reference:
// the popup drops down from the hotspot, not up), horizontally centered and
// clamped so it never runs past the viewport edge.
function HotspotPopup({ open, onClose }: { open: OpenHotspot; onClose: () => void }) {
  const { currency, rate } = useCurrency();
  const { hotspot, rect } = open;
  const product = hotspot.product;
  if (!product) return null;
  const image = product.images?.[0];
  const rating = Math.round(product.rating ?? 0);

  const POPUP_WIDTH = 288;
  const centerX = rect.left + rect.width / 2;
  const nearLeftEdge = centerX - POPUP_WIDTH / 2 < 12;
  const nearRightEdge = centerX + POPUP_WIDTH / 2 > window.innerWidth - 12;
  const left = nearLeftEdge ? rect.left : nearRightEdge ? rect.right - POPUP_WIDTH : centerX - POPUP_WIDTH / 2;

  return createPortal(
    <div
      role="dialog"
      aria-label={product.name}
      className="fixed z-[400] rounded-xl bg-white shadow-[0_16px_40px_rgba(17,17,17,0.24)] p-4"
      style={{ left, width: POPUP_WIDTH, top: rect.bottom + 12 }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button" onClick={onClose} aria-label="Close"
        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-ink text-white grid place-items-center shadow-[0_2px_6px_rgba(17,17,17,0.3)]"
      >
        <X size={12} strokeWidth={2} />
      </button>

      <div className="flex gap-3">
        <div className="relative w-[76px] h-[76px] shrink-0 overflow-hidden rounded-lg bg-paper-2">
          {image && <Image src={image} alt={product.name} fill sizes="76px" className="object-cover" />}
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-ink leading-snug">{product.name}</div>
          <div className="mt-1 flex items-center gap-0.5 text-amber-400">
            {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={12} className={i < rating ? "fill-current" : ""} />)}
          </div>
          <div className="mt-1.5 text-[14px] font-semibold text-ink">{formatConvertedProductPrice(product, currency, rate)}</div>
        </div>
      </div>

      <Link
        href={`/product/${product.slug}`}
        className="mt-3 flex items-center justify-center w-full rounded-full bg-ink text-white text-[12px] font-medium py-2 transition-colors duration-200 hover:bg-ink-2"
      >
        View Product
      </Link>
    </div>,
    document.body
  );
}

function LookCard({ slide, index, openKey, onOpenHotspot }: {
  slide: ShopTheLook; index: number; openKey: string | null; onOpenHotspot: (key: string, h: ShopTheLookHotspot, rect: DOMRect) => void;
}) {
  return (
    <div className="relative aspect-[3/4.4] w-full overflow-hidden rounded-[16px] bg-paper-2">
      {slide.image && (
        <Image
          src={slide.image}
          alt=""
          fill
          loading={index < 3 ? "eager" : "lazy"}
          sizes="(max-width:640px) 68vw, (max-width:1024px) 31vw, 19vw"
          className="hidden sm:block object-cover"
        />
      )}
      {(slide.mobileImage || slide.image) && (
        <Image
          src={slide.mobileImage || slide.image}
          alt=""
          fill
          loading={index < 3 ? "eager" : "lazy"}
          sizes="68vw"
          className="block sm:hidden object-cover"
        />
      )}

      {/* Anchored to the card's top-right corner (was positioned per-hotspot
          via h.x/h.y, centered on the garment) and sized ~30% smaller
          (w-9/h-9 -> w-[25px]/h-[25px], inner dot w-2/h-2 -> w-1.5/h-1.5)
          per the redesign — one compact "shop this look" trigger per card
          rather than a garment-tagged dot. */}
      {slide.hotspots.map((h, hi) => {
        const key = `${slide._id}:${hi}`;
        const active = openKey === key;
        return (
          <button
            key={hi}
            type="button"
            aria-label={h.product ? `View ${h.product.name}` : "Shop this item"}
            aria-expanded={active}
            onClick={(e) => { e.stopPropagation(); onOpenHotspot(key, h, e.currentTarget.getBoundingClientRect()); }}
            className={`absolute top-3 right-3 z-20 w-[25px] h-[25px] rounded-full shadow-[0_2px_10px_rgba(17,17,17,0.3)] grid place-items-center transition-all duration-200 hover:scale-110 ${
              active ? "bg-[#D64545]" : "bg-white"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-200 ${active ? "bg-white" : "bg-black"}`} />
          </button>
        );
      })}
    </div>
  );
}

// "Shop The Look" — pixel-match clone of a specific external reference:
// full-bleed portrait editorial carousel with clickable white/black-dot
// hotspots that open a small shoppable popup (image/name/price/View
// Product), admin-managed at Admin -> Content -> Shop The Look. Same
// native overflow-x + scroll-snap carousel mechanics as every other
// homepage rail.
export function ShopTheLookSection({ slides }: { slides: ShopTheLook[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [open, setOpen] = useState<OpenHotspot | null>(null);

  const updateArrows = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = railRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    el.addEventListener("scroll", updateArrows, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", updateArrows);
    };
  }, [updateArrows, slides.length]);

  // Closed rather than repositioned on scroll/resize — the popup is
  // anchored to a rect captured at click time, which goes stale the moment
  // the page or the carousel scrolls.
  useEffect(() => {
    if (!open) return;
    function close() { setOpen(null); }
    document.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function scrollByPage(direction: 1 | -1) {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
  }

  if (slides.length === 0) return null;

  const arrowClass =
    "hidden sm:flex items-center justify-center w-11 h-11 rounded-full bg-white shadow-[0_2px_10px_rgba(17,17,17,0.15)] transition-colors duration-200 hover:bg-ink [&:hover_svg]:text-white disabled:cursor-not-allowed disabled:opacity-0 absolute top-1/2 -translate-y-1/2 z-30";

  return (
    <section className="py-14 md:py-20">
      <h2
        className="font-display text-center text-ink mb-10 md:mb-12 px-5"
        style={{ fontWeight: 700, fontSize: "clamp(32px,4vw,44px)", letterSpacing: "-0.01em" }}
      >
        Shop The Look
      </h2>

      <div className="relative">
        <button type="button" onClick={() => scrollByPage(-1)} aria-label="Previous looks" disabled={!canLeft} className={`${arrowClass} left-1 md:left-3`}>
          <ChevronLeft size={19} className="text-ink" />
        </button>

        <div
          ref={railRef}
          className={`flex gap-3 md:gap-4 overflow-x-auto overflow-y-hidden no-scrollbar snap-x snap-mandatory ${RAIL_PADDING_CLASS}`}
          style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
        >
          {slides.map((slide, i) => (
            <div key={slide._id} className={`shrink-0 ${i === slides.length - 1 ? "snap-end" : "snap-start"} ${ITEM_WIDTH_CLASS}`}>
              <LookCard slide={slide} index={i} openKey={open?.key ?? null} onOpenHotspot={(key, hotspot, rect) => setOpen({ key, hotspot, rect })} />
            </div>
          ))}
        </div>

        <button type="button" onClick={() => scrollByPage(1)} aria-label="Next looks" disabled={!canRight} className={`${arrowClass} right-1 md:right-3`}>
          <ChevronRight size={19} className="text-ink" />
        </button>
      </div>

      {open && <HotspotPopup open={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
