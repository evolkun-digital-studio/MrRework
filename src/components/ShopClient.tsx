"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SlidersHorizontal, X, Check, LayoutGrid, Columns3, Rows3 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import ProductCard from "@/components/ProductCard";
import { Frame } from "@/components/Frame";
import PriceRangeSlider from "@/components/PriceRangeSlider";
import { formatConvertedProductPrice } from "@/lib/utils";
import { useCategoryName, useCategoryNameStore } from "@/lib/categoryStore";
import { useCurrency } from "@/lib/currencyStore";
import type { Category, Product } from "@/lib/types";
import { WOMENS_NAV_ITEMS, MENS_NAV_ITEMS, UNISEX_NAV_ITEMS } from "@/lib/genderNavItems";

const SORTS = [
  ["newest", "Newest"],
  ["price-asc", "Price: Low to High"],
  ["price-desc", "Price: High to Low"],
  ["popularity", "Popularity"],
  ["best-selling", "Best selling"],
] as const;

const COLORS = ["Bone", "Charcoal", "Black", "Slate", "Navy", "Stone", "Camel", "Oat", "Sand"];
const SIZES = ["S", "M", "L", "XL", "40", "41", "42", "43", "44"];
// Slider bounds per catalog — Retail runs at a much lower price point than
// the main Shop/Wholesale catalog, so one fixed range would either clip
// Shop's higher prices or leave most of the Retail slider's travel unused.
// Not derived from live data (no min/max-price aggregation endpoint exists
// yet) — just a generous ceiling per catalog; the backend applies
// minPrice/maxPrice as a plain range filter regardless of where these
// bounds land relative to real stock.
const PRICE_BOUNDS: Record<"shop" | "retail", { min: number; max: number; step: number }> = {
  shop: { min: 0, max: 600, step: 10 },
  retail: { min: 0, max: 150, step: 5 },
};
const FLAGS = [["isNew", "New arrivals"], ["isBestSeller", "Best sellers"], ["isLimited", "Limited run"], ["inStock", "In stock"]];
const FLAG_LABELS: Record<string, string> = { isNew: "New", isBestSeller: "Bestseller", isTrending: "Trending", isLimited: "Limited run", inStock: "In stock" };

type Selected = { category: string[]; collection: string[]; brand: string[]; color: string[]; size: string[]; price: [number, number] | null; flag: string[] };
const EMPTY: Selected = { category: [], collection: [], brand: [], color: [], size: [], price: null, flag: [] };

