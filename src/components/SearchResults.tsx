"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import type { Product } from "@/lib/types";

export default function SearchResults() {
  const searchParams = useSearchParams();
  const q = searchParams?.get("q")?.trim() ?? "";

  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  const load = useCallback(
    async (pg: number, append: boolean) => {
      if (!q) { setItems([]); setTotal(0); setLoading(false); return; }
      const id = ++reqId.current;
      setLoading(true);
      const res = await fetch(`/api/products?q=${encodeURIComponent(q)}&page=${pg}&limit=12`);
      const data = await res.json();
      if (id !== reqId.current) return; // ignore stale responses
      setItems((prev) => (append ? [...prev, ...data.items] : data.items));
      setTotal(data.total);
      setHasMore(data.hasMore);
      setPage(data.page);
      setLoading(false);
    },
    [q]
  );

  useEffect(() => { load(1, false); }, [load]);

  return (
    <div className="px-5 md:px-12 pt-32 pb-24 min-h-[70dvh]">
      <div className="border-b border-line pb-7 mb-8">
        <span className="eyebrow">Search results</span>
        <h1 className="display mt-3 truncate" style={{ fontSize: "clamp(30px,5vw,64px)" }}>
          {q ? `“${q}”` : "Search"}
        </h1>
        {!loading && <p className="font-mono text-[12px] text-stone mt-3">{total} {total === 1 ? "result" : "results"}</p>}
      </div>

      {loading && items.length === 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 md:gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-[4/5] bg-paper-2 animate-pulse" />
              <div className="h-[86px] mt-3" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-24 text-center">
          <p className="display text-2xl mb-3">No products found</p>
          <p className="text-stone text-sm mb-6">Try another keyword.</p>
          <Link href="/shop" className="btn"><span>Continue shopping</span></Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 md:gap-6">
            {items.map((p, i) => <ProductCard key={p._id} product={p} index={i} />)}
          </div>
          {hasMore && (
            <div className="flex justify-center mt-14">
              <button type="button" onClick={() => load(page + 1, true)} disabled={loading} className="btn btn-ghost"><span>{loading ? "Loading…" : "Load more"}</span></button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
