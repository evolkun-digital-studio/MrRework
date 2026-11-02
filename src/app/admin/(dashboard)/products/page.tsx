"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag, Plus, Copy, Trash2, ArrowRightLeft } from "lucide-react";
import { Card, Table, Th, Td, Badge, Input, Select, EmptyState, Button, Banner } from "@/components/admin/ui";
import { formatProductPrice } from "@/lib/utils";
import { useCategoryNameStore, prettifySlug } from "@/lib/categoryStore";
import { useBulkSelection } from "@/lib/bulkSelectionStore";
import BulkActionBar from "@/components/admin/BulkActionBar";
import BulkEditModal from "@/components/admin/BulkEditModal";

interface ProductRow {
  _id: string; name: string; slug: string; sku: string; price: number; priceMax?: number;
  status: "draft" | "published"; inStock: boolean; images: string[]; category: string; archived?: boolean;
  stock: number; productType?: "shop" | "retail";
}

const STATUS_OPTIONS = [{ value: "", label: "All statuses" }, { value: "published", label: "Published" }, { value: "draft", label: "Draft" }];
const PRODUCT_TYPE_OPTIONS = [{ value: "", label: "Wholesale & Retail" }, { value: "shop", label: "Wholesale only" }, { value: "retail", label: "Retail only" }];

