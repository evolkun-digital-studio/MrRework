"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Star, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { formatConvertedProductPrice } from "@/lib/utils";
import { useCurrency } from "@/lib/currencyStore";
import type { FeaturedReview } from "@/lib/types";

// 1 (peek) on mobile, 3 from md up (was 2) — width computed against the
// rail's own gap-6 (24px) so 2 gaps between 3 cards divide out evenly.
const ITEM_WIDTH_CLASS = "w-[88%] md:w-[calc((100%-48px)/3)]";

// Card height is 420/450px * 0.55 (a 45% reduction) — internal spacing/type
// scaled down to match (smaller padding, 2-line body clamp instead of 4,
// compact product details) so the shorter card doesn't clip content.
function ReviewCard({ review }: { review: FeaturedReview }) {
  const { currency, rate } = useCurrency();

  return (
    <div className="flex h-[231px] md:h-[248px] w-full overflow-hidden rounded-[14px] bg-white border border-line shadow-[0_2px_16px_rgba(17,17,17,0.06)]">
      <div className="flex flex-1 flex-col p-3 md:p-4 min-w-0">
        <div className="flex items-center gap-0.5 text-amber-400">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={12} className={i < review.rating ? "fill-current" : ""} />
          ))}
        </div>

        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          <span className="text-[12.5px] font-semibold text-ink">{review.author}</span>
          {review.verified && (
            <span className="inline-flex items-center gap-1 text-[10.5px] italic text-ink-2">
              <Check size={11} /> Verified
            </span>
          )}
        </div>

        {review.body && (
          <p className="mt-1.5 text-[12px] leading-snug text-ink-2 line-clamp-2">{review.body}</p>
        )}

        <div className="mt-auto pt-2">
          <div className="border-t border-line" />
          {review.product && (
            <Link href={`/product/${review.product.slug}`} className="mt-2 flex items-center group/product">
              <div className="min-w-0">
                <div className="text-[11.5px] font-semibold text-ink truncate group-hover/product:underline">{review.product.name}</div>
                <div className="text-[11px] text-ink-2">{formatConvertedProductPrice(review.product, currency, rate)}</div>
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// "Happy Customers" — admin-curated via the existing Admin -> Reviews
// moderation page (Feature toggle + Verified toggle + homepage photo), no
// separate CMS section needed since Review already has everything else
// (author, rating, body, linked product). See getFeaturedReviews() in
// src/lib/data.ts. Same native overflow-x + scroll-snap carousel mechanics
// as every other homepage rail.
export function HappyCustomersSection({ reviews }: { reviews: FeaturedReview[] }) {
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
  }, [updateArrows, reviews.length]);

  function scrollByPage(direction: 1 | -1) {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.95, behavior: "smooth" });
  }

  if (reviews.length === 0) return null;

  const arrowClass =
    "hidden sm:flex items-center justify-center w-11 h-11 rounded-full bg-white shadow-[0_2px_10px_rgba(17,17,17,0.15)] transition-colors duration-200 hover:bg-ink [&:hover_svg]:text-white disabled:cursor-not-allowed disabled:opacity-0 absolute top-1/2 -translate-y-1/2 z-30";

  return (
    <section className="px-5 md:px-8 lg:px-12 py-14 md:py-20 bg-paper">
      <div className="text-center mb-10 md:mb-12">
        <h2 className="font-display text-ink" style={{ fontWeight: 800, fontSize: "clamp(32px,4vw,44px)", letterSpacing: "-0.01em" }}>
          Happy Customers
        </h2>
        <p className="mt-3 text-[15px] md:text-[16px] text-ink-2">
          Customers love our products and we always strive to please them all.
        </p>
      </div>

      <div className="relative">
        <button type="button" onClick={() => scrollByPage(-1)} aria-label="Previous reviews" disabled={!canLeft} className={`${arrowClass} left-1 md:left-3`}>
          <ChevronLeft size={19} className="text-ink" />
        </button>

        <div
          ref={railRef}
          className="flex gap-6 overflow-x-auto overflow-y-hidden no-scrollbar snap-x snap-mandatory"
          style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
        >
          {reviews.map((r, i) => (
            <div key={r._id} className={`shrink-0 ${i === reviews.length - 1 ? "snap-end" : "snap-start"} ${ITEM_WIDTH_CLASS}`}>
              <ReviewCard review={r} />
            </div>
          ))}
        </div>

        <button type="button" onClick={() => scrollByPage(1)} aria-label="Next reviews" disabled={!canRight} className={`${arrowClass} right-1 md:right-3`}>
          <ChevronRight size={19} className="text-ink" />
        </button>
      </div>
    </section>
  );
}
