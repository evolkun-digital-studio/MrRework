"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

const INITIAL_PARAGRAPHS = [
  "MrRework is a trusted vintage clothing wholesale supplier specialising in authentic, handpicked pieces from the 80s, 90s and Y2K era. We supply independent boutiques, online resellers, thrift stores, live sellers and fashion startups across the UK, Europe, USA and 20+ countries worldwide.",
  "Our wholesale inventory includes Carhartt workwear, Levi's denim, Ralph Lauren Polo, Harley-Davidson tees, Dickies carpenter pants, vintage flannels, heavyweight graphic tees, racing jackets, sportswear and rare archive pieces all graded and ready for bulk orders.",
  "Every season we add fresh vintage bales and handpicked drops so resellers and stores always have access to the latest in-demand vintage styles. Whether you're sourcing oversized graphic tees, vintage sweatshirts, utility workwear, Y2K streetwear or rare archive-style pieces, our stock is curated to meet real market demand.",
  "All stock is available in Grade A, Grade AB and Grade B, clearly labelled so you know exactly what you're buying before it ships.",
];

const REMAINING_PARAGRAPHS = [
  "We work with vintage retailers, independent boutiques, market sellers, eBay & Depop resellers, live sellers and fashion startups looking for reliable, affordable wholesale vintage stock. Our inventory spans multiple categories, styles, sizes and fashion eras, making it easy for businesses to source unique pieces in bulk.",
  "Beyond supply, MrRework focuses on consistent quality, transparent communication and long-term business partnerships. Our goal is to help resellers and brands build collections that stand out in a crowded market.",
  "Explore our latest vintage arrivals, seasonal wholesale drops and warehouse stock updates to discover authentic vintage clothing for modern streetwear culture and the global resale market.",
];

export function WholesaleEditorial() {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  // Track the paragraphs' real height (not a guessed constant) so max-height
  // animates proportionally across the whole transition instead of sitting
  // idle while max-height is still above the actual content — that dead zone
  // is what made the collapse feel like it "jumped" near the end. Re-measures
  // on any resize (font load, viewport change, orientation change, etc.).
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setContentHeight(el.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="px-5 md:px-8 lg:px-12 xl:px-16 py-20 md:py-28">
      <div className="w-full max-w-[1700px] mx-auto">
        <h2
          className="font-display md:whitespace-nowrap"
          style={{
            fontWeight: 600,
            fontSize: "clamp(21px, 2AAvw,38px)",
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
            color: "var(--ink)",
          }}
        >
          Vintage Clothing Wholesale UK, Europe, USA &amp; Worldwide
        </h2>

        <div className="relative">
          <div className="mt-8 space-y-8 text-[15px] leading-7 md:leading-8 text-ink-2">
            {INITIAL_PARAGRAPHS.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          {/* Hints that more content exists below — fades out (not an abrupt
              disappearance) once expanded, since the real content beneath it
              no longer needs masking. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[var(--paper)] to-transparent transition-opacity duration-500 ease-brand ${
              expanded ? "opacity-0" : "opacity-100"
            }`}
          />
        </div>

        {/* Expand/collapse via max-height + opacity, per spec — max-height
            animates to the paragraphs' own measured height (see contentRef
            above), not a guessed constant, so the motion is smooth and
            proportional across the entire transition with no dead zone and
            no jump. The button right after this flows naturally with it. */}
        <div
          id="wholesale-editorial-more"
          aria-hidden={!expanded}
          className="overflow-hidden transition-[max-height,opacity] duration-500 ease-brand"
          style={{ maxHeight: expanded ? contentHeight : 0, opacity: expanded ? 1 : 0 }}
        >
          <div ref={contentRef} className="space-y-8 pt-5 text-[15px] leading-7 md:leading-8 text-ink-2">
            {REMAINING_PARAGRAPHS.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="wholesale-editorial-more"
          className="mt-8 inline-flex items-center gap-2 rounded-full border border-line bg-paper px-6 py-3 text-[12.5px] uppercase tracking-wide transition hover:border-ink hover:bg-paper-2"
        >
          {expanded ? "Read Less" : "Read More"}
          <ChevronDown
            size={15}
            aria-hidden="true"
            className={`transition-transform duration-500 ease-brand ${expanded ? "rotate-180" : "rotate-0"}`}
          />
        </button>
      </div>
    </section>
  );
}