export default function AdminProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [productType, setProductType] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const categoryNames = useCategoryNameStore((s) => s.names);
  const ensureCategoryNamesLoaded = useCategoryNameStore((s) => s.ensureLoaded);
  useEffect(() => { ensureCategoryNamesLoaded(); }, [ensureCategoryNamesLoaded]);

  const selection = useBulkSelection();
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const currentFilters = useRef<Record<string, unknown>>({});

  // A 401 here previously looked identical to "genuinely zero products
  // match your filters" — data.items ?? [] silently rendered an empty list
  // either way, with no indication the request had actually failed (e.g. an
  // admin session that expired while this tab was already open). Now an
  // expired/missing session sends you straight back to login instead of
  // showing a misleading "No products found" empty state, and any other
  // failure surfaces as a visible error banner rather than vanishing.
  function load() {
    const sp = new URLSearchParams({ page: String(page), limit: "20" });
    if (q.trim()) sp.set("q", q.trim());
    if (status) sp.set("status", status);
    if (productType) sp.set("productType", productType);
    currentFilters.current = { q: q.trim() || undefined, status: status || undefined, productType: productType || undefined };
    setLoadError("");
    fetch(`/api/admin/products?${sp}`)
      .then(async (res) => {
        if (res.status === 401) { router.push("/admin/login"); return null; }
        if (!res.ok) throw new Error(`Failed to load products (${res.status}).`);
        return res.json();
      })
      .then((data) => {
        if (!data) return; // redirecting to login
        setProducts(data.items ?? []); setTotal(data.total ?? 0); setPages(data.pages ?? 1);
      })
      .catch((err) => {
        console.error("[admin/products] load failed:", err instanceof Error ? err.message : err);
        setProducts([]);
        setLoadError("Could not load products — please try again.");
      });
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, productType, page]);

  async function duplicate(id: string) {
    setBusyId(id);
    await fetch(`/api/admin/products/${id}/duplicate`, { method: "POST" });
    setBusyId(null);
    load();
  }
  // Flips a single product between the Wholesale (productType "shop") and
  // Retail catalogs — the two are isolated storefront-side (see
  // productTypeFilter() in src/lib/search.ts), so this is the one place an
  // admin can move a listing from one to the other without deleting and
  // recreating it. Reuses the existing single-product PATCH route, which
  // already validates productType (see validateProductType in
  // src/lib/validation.ts) — no new endpoint needed for the single-item case.
  async function shiftProductType(id: string, current: "shop" | "retail" | undefined) {
    const next = current === "retail" ? "shop" : "retail";
    setBusyId(id);
    await fetch(`/api/admin/products/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productType: next }),
    });
    setBusyId(null);
    load();
  }
  async function remove(id: string) {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    setBusyId(id);
    await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
    setBusyId(null);
    load();
  }

  const pageIds = (products ?? []).map((p) => p._id);
  const selectedOnPage = pageIds.filter((id) => selection.selectedIds.has(id));
  const allOnPageSelected = pageIds.length > 0 && selectedOnPage.length === pageIds.length && !selection.selectAllMatching;
  const someOnPageSelected = selectedOnPage.length > 0 && !allOnPageSelected;
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someOnPageSelected; }, [someOnPageSelected]);

  function toggleSelectAllOnPage() {
    if (allOnPageSelected) selection.deselectMany(pageIds);
    else selection.selectMany(pageIds);
  }

  async function selectAllMatching() {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (status) sp.set("status", status);
    const res = await fetch(`/api/admin/products/bulk/count?${sp}`);
    const data = await res.json();
    selection.setSelectAllMatching(currentFilters.current, data.count ?? 0);
  }

  const selectionPayload: { productIds: string[] } | { filters: Record<string, unknown> } = selection.selectAllMatching
    ? { filters: currentFilters.current }
    : { productIds: [...selection.selectedIds] };

  function afterBulkAction() {
    selection.clear();
    load();
  }

  return (
    // Extra bottom padding on mobile only — BulkActionBar becomes a `fixed
    // bottom-0` full-width bar below `sm` once something is selected, and
    // without this the last product card/table row would sit underneath it.
    <div className="space-y-5 pb-24 sm:pb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold">Products</h1>
          <p className="text-[12.5px] text-stone mt-1">{total} total products.</p>
        </div>
        <Link href="/admin/products/new"><Button><Plus size={14} /> New product</Button></Link>
      </div>

      {loadError && <Banner tone="error">{loadError}</Banner>}

      <Card>
        <div className="flex flex-wrap gap-3 mb-3">
          <div className="flex-1 min-w-[200px]"><Input placeholder="Search name, SKU or slug…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <div className="w-44"><Select options={STATUS_OPTIONS} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} /></div>
          <div className="w-44"><Select options={PRODUCT_TYPE_OPTIONS} value={productType} onChange={(e) => { setProductType(e.target.value); setPage(1); }} /></div>
        </div>

        {products !== null && products.length > 0 && (
          <div className="flex items-center gap-3 mb-3 text-[12px] text-stone">
            {selection.count() > 0 && !selection.selectAllMatching && pageIds.every((id) => selection.selectedIds.has(id)) && (
              <button type="button" onClick={selectAllMatching} className="underline hover:text-ink dark:hover:text-white">
                Select all {total} matching current filters
              </button>
            )}
            {selection.selectAllMatching && <span>All {selection.matchingCount} matching products selected.</span>}
          </div>
        )}

        {products === null ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
        ) : products.length === 0 ? (
          <EmptyState icon={<ShoppingBag size={28} strokeWidth={1.3} />} title="No products found" action={<Link href="/admin/products/new"><Button size="sm">Create your first product</Button></Link>} />
        ) : (
          <>
            {/* Mobile: card list. No precedent elsewhere in admin (every
                existing list page just does horizontal table scroll) — this
                is the one new pattern the mobile pass introduces, matching
                the storefront's own sm/md breakpoint convention. */}
            <div className="md:hidden space-y-3">
              {products.map((p) => {
                const checked = selection.selectAllMatching || selection.selectedIds.has(p._id);
                return (
                  <div key={p._id} className="border border-line dark:border-[#332e26] rounded-brand p-3 flex gap-3">
                    <label className="flex items-center pr-1 -m-1 p-1" aria-label={`Select ${p.name}`}>
                      <input
                        type="checkbox" checked={checked} onChange={() => selection.toggle(p._id)}
                        disabled={selection.selectAllMatching} className="w-5 h-5"
                      />
                    </label>
                    <Link href={`/admin/products/${p._id}`} className="w-14 h-16 rounded-brand bg-paper-2 dark:bg-[#26221b] shrink-0 overflow-hidden">
                      {p.images?.[0] && <img src={p.images[0]} alt="" className="w-full h-full object-cover" />}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/admin/products/${p._id}`} className="text-[13.5px] font-medium truncate block hover:underline">{p.name}</Link>
                      <p className="text-[11px] text-stone font-mono mt-0.5">{p.sku}</p>
                      <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
                        <Badge tone={p.status === "published" ? "success" : "neutral"}>{p.status}</Badge>
                        {!p.inStock && <Badge tone="danger">Out of stock</Badge>}
                        {p.archived && <Badge tone="warning">Archived</Badge>}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-mono text-[13px]">{formatProductPrice(p)} <span className="text-stone">· Stock: {p.stock}</span></span>
                        <div className="flex items-center gap-4">
                          <button
                            type="button" onClick={() => shiftProductType(p._id, p.productType)} disabled={busyId === p._id}
                            aria-label={p.productType === "retail" ? "Move to Wholesale" : "Move to Retail"}
                            title={p.productType === "retail" ? "Move to Wholesale" : "Move to Retail"}
                            className="w-8 h-8 -m-1 flex items-center justify-center text-stone hover:text-ink dark:hover:text-white transition disabled:opacity-40"
                          >
                            <ArrowRightLeft size={16} />
                          </button>
                          <button type="button" onClick={() => duplicate(p._id)} disabled={busyId === p._id} aria-label="Duplicate" className="w-8 h-8 -m-1 flex items-center justify-center text-stone hover:text-ink dark:hover:text-white transition disabled:opacity-40">
                            <Copy size={16} />
                          </button>
                          <button type="button" onClick={() => remove(p._id)} disabled={busyId === p._id} aria-label="Delete" className="w-8 h-8 -m-1 flex items-center justify-center text-stone hover:text-[#4a1414] transition disabled:opacity-40">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Table className="hidden md:block">
              <thead>
                <tr>
                  <Th className="w-10">
                    <input ref={headerCheckboxRef} type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAllOnPage} aria-label="Select all on this page" className="w-4 h-4" />
                  </Th>
                  <Th>Product</Th><Th>SKU</Th><Th>Category</Th><Th>Type</Th><Th>Status</Th><Th className="text-right">Price</Th><Th className="text-right">Stock</Th><Th />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const checked = selection.selectAllMatching || selection.selectedIds.has(p._id);
                  return (
                    <tr key={p._id}>
                      <Td>
                        <input
                          type="checkbox" checked={checked} onChange={() => selection.toggle(p._id)}
                          disabled={selection.selectAllMatching} aria-label={`Select ${p.name}`} className="w-4 h-4"
                        />
                      </Td>
                      <Td>
                        <Link href={`/admin/products/${p._id}`} className="flex items-center gap-3 hover:underline">
                          <span className="w-9 h-11 rounded-brand bg-paper-2 dark:bg-[#26221b] shrink-0 overflow-hidden">
                            {p.images?.[0] && <img src={p.images[0]} alt="" className="w-full h-full object-cover" />}
                          </span>
                          <span className="truncate max-w-[220px]">{p.name}</span>
                        </Link>
                      </Td>
                      <Td className="font-mono text-[12px]">{p.sku}</Td>
                      <Td>{categoryNames[p.category] ?? prettifySlug(p.category)}</Td>
                      <Td><Badge tone={p.productType === "retail" ? "info" : "neutral"}>{p.productType === "retail" ? "Retail" : "Wholesale"}</Badge></Td>
                      <Td>
                        <Badge tone={p.status === "published" ? "success" : "neutral"}>{p.status}</Badge>
                        {!p.inStock && <span className="ml-1.5"><Badge tone="danger">Out of stock</Badge></span>}
                        {p.archived && <span className="ml-1.5"><Badge tone="warning">Archived</Badge></span>}
                      </Td>
                      <Td className="text-right font-mono">{formatProductPrice(p)}</Td>
                      <Td className="text-right font-mono">{p.stock}</Td>
                      <Td>
                        <div className="flex items-center gap-3 justify-end">
                          <button
                            type="button" onClick={() => shiftProductType(p._id, p.productType)} disabled={busyId === p._id}
                            aria-label={p.productType === "retail" ? "Move to Wholesale" : "Move to Retail"}
                            title={p.productType === "retail" ? "Move to Wholesale" : "Move to Retail"}
                            className="text-stone hover:text-ink dark:hover:text-white transition disabled:opacity-40"
                          >
                            <ArrowRightLeft size={14} />
                          </button>
                          <button type="button" onClick={() => duplicate(p._id)} disabled={busyId === p._id} aria-label="Duplicate" className="text-stone hover:text-ink dark:hover:text-white transition disabled:opacity-40">
                            <Copy size={14} />
                          </button>
                          <button type="button" onClick={() => remove(p._id)} disabled={busyId === p._id} aria-label="Delete" className="text-stone hover:text-[#4a1414] transition disabled:opacity-40">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {pages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="text-[12px] text-stone">Page {page} of {pages}</span>
                <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </>
        )}
      </Card>

      <BulkActionBar
        count={selection.count()}
        selection={selectionPayload}
        onBulkEdit={() => setBulkEditOpen(true)}
        onClear={selection.clear}
        onQuickActionDone={afterBulkAction}
      />
      <BulkEditModal
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        selection={selectionPayload}
        totalCount={selection.count()}
        onDone={afterBulkAction}
      />
    </div>
  );
}
