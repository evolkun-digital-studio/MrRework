"use client";
import { memo } from "react";
import type { LucideIcon } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import EmptyMini from "./EmptyMini";
import type { Product } from "@/lib/types";

// Shared horizontal-scroll product row — used for both "Recently viewed" and
// "You may also like" on the dashboard, since they're the same layout with
// different data/copy. Reuses the real, untouched ProductCard component.
function ProductRow({
  title, products, emptyIcon: EmptyIcon, emptyText, loading,
}: { title: string; products: Product[]; emptyIcon: LucideIcon; emptyText: string; loading?: boolean }) {
  if (!loading && products.length === 0) {
    return (
      <section aria-labelledby={`row-${title}`}>
        <h2 id={`row-${title}`} className="eyebrow mb-4">{title}</h2>
        <div className="border border-line rounded-brand">
          <EmptyMini icon={EmptyIcon} text={emptyText} />
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby={`row-${title}`}>
      <h2 id={`row-${title}`} className="eyebrow mb-4">{title}</h2>
      <div className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar gap-4 md:gap-6 pb-1 -mx-5 px-5 md:mx-0 md:px-0">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-[46vw] sm:w-[220px] md:w-[240px] shrink-0 snap-start">
                <div className="aspect-[4/5] bg-paper-2 animate-pulse" />
                <div className="h-[86px] mt-3" />
              </div>
            ))
          : products.map((p, i) => (
              <div key={p._id} className="w-[46vw] sm:w-[220px] md:w-[240px] shrink-0 snap-start">
                <ProductCard product={p} index={i} />
              </div>
            ))}
      </div>
    </section>
  );
}

export default memo(ProductRow);
