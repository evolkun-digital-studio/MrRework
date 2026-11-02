"use client";
import Link from "next/link";
import type { Product } from "@/lib/types";

// Homepage hero's two stacked promo tiles — real catalogue photography (see
// page.tsx: sliced from the same getFeatured() call the Collection rail
// below already uses) instead of generic banner images. Purely a link
// through to the product page — no price badge/quick-add here.
export function HeroPromoCard({ product, label, heading }: { product?: Product; label: string; heading: string }) {
  const href = product ? `/product/${product.slug}` : "/shop";
  const image = product?.images?.[0];

  return (
    <Link
      href={href}
      className="group relative flex-1 overflow-hidden rounded-brand-lg min-h-[133px] md:min-h-[223px] block shadow-[0_4px_14px_rgba(17,17,17,0.05)]"
    >
      {image ? (
        <div
          className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-110"
          style={{ backgroundImage: `url("${image}")`, backgroundSize: "cover", backgroundPosition: "center" }}
        />
      ) : (
        <div className="absolute inset-0 bg-paper-2" />
      )}
      <div
        className="absolute inset-0 transition-opacity duration-500 group-hover:opacity-90"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.18) 32%, rgba(0,0,0,0) 58%)" }}
      />
      <div className="relative z-10 h-full flex flex-col justify-end p-5 md:p-6">
        <span className="eyebrow-accent-invert block mb-1.5">{label}</span>
        <h3
          className="font-display text-white uppercase"
          style={{
            fontWeight: 600,
            fontSize: "clamp(21px,0vw,38px)",
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
          }}
        >
          {heading}
        </h3>
      </div>
    </Link>
  );
}
