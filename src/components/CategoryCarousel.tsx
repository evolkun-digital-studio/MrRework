"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RAIL_PADDING_CLASS } from "@/lib/productRailLayout";

interface CategoryItem {
  label: string;
  slug: string;
}

// "Bundles"/"THE NORTH FACE"/"harley davidson" all become "Bundles"/"The
// north face"/"Harley davidson" — only the string's own first letter is
// capitalized, regardless of the source label's original casing. A plain
// CSS `capitalize` utility would title-case every word instead, which
// isn't the same thing.
function sentenceCase(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

export function CategoryCarousel({ items, title }: { items: CategoryItem[]; title: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const updateArrows = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    // 1px tolerance — fractional scroll positions (sub-pixel zoom/DPR
    // rounding) can otherwise leave the end arrow permanently "enabled" by
    // a hair even once fully scrolled.
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = railRef.current;
    if (!el) return;
    // Resize matters as much as scroll here: how many cards fit (and
    // therefore whether the rail can scroll at all) changes at each
    // breakpoint, independent of any actual scrolling.
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    el.addEventListener("scroll", updateArrows, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", updateArrows);
    };
  }, [updateArrows]);

  function scrollByPage(direction: 1 | -1) {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") { e.preventDefault(); scrollByPage(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); scrollByPage(-1); }
  }

  const arrowClass =
    "flex items-center justify-center w-10 h-10 rounded-full bg-white border border-line shadow-[0_4px_14px_rgba(17,17,17,0.08)] transition-all duration-300 hover:scale-105 hover:shadow-[0_6px_20px_rgba(17,17,17,0.14)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100 disabled:hover:shadow-[0_4px_14px_rgba(17,17,17,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";

  return (
  <div>
    <div
      className={`flex items-center justify-between mb-6 ${RAIL_PADDING_CLASS}`}
    >
      <h2
        className="font-display"
        style={{
          fontWeight: 600,
          fontSize: "clamp(21px, 0vw,38px)",
          lineHeight: 1.05,
          letterSpacing: "-0.01em",
          textTransform: "uppercase",
          color: "var(--ink)",
        }}
      >
        {title}
      </h2>

      {(canLeft || canRight) && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            aria-label="Previous categories"
            className={arrowClass}
            disabled={!canLeft}
          >
            <ChevronLeft size={18} className="text-ink" />
          </button>

          <button
            type="button"
            onClick={() => scrollByPage(1)}
            aria-label="Next categories"
            className={arrowClass}
            disabled={!canRight}
          >
            <ChevronRight size={18} className="text-ink" />
          </button>
        </div>
      )}
    </div>

    <div className="relative">
      <div
        ref={railRef}
        role="region"
        aria-label="Shop by category"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={`flex flex-nowrap overflow-x-auto no-scrollbar scroll-smooth snap-x gap-2 py-2 ${RAIL_PADDING_CLASS} scroll-pl-5 md:scroll-pl-8 lg:scroll-pl-12 scroll-pr-5 md:scroll-pr-8 lg:scroll-pr-12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-4`}
      >
        {items.map((item) => (
          <Link
            key={item.slug}
            href={`/shop?category=${item.slug}`}
            className="group shrink-0 snap-start w-fit h-[35px] rounded-full border border-black bg-black flex items-center justify-center text-center px-5 shadow-[0_2px_10px_rgba(17,17,17,0.05)] transition-all duration-300 ease-out hover:-translate-y-1 hover:bg-green hover:border-green hover:shadow-[0_12px_28px_rgba(17,17,17,0.10)]"
          >
            <span
              className="font-display whitespace-nowrap text-[11px] md:text-[12px] tracking-[0.04em] text-white"
              style={{ fontWeight: 400 }}
            >
              {sentenceCase(item.label)}
            </span>
          </Link>
        ))}
      </div>
      {canLeft && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-12 md:w-20 bg-gradient-to-r from-paper via-paper/85 to-transparent" />}
      {canRight && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-12 md:w-20 bg-gradient-to-l from-paper via-paper/85 to-transparent" />}
    </div>
  </div>
);
}
