"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RAIL_BLEED_CLASS, RAIL_PADDING_CLASS, CARD_ITEM_WIDTH_CLASS } from "@/lib/productRailLayout";
import BestSellingCard from "./BestSellingCard";
import type { CardProduct } from "./ProductCard";

// Pixel-match clone of a reference "Best Selling" carousel (bottom-anchored
// image, no star rating, countdown pill). BestSellingCard is also reused by
// HomeProductRail (the Trending rail) so both homepage sections render
// identical cards at the same size — see CARD_ITEM_WIDTH_CLASS in
// productRailLayout.ts. Same native overflow-x + scroll-snap mechanics as
// every other homepage rail — no drag/carousel library.
export function BestSellingSection({
  products, title = "Best Selling",
  subtitle = "Unmatched design—superior performance and customer satisfaction in one.",
  ctaEnabled = true, ctaText = "View Products", ctaHref = "/bestsellers",
}: {
  products: CardProduct[];
  title?: string;
  subtitle?: string;
  ctaEnabled?: boolean;
  ctaText?: string;
  ctaHref?: string;
}) {
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

  if (products.length === 0) return null;

  const arrowClass =
    "hidden sm:flex items-center justify-center w-11 h-11 rounded-full bg-white shadow-[0_2px_10px_rgba(17,17,17,0.15)] transition-colors duration-200 hover:bg-ink [&:hover_svg]:text-white disabled:cursor-not-allowed disabled:opacity-0 absolute top-1/2 -translate-y-1/2 z-30";

  return (
    <section className="px-5 md:px-8 lg:px-12 py-10 md:py-16">
      <div className="text-center mb-10 md:mb-12">
        <h2
          className="font-display text-ink"
          style={{ fontWeight: 700, fontSize: "clamp(32px,2.5vw,44px)", letterSpacing: "-0.01em" }}
        >
          {title}
        </h2>
        <p className="mt-3 text-[15px] md:text-[16px] text-ink-2">
          {subtitle}
        </p>
      </div>

      <div className={`relative ${RAIL_BLEED_CLASS}`}>
        <button type="button" onClick={() => scrollByPage(-1)} aria-label="Previous products" disabled={!canLeft} className={`${arrowClass} left-1 md:left-3`}>
          <ChevronLeft size={19} className="text-ink" />
        </button>

        <div
          ref={railRef}
          className={`flex gap-6 overflow-x-auto overflow-y-hidden no-scrollbar snap-x snap-mandatory pb-2 ${RAIL_PADDING_CLASS} scroll-pl-5 md:scroll-pl-8 lg:scroll-pl-12 scroll-pr-5 md:scroll-pr-8 lg:scroll-pr-12`}
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
          <ChevronRight size={19} className="text-ink" />
        </button>
      </div>

      {ctaEnabled && (
        <div className="text-center mt-10 md:mt-12">
          <Link href={ctaHref} className="btn">
            <span>{ctaText}</span>
          </Link>
        </div>
      )}
    </section>
  );
}
