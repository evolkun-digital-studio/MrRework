"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RAIL_BLEED_CLASS, RAIL_PADDING_CLASS, CARD_GAP_CLASS, CARD_ITEM_WIDTH_CLASS } from "@/lib/productRailLayout";
import BestSellingCard from "./BestSellingCard";
import type { CardProduct } from "./ProductCard";

// Rail wrapper for the homepage's Trending rail — same underlying scroll
// mechanics as the shared ProductRail (native overflow-x + scroll-snap, no
// hand-rolled drag), plus visible prev/next arrow buttons layered on top
// (same arrowClass pattern as CategoryCarousel.tsx). Renders BestSellingCard
// at the shared CARD_ITEM_WIDTH_CLASS/CARD_GAP_CLASS sizing so Trending's
// cards are pixel-identical to the Best Selling rail above it, per the
// "make Trending match Best Selling" design pass. Arrows call scrollBy on
// the native rail rather than replacing it, so touch/trackpad scrolling
// still works exactly as it does on the other homepage rails.
export function HomeProductRail({ products }: { products: CardProduct[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

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
  }, [updateArrows, products.length]);

  function scrollByPage(direction: 1 | -1) {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
  }

  const arrowClass =
    "hidden md:flex items-center justify-center w-10 h-10 rounded-full bg-white border border-line shadow-[0_4px_14px_rgba(17,17,17,0.08)] transition-all duration-300 hover:scale-105 hover:shadow-[0_6px_20px_rgba(17,17,17,0.14)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100 disabled:hover:shadow-[0_4px_14px_rgba(17,17,17,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink absolute top-1/2 -translate-y-1/2 z-30";

  if (products.length === 0) return null;

  return (
    <div className={`relative ${RAIL_BLEED_CLASS}`}>
      <button type="button" onClick={() => scrollByPage(-1)} aria-label="Previous products" disabled={!canLeft} className={`${arrowClass} left-1 md:left-3`}>
        <ChevronLeft size={18} className="text-ink" />
      </button>

      <div
        ref={railRef}
        className={`flex ${CARD_GAP_CLASS} overflow-x-auto overflow-y-hidden no-scrollbar snap-x snap-mandatory pb-2 ${RAIL_PADDING_CLASS} scroll-pl-5 md:scroll-pl-8 lg:scroll-pl-12 scroll-pr-5 md:scroll-pr-8 lg:scroll-pr-12`}
        style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
      >
        {products.map((p, i) => (
          <div
            key={p._id}
            className={`shrink-0 ${i === products.length - 1 ? "snap-end" : "snap-start"} ${CARD_ITEM_WIDTH_CLASS}`}
          >
            <BestSellingCard product={p} />
          </div>
        ))}
      </div>

      <button type="button" onClick={() => scrollByPage(1)} aria-label="Next products" disabled={!canRight} className={`${arrowClass} right-1 md:right-3`}>
        <ChevronRight size={18} className="text-ink" />
      </button>

      <div className="absolute left-0 top-0 bottom-2 w-5 md:w-8 lg:w-12 bg-gradient-to-r from-[var(--paper)] to-transparent pointer-events-none z-20" />
      <div className="absolute right-0 top-0 bottom-2 w-5 md:w-8 lg:w-12 bg-gradient-to-l from-[var(--paper)] to-transparent pointer-events-none z-20" />
    </div>
  );
}