export default function ShopClient({
  categories,
  initialCategory,
  initialBrand,
  initialCollection,
  initialFlag,
  productType = "shop",
  heading = "The shop",
  eyebrow,
  topPadding = true,
}: {
  categories: Category[];
  initialCategory?: string;
  initialBrand?: string;
  initialCollection?: string;
  // Preselects a Features flag (e.g. "isBestSeller", "isTrending") without
  // showing it as a removable chip's own checkbox necessarily existing in
  // FLAGS — /bestsellers and /trending use this to land pre-filtered on the
  // exact same grid/filter/sort UI as /shop ("Wholesale") instead of a
  // separate page design.
  initialFlag?: string;
  // Which catalog this instance browses — the /retail page renders this
  // exact component with productType="retail" instead of duplicating the
  // grid/filter/sort/pagination UI in a second file. The only behavioral
  // difference is which API endpoint gets queried (isolation itself is
  // enforced server-side either way — see productTypeFilter() in
  // src/lib/search.ts — this is just which of the two isolated endpoints
  // a given page instance talks to).
  productType?: "shop" | "retail";
  heading?: string;
  eyebrow?: string;
  // /shop renders this as the very first thing on the page, right below
  // the fixed header (see Header.tsx — position:fixed, taken out of
  // document flow, so the first element on any page needs its own
  // clearance), hence pt-32 by default here. /retail instead renders a
  // breadcrumb first and gives THAT the pt-32 clearance — stacking this
  // component's own pt-32 on top of that produced a large empty gap
  // between the breadcrumb and this component's heading, which is what
  // topPadding={false} fixes.
  topPadding?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const apiEndpoint = productType === "retail" ? "/api/retail/products" : "/api/products";
  const initialSelected = useCallback((): Selected => ({
    ...EMPTY,
    category: initialCategory?.trim() ? [initialCategory.trim()] : [],
    collection: initialCollection?.trim() ? [initialCollection.trim()] : [],
    brand: initialBrand?.trim() ? [initialBrand.trim()] : [],
    flag: initialFlag?.trim() ? [initialFlag.trim()] : [],
  }), [initialCategory, initialBrand, initialCollection, initialFlag]);
  const [sel, setSel] = useState<Selected>(initialSelected);

  // Header nav (NavDropdown's "All Categories"/"Brands" menus, plus "Shop
  // All") links to /shop or /shop?category=<slug> via next/link —
  // navigating there while already on /shop doesn't remount this
  // component, so without this effect the useState initializer above only
  // ever applies once. Resetting the *whole* Selected object (not just
  // patching category) matters just as much: without it, any colour/size/
  // price/"Features" checkbox left checked from browsing one category
  // silently kept filtering results after clicking e.g. "Shop All" — the
  // page looked filterless (no chip shown for the stale category) but was
  // still narrowed down by whatever was checked before, which is exactly
  // how "no filters" landed on a handful of products.
  useEffect(() => {
    setSel(initialSelected());
  }, [initialSelected, initialCollection]);
  const [sort, setSort] = useState<string>("newest");
  const [cols, setCols] = useState<3 | 4>(4);
  const [list, setList] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  const taxonomy = useMemo(() => {
    const bySlug = new Map(categories.map((category) => [category.slug, category]));
    const groups = [
      { label: "Men's", slug: "men-s", items: MENS_NAV_ITEMS },
      { label: "Women's", slug: "women-s", items: WOMENS_NAV_ITEMS },
      { label: "Unisex", slug: "unisex", items: UNISEX_NAV_ITEMS },
    ].map((group) => ({
      ...group,
      category: group.slug ? bySlug.get(group.slug) : undefined,
      items: group.items.map((item) => bySlug.get(item.slug)).filter(Boolean) as Category[],
    }));
    const configured = groups.flatMap((group) => group.items);
    const configuredSlugs = new Set(configured.map((item) => item.slug));
    const premium = bySlug.get("premium");
    const subcategories = [
      ...configured,
      ...categories.filter((category) => category.slug !== premium?.slug && !configuredSlugs.has(category.slug) && !groups.some((group) => group.category?.slug === category.slug)),
    ].filter((category, index, all) => all.findIndex((item) => item.slug === category.slug) === index);
    return { groups, premium, subcategories };
  }, [categories]);

  // This page already has the full category list — seed the shared name
  // cache directly so ProductCard/ListRow resolve names on the first paint
  // instead of waiting on their own /api/categories fetch.
  const seedCategoryNames = useCategoryNameStore((s) => s.seed);
  useEffect(() => { seedCategoryNames(categories); }, [categories, seedCategoryNames]);

  const buildQuery = useCallback(
    (pg: number) => {
      const p = new URLSearchParams();
      if (sel.category.length) p.set("category", sel.category.join(","));
      if (sel.collection.length) p.set("collection", sel.collection.join(","));
      if (sel.brand.length) p.set("brand", sel.brand.join(","));
      if (sel.color.length) p.set("color", sel.color.join(","));
      if (sel.size.length) p.set("size", sel.size.join(","));
      if (sel.price) { const [mn, mx] = sel.price; p.set("minPrice", String(mn)); p.set("maxPrice", String(mx)); }
      sel.flag.forEach((flag) => p.set(flag, "true"));
      p.set("sort", sort);
      p.set("page", String(pg));
      // 48, not 12 — one page should show a full first screen's worth of
      // product without the user needing to hit "Load more" almost
      // immediately. Matches the server's own hard cap in
      // src/app/api/products/route.ts (Math.min(48, ...)), so this actually
      // is the largest batch the API will ever return in one call. Applies
      // uniformly to every load — initial, "Load more", and after any
      // filter/category change — since they all go through this same query.
      p.set("limit", "48");
      return p.toString();
    },
    [sel, sort]
  );

  const load = useCallback(
    async (pg: number, append: boolean) => {
      const id = ++reqId.current;
      setLoading(true);
      try {
        const res = await fetch(`${apiEndpoint}?${buildQuery(pg)}`);
        if (!res.ok) throw new Error(`Product request failed: ${res.status}`);
        const data = await res.json();
        if (id !== reqId.current) return; // ignore stale responses
        const nextItems = Array.isArray(data?.items) ? data.items : [];
        setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
        setTotal(Number.isFinite(data?.total) ? data.total : 0);
        setHasMore(Boolean(data?.hasMore));
        setPage(Number.isFinite(data?.page) ? data.page : pg);
      } catch {
        if (id === reqId.current && !append) {
          setItems([]);
          setTotal(0);
          setHasMore(false);
        }
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [buildQuery, apiEndpoint]
  );

  // Re-query whenever filters or sort change (live, no reload).
  useEffect(() => { load(1, false); }, [load]);

  // Keep the URL in sync with the active filters. This makes a selected
  // category/brand shareable and restores it on refresh or browser history
  // navigation, without forcing the page back to the top on every click.
  useEffect(() => {
    const p = new URLSearchParams();
    if (sel.category.length) p.set("category", sel.category.join(","));
    if (sel.collection.length) p.set("collection", sel.collection.join(","));
    if (sel.brand.length) p.set("brand", sel.brand.join(","));
    if (sel.color.length) p.set("color", sel.color.join(","));
    if (sel.size.length) p.set("size", sel.size.join(","));
    if (sel.price) { p.set("minPrice", String(sel.price[0])); p.set("maxPrice", String(sel.price[1])); }
    sel.flag.forEach((flag) => p.set(flag, "true"));
    if (sort !== "newest") p.set("sort", sort);
    const next = p.toString();
    if (pathname && window.location.search.slice(1) !== next) router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [sel, sort, pathname, router]);

  const activeChips = useMemo(() => {
    const chips: { label: string; clear: () => void }[] = [];
    sel.category.forEach((c) => chips.push({ label: categories.find((cat) => cat.slug === c)?.name ?? c, clear: () => toggle("category", c) }));
    sel.collection.forEach((c) => chips.push({ label: c === "premium" ? "Premium Collection" : c, clear: () => toggle("collection", c) }));
    sel.brand.forEach((b) => chips.push({ label: b, clear: () => toggle("brand", b) }));
    sel.color.forEach((c) => chips.push({ label: c, clear: () => toggle("color", c) }));
    sel.size.forEach((s) => chips.push({ label: `Size ${s}`, clear: () => toggle("size", s) }));
    if (sel.price) { const [mn, mx] = sel.price; chips.push({ label: `£${mn} – £${mx}`, clear: () => setSel((s) => ({ ...s, price: null })) }); }
    sel.flag.forEach((f) => chips.push({ label: FLAG_LABELS[f] ?? f, clear: () => toggle("flag", f) }));
    return chips;
  }, [sel, categories]);

  function toggle(group: keyof Omit<Selected, "price">, value: string) {
    setSel((s) => {
      const arr = s[group] as string[];
      return { ...s, [group]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  }

  const Filters = (
    <div className="space-y-8">
      <FilterGroup title="Category" defaultOpen>
        {taxonomy.groups.map((group) => group.category && (
          <Check_ key={group.category.slug} on={sel.category.includes(group.category.slug)} onClick={() => toggle("category", group.category!.slug)} label={group.label} meta={String(group.category.count ?? 0)} />
        ))}
        {taxonomy.premium && (
          <Check_ on={sel.category.includes(taxonomy.premium.slug)} onClick={() => toggle("category", taxonomy.premium!.slug)} label={taxonomy.premium.name} meta={String(taxonomy.premium.count ?? 0)} />
        )}
      </FilterGroup>
      <FilterGroup title="Subcategory" defaultOpen>
        {taxonomy.subcategories.map((c) => (
          <Check_ key={c.slug} on={sel.category.includes(c.slug)} onClick={() => toggle("category", c.slug)} label={c.name} meta={String(c.count ?? 0)} />
        ))}
      </FilterGroup>
      <FilterGroup title="Price" defaultOpen>
        <PriceRangeSlider
          min={PRICE_BOUNDS[productType].min}
          max={PRICE_BOUNDS[productType].max}
          step={PRICE_BOUNDS[productType].step}
          value={sel.price}
          onCommit={(range) => setSel((s) => ({ ...s, price: range }))}
        />
      </FilterGroup>
      <FilterGroup title="Colour">
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button type="button" key={c} onClick={() => toggle("color", c)} className={`text-[11px] font-mono px-2.5 py-1.5 rounded-brand border transition ${sel.color.includes(c) ? "bg-ink text-paper border-ink" : "border-line hover:border-ink"}`}>{c}</button>
          ))}
        </div>
      </FilterGroup>
      <FilterGroup title="Size">
        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <button type="button" key={s} onClick={() => toggle("size", s)} className={`text-[11px] font-mono w-10 py-1.5 rounded-brand border transition ${sel.size.includes(s) ? "bg-ink text-paper border-ink" : "border-line hover:border-ink"}`}>{s}</button>
          ))}
        </div>
      </FilterGroup>
      <FilterGroup title="Features">
        {FLAGS.map(([k, label]) => (
          <Check_ key={k} on={sel.flag.includes(k)} onClick={() => toggle("flag", k)} label={label} />
        ))}
      </FilterGroup>
    </div>
  );

  return (
    <div className={`px-5 md:px-12 pb-24 ${topPadding ? "pt-32" : ""}`}>
      {/* heading */}
      <div className="flex items-end justify-between gap-6 border-b border-line pb-7 mb-8">
        <div className="min-w-0">
          <span className="eyebrow">{eyebrow ?? (initialCollection ? "Collection N°04" : "All garments")}</span>
          <h1
            className="font-display mt-3"
            style={{
              textTransform: "uppercase",
              fontWeight: 800,
              fontSize: "clamp(36px,2.5vw,68px)",
              lineHeight: 0.98,
              letterSpacing: "-0.02em",
            }}
          >
            {heading}
          </h1>
        </div>
        <p className="font-mono text-[12px] text-stone hidden sm:block shrink-0">{total} pieces</p>
      </div>

      {/* controls */}
      <div className="flex items-center justify-between gap-4 mb-7">
        <button type="button" onClick={() => setSheet(true)} className="lg:hidden flex items-center gap-2 text-[12px] uppercase tracking-wide border border-ink rounded-brand px-4 py-2.5">
          <SlidersHorizontal size={15} /> Filters {activeChips.length > 0 && `(${activeChips.length})`}
        </button>
        <div className="hidden lg:flex items-center gap-2">
          <button type="button" onClick={() => { setList(false); setCols(4); }} className={`p-2 rounded-brand border ${!list && cols === 4 ? "border-ink" : "border-line text-stone"}`} aria-label="4 columns"><LayoutGrid size={16} /></button>
          <button type="button" onClick={() => { setList(false); setCols(3); }} className={`p-2 rounded-brand border ${!list && cols === 3 ? "border-ink" : "border-line text-stone"}`} aria-label="3 columns"><Columns3 size={16} /></button>
          <button type="button" onClick={() => setList(true)} className={`p-2 rounded-brand border ${list ? "border-ink" : "border-line text-stone"}`} aria-label="List view"><Rows3 size={16} /></button>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[12px] uppercase tracking-wide">
          <span className="text-stone hidden sm:inline">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="bg-transparent border border-line rounded-brand px-3 py-2.5 cursor-pointer outline-none focus:border-ink">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* active chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-7">
          {activeChips.map((c, i) => (
            <button type="button" key={i} onClick={c.clear} className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide bg-paper-2 rounded-brand px-3 py-1.5 hover:bg-line transition">
              {c.label} <X size={12} />
            </button>
          ))}
          <button type="button" onClick={() => setSel(EMPTY)} className="text-[11px] uppercase tracking-wide text-stone underline px-2 py-1.5">Clear all</button>
        </div>
      )}

      <div className="grid lg:grid-cols-[230px_1fr] gap-10">
        {/* desktop sidebar */}
        <aside className="hidden lg:block lg:sticky lg:top-28 lg:self-start">{Filters}</aside>

        {/* grid */}
        <div>
          {loading && items.length === 0 ? (
            <div className={`grid gap-3.5 md:gap-6 ${cols === 4 ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i}>
                  <div className="aspect-[4/5] bg-paper-2 animate-pulse" />
                  <div className="h-[86px] mt-3" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-24 text-center">
              <p className="display text-2xl mb-3">Nothing here yet</p>
              <p className="text-stone text-sm mb-6">No garments match these filters.</p>
              <button type="button" onClick={() => setSel(EMPTY)} className="btn"><span>Clear filters</span></button>
            </div>
          ) : list ? (
            <div className="divide-y divide-line">
              {items.map((p, i) => <ListRow key={p._id} product={p} index={i} />)}
            </div>
          ) : (
            <div className={`grid gap-3.5 md:gap-6 ${cols === 4 ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`}>
              {items.map((p, i) => <ProductCard key={p._id} product={p} index={i} />)}
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center mt-14">
              <button type="button" onClick={() => load(page + 1, true)} disabled={loading} className="btn btn-ghost"><span>{loading ? "Loading…" : "Load more"}</span></button>
            </div>
          )}
        </div>
      </div>

      {/* mobile filter sheet */}
      <AnimatePresence>
        {sheet && (
          <>
            <motion.div className="fixed inset-0 bg-ink/40 z-[1000] lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(false)} />
            {/* data-lenis-prevent: Lenis's own escape hatch for a nested
                scrollable region — without it a scroll gesture over this
                sheet can get hijacked to scroll the page behind it instead
                of this sheet's own content (see MobileNav.tsx for the full
                explanation of why this matters). */}
            <motion.div data-lenis-prevent className="fixed bottom-0 left-0 w-full max-h-[85dvh] bg-paper z-[1001] rounded-t-2xl p-6 overflow-y-auto no-scrollbar lg:hidden"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
              <div className="flex justify-between items-center mb-6">
                <span className="display text-xl">Filters</span>
                <button type="button" onClick={() => setSheet(false)} className="p-3 -m-3" aria-label="Close filters"><X size={20} /></button>
              </div>
              {Filters}
              {/* paddingBottom accounts for the iOS home-indicator gesture
                  area via --safe-bottom so these buttons never sit flush
                  against it. */}
              <div className="flex gap-3 mt-8 sticky bottom-0 bg-paper pt-4" style={{ paddingBottom: "calc(1rem + var(--safe-bottom))" }}>
                <button type="button" onClick={() => setSel(EMPTY)} className="btn btn-ghost flex-1 justify-center"><span>Clear</span></button>
                <button type="button" onClick={() => setSheet(false)} className="btn flex-1 justify-center"><span>Show {total}</span></button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterGroup({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line pb-5">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex items-center justify-between w-full text-left mb-3.5 group">
        <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-stone group-hover:text-ink transition">{title}</span>
        <span className={`text-stone transition-transform duration-300 ${open ? "rotate-180" : ""}`} aria-hidden>⌄</span>
      </button>
      <AnimatePresence initial={false}>
        {open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden"><div className="space-y-2.5">{children}</div></motion.div>}
      </AnimatePresence>
    </div>
  );
}

function Check_({ on, onClick, label, meta }: { on: boolean; onClick: () => void; label: string; meta?: string }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2.5 w-full text-left group">
      <span className={`w-4 h-4 rounded-[6px] border grid place-items-center transition ${on ? "bg-ink border-ink" : "border-line group-hover:border-ink"}`}>
        {on && <Check size={11} className="text-paper" />}
      </span>
      <span className="text-[14px] capitalize flex-1">{label}</span>
      {meta && <span className="font-mono text-[11px] text-stone">{meta}</span>}
    </button>
  );
}

function ListRow({ product }: { product: Product; index: number }) {
  const categoryName = useCategoryName(product.category);
  const { currency, rate } = useCurrency();
  return (
    <a href={`/product/${product.slug}`} className="flex items-center gap-5 py-5 group">
      <div className="relative w-24 h-28 rounded-brand overflow-hidden bg-paper-2 shrink-0">
        <Frame src={product.images?.[0]} alt={product.name} className="absolute inset-0 transition-transform duration-500 group-hover:scale-105" />
      </div>
      <div className="flex-1">
        <div className="text-[12.5px] font-normal">{product.name}</div>
        <div className="text-[12px] text-stone mt-0.5">{categoryName} · {product.colors.join(", ")}</div>
        <div className="flex gap-1.5 mt-2">
          {product.sizes.slice(0, 6).map((s) => <span key={s} className="font-mono text-[10.5px] text-stone border border-line rounded-brand px-1.5 py-0.5">{s}</span>)}
        </div>
      </div>
      <div className="font-mono text-[12.5px] font-medium">{formatConvertedProductPrice(product, currency, rate)}</div>
    </a>
  );
}
