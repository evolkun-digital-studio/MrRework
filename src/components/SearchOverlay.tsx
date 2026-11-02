"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, SearchX } from "lucide-react";
import ProductCard, { type CardProduct as CompactProduct } from "./ProductCard";
import { readRecentlyViewed, type RecentlyViewedItem } from "@/lib/recentlyViewed";
import type { Category } from "@/lib/types";

// Recently-viewed entries are full Product snapshots (shared with the
// account dashboard, which renders them with the full ProductCard) — this
// overlay only has room for the compact card, so it trims them down here.
function toCompact(p: RecentlyViewedItem): CompactProduct {
  return {
    _id: p._id, slug: p.slug, name: p.name, price: p.price,
    compareAtPrice: p.compareAtPrice, priceMax: p.priceMax, image: p.images?.[0] ?? "", collection: p.collection,
    inStock: p.inStock, isNew: p.isNew,
  };
}

interface SearchResult {
  _id: string; name: string; slug: string; price: number; compareAtPrice?: number; priceMax?: number;
  image: string; collection: string; isNew: boolean; inStock: boolean;
}

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;
const RECENT_KEY = "epure-recent-searches";
const MAX_RECENT = 5;
const FALLBACK_POPULAR = ["Coats", "Shirts", "Sweaters", "Boots", "Scarves"];
const EASE = [0.22, 1, 0.36, 1] as const;

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
};

function resultToCompact(item: SearchResult): CompactProduct {
  return {
    _id: item._id, slug: item.slug, name: item.name, price: item.price,
    compareAtPrice: item.compareAtPrice, priceMax: item.priceMax, image: item.image, collection: item.collection,
    inStock: item.inStock, isNew: item.isNew,
  };
}

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}
function writeRecent(terms: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(terms)); } catch {}
}

export default function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastFiredRef = useRef("");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [resultsVersion, setResultsVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [popular, setPopular] = useState<string[]>(FALLBACK_POPULAR);
  const [recent, setRecent] = useState<string[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedItem[]>([]);

  const close = useCallback(() => onClose(), [onClose]);

  // Fresh state + fresh discovery data every time the overlay opens.
  // (Resetting on close instead would flash empty during the fade-out.)
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setLoading(false);
    setActiveIndex(-1);
    abortRef.current?.abort();
    lastFiredRef.current = "";
    setRecent(readRecent());
    setRecentlyViewed(readRecentlyViewed());

    fetch("/api/categories")
      .then((res) => res.json())
      .then((data: { items: Category[] }) => {
        const names = (data.items ?? []).map((c) => c.name).filter(Boolean).slice(0, 6);
        if (names.length) setPopular(names);
      })
      .catch(() => {});
  }, [open]);

  // Body scroll lock. The site uses Lenis for smooth scrolling (see
  // smooth-scroll.tsx), which drives scroll via its own rAF loop rather than
  // native scrolling alone, so a plain `overflow:hidden` isn't reliably
  // enough on its own — we also ask Lenis to pause via a small event bridge.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.dispatchEvent(new Event("lenis:stop"));
    return () => {
      document.body.style.overflow = prevOverflow;
      window.dispatchEvent(new Event("lenis:start"));
    };
  }, [open]);

  // Auto-focus the input the instant the overlay mounts.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced AJAX search — identical timing/abort/threshold behaviour to
  // the original SearchBox; only the rendering around it has changed.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      setActiveIndex(-1);
      abortRef.current?.abort();
      lastFiredRef.current = "";
      return;
    }

    const timer = setTimeout(() => {
      if (trimmed === lastFiredRef.current) return;
      lastFiredRef.current = trimmed;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data: { items: SearchResult[] }) => {
          setResults(data.items ?? []);
          setActiveIndex(-1);
          setResultsVersion((v) => v + 1);
          setRecent((prev) => {
            const next = [trimmed, ...prev.filter((t) => t.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT);
            writeRecent(next);
            return next;
          });
        })
        .catch((err) => {
          if (err?.name !== "AbortError") setResults([]);
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, open]);

  // Keep the keyboard-highlighted result in view.
  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`search-result-${activeIndex}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  // Escape closes; Tab is trapped inside the panel while open.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "PageDown" || e.key === "PageUp") {
        const el = scrollRef.current;
        if (!el) return;
        e.preventDefault();
        el.scrollBy({ top: el.clientHeight * 0.9 * (e.key === "PageDown" ? 1 : -1), behavior: "smooth" });
        return;
      }
      if (e.key === "Tab") {
        const container = panelRef.current;
        if (!container) return;
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])')
        ).filter((el) => el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  function runSearch(term: string) {
    setQuery(term);
    inputRef.current?.focus();
  }

  function clearRecent() {
    setRecent([]);
    writeRecent([]);
  }

  function goToProduct(slug: string) {
    close();
    router.push(`/product/${slug}`);
  }

  function goToSearchPage() {
    const trimmed = query.trim();
    if (!trimmed) return;
    close();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      if (!results.length) return;
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      if (!results.length) return;
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) goToProduct(results[activeIndex].slug);
      else goToSearchPage();
    }
  }

  // Clicking truly empty backdrop (not a card/button/link) closes the overlay.
  function onBackdropMouseDown(e: React.MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  const trimmedQuery = query.trim();
  const showHint = trimmedQuery.length > 0 && trimmedQuery.length < MIN_QUERY_LENGTH;
  const showDiscovery = trimmedQuery.length === 0;
  const showSkeleton = loading && results.length === 0 && trimmedQuery.length >= MIN_QUERY_LENGTH;
  const showEmpty = !loading && trimmedQuery.length >= MIN_QUERY_LENGTH && results.length === 0;
  const showResults = results.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          className="fixed inset-0 z-[2000] bg-paper/95 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: EASE }}
        >
          <div ref={panelRef} className="flex flex-col h-full">
            <motion.div
              className="shrink-0"
              initial={{ opacity: 0, y: -24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.28, ease: EASE, delay: 0.04 }}
            >
              <div className="flex items-center justify-between px-5 md:px-12 py-5 md:py-7 border-b border-line">
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close search"
                  className="w-9 h-9 -ml-2 grid place-items-center hover:opacity-60 transition"
                >
                  <X size={22} />
                </button>
                <span className="eyebrow">Search</span>
                <span className="w-9" aria-hidden="true" />
              </div>

              <div className="px-5 md:px-12 py-8 md:py-10">
                <div className="max-w-2xl mx-auto relative">
                  <Search size={19} className="absolute left-5 top-1/2 -translate-y-1/2 text-stone pointer-events-none" />
                  <input
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    aria-expanded={showResults}
                    aria-controls="search-results-grid"
                    aria-activedescendant={activeIndex >= 0 ? `search-result-${activeIndex}` : undefined}
                    aria-autocomplete="list"
                    aria-label="Search products"
                    autoComplete="off"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onInputKeyDown}
                    placeholder="Search products..."
                    className="w-full h-14 md:h-16 pl-12 pr-12 rounded-full border border-line bg-paper focus:border-ink outline-none text-[16px] md:text-[18px] placeholder:text-stone transition-colors"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                      aria-label="Clear search"
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center hover:opacity-60 transition"
                    >
                      <X size={17} />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>

            <div
              ref={scrollRef}
              data-lenis-prevent
              className="flex-1 overflow-y-auto overscroll-contain no-scrollbar px-5 md:px-12 py-8 md:py-10"
              onMouseDown={onBackdropMouseDown}
            >
              <div className="max-w-6xl mx-auto">
                {showHint && <p className="text-center text-[13px] text-stone">Type at least {MIN_QUERY_LENGTH} characters to search.</p>}

                {showDiscovery && (
                  <div className="space-y-12">
                    <div>
                      <span className="eyebrow">Popular searches</span>
                      <div className="flex flex-wrap gap-2.5 mt-4">
                        {popular.map((term) => (
                          <button
                            key={term}
                            type="button"
                            onClick={() => runSearch(term)}
                            className="px-4 py-2 border border-line rounded-brand text-[13px] hover:border-ink hover:bg-paper-2 transition"
                          >
                            {term}
                          </button>
                        ))}
                      </div>
                    </div>

                    {recentlyViewed.length > 0 && (
                      <div>
                        <span className="eyebrow">Recently viewed</span>
                        <motion.div
                          variants={gridVariants}
                          initial="hidden"
                          animate="show"
                          className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 md:gap-6 mt-4"
                        >
                          {recentlyViewed.map((item, i) => (
                            <ProductCard key={item._id} product={toCompact(item)} index={i} onNavigate={close} />
                          ))}
                        </motion.div>
                      </div>
                    )}

                    {recent.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="eyebrow">Recent searches</span>
                          <button type="button" onClick={clearRecent} className="text-[11px] uppercase tracking-wide text-stone hover:text-ink transition">
                            Clear
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2.5 mt-4">
                          {recent.map((term) => (
                            <button
                              key={term}
                              type="button"
                              onClick={() => runSearch(term)}
                              className="px-4 py-2 border border-line rounded-brand text-[13px] hover:border-ink hover:bg-paper-2 transition"
                            >
                              {term}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {showSkeleton && (
                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 md:gap-6">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="animate-pulse" style={{ animationDelay: `${i * 60}ms` }}>
                        <div className="aspect-[4/5] bg-paper-2" />
                        <div className="h-[86px] mt-3" />
                      </div>
                    ))}
                  </div>
                )}

                {showEmpty && (
                  <div className="py-20 text-center">
                    <div className="w-16 h-16 rounded-full bg-paper-2 grid place-items-center mx-auto mb-5">
                      <SearchX size={26} className="text-stone" />
                    </div>
                    <p className="display text-xl mb-2">No matching products</p>
                    <p className="text-stone text-sm">Try another keyword</p>
                  </div>
                )}

                {showResults && (
                  <>
                    <div className="flex items-baseline justify-between mb-6">
                      <span className="eyebrow">Products</span>
                      <span className="font-mono text-[11px] text-stone">
                        {results.length} {results.length === 1 ? "result" : "results"} for &ldquo;{trimmedQuery}&rdquo;
                      </span>
                    </div>
                    <motion.div
                      key={resultsVersion}
                      id="search-results-grid"
                      role="listbox"
                      aria-label="Search results"
                      variants={gridVariants}
                      initial="hidden"
                      animate="show"
                      className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 md:gap-6"
                    >
                      {results.map((item, i) => (
                        <ProductCard
                          key={item._id}
                          product={resultToCompact(item)}
                          index={i}
                          id={`search-result-${i}`}
                          active={i === activeIndex}
                          onNavigate={close}
                          onHover={() => setActiveIndex(i)}
                        />
                      ))}
                    </motion.div>

                    <div className="flex justify-center mt-12">
                      <button type="button" onClick={goToSearchPage} className="btn btn-ghost">
                        <span>See all results for &ldquo;{trimmedQuery}&rdquo;</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
