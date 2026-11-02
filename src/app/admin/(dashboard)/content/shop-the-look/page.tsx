"use client";
import { useEffect, useRef, useState } from "react";
import { MapPin, Plus, Trash2, Pencil, X } from "lucide-react";
import { Card, Input, Button, EmptyState, Banner, Badge } from "@/components/admin/ui";
import MediaPicker from "@/components/admin/MediaPicker";

interface Hotspot { x: number; y: number; productId: string; productLabel: string; productImage?: string }
interface Slide {
  _id: string; image: string; mobileImage: string; order: number; isActive: boolean;
  hotspots: { x: number; y: number; product?: { _id: string; name: string; slug: string; images?: string[] } | null }[];
}
interface ProductOption { _id: string; name: string; sku: string; images?: string[] }
interface ProductPickerValue { productId: string; productLabel: string; productImage?: string }

const EMPTY_SLIDE = { image: "", mobileImage: "", order: 0, isActive: true, hotspots: [] as Hotspot[] };

// Small debounced product search combobox — same pattern as the one in
// Admin -> Reviews (New review -> pick a product), duplicated locally
// rather than extracted since each caller's list-item wiring differs
// enough (here: one per hotspot row, plus the slide-level "use a product's
// own photo" picker) that a shared component would need more generic
// plumbing than either call site actually needs.
function ProductPicker({ value, onChange }: { value: ProductPickerValue; onChange: (v: ProductPickerValue) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductOption[]>([]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const id = setTimeout(() => {
      fetch(`/api/admin/products?q=${encodeURIComponent(query.trim())}&limit=6`)
        .then((res) => res.json())
        .then((data) => setResults(data.items ?? []))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  if (value.productId) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-brand border border-line dark:border-[#332e26] px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {value.productImage && (
            <div className="w-7 h-7 rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value.productImage} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <span className="text-[12.5px] truncate">{value.productLabel}</span>
        </div>
        <button type="button" className="text-[11.5px] text-stone hover:text-ink shrink-0" onClick={() => onChange({ productId: "", productLabel: "" })}>Change</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input placeholder="Search product…" value={query} onChange={(e) => setQuery(e.target.value)} className="text-[12.5px]" />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-brand border border-line dark:border-[#332e26] bg-paper dark:bg-[#1a1712] shadow-lg">
          {results.map((p) => (
            <li key={p._id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left px-3 py-2 text-[12.5px] hover:bg-paper-2 dark:hover:bg-[#26221b]"
                onClick={() => { onChange({ productId: p._id, productLabel: p.name, productImage: p.images?.[0] }); setQuery(""); setResults([]); }}
              >
                {p.images?.[0] && (
                  <div className="w-6 h-6 rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.images[0]} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <span className="truncate">{p.name}</span> <span className="text-stone text-[11px] font-mono ml-1 shrink-0">{p.sku}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Interactive hotspot canvas — click anywhere on the image to add a
// hotspot there; drag an existing dot to reposition it. What's rendered
// here (white circle + black center dot, positioned by %x/%y of the image)
// is pixel-identical to the public-facing marker in ShopTheLookSection.tsx,
// so this doubles as the "preview before publishing" the spec asks for —
// no separate preview mode needed.
function HotspotCanvas({
  image, hotspots, onAdd, onMove, selected, onSelect,
}: {
  image: string; hotspots: Hotspot[]; onAdd: (x: number, y: number) => void;
  onMove: (index: number, x: number, y: number) => void; selected: number | null; onSelect: (i: number | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingIndex = useRef<number | null>(null);
  const didDrag = useRef(false);

  function posFromClient(clientX: number, clientY: number) {
    const el = containerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - r.top) / r.height) * 100));
    return { x, y };
  }

  function startDrag(index: number, e: React.PointerEvent) {
    e.stopPropagation();
    draggingIndex.current = index;
    didDrag.current = false;
    onSelect(index);

    function onPointerMove(ev: PointerEvent) {
      const pos = posFromClient(ev.clientX, ev.clientY);
      if (!pos || draggingIndex.current === null) return;
      didDrag.current = true;
      onMove(draggingIndex.current, pos.x, pos.y);
    }
    function onPointerUp() {
      draggingIndex.current = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function handleCanvasClick(e: React.MouseEvent) {
    if (didDrag.current) { didDrag.current = false; return; }
    const pos = posFromClient(e.clientX, e.clientY);
    if (!pos) return;
    onAdd(pos.x, pos.y);
  }

  return (
    <div
      ref={containerRef}
      onClick={handleCanvasClick}
      className="relative w-full max-w-xs aspect-[3/4] rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] cursor-crosshair select-none"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" draggable={false} />
      {hotspots.map((h, i) => (
        <button
          key={i}
          type="button"
          data-hotspot
          onPointerDown={(e) => startDrag(i, e)}
          onClick={(e) => { e.stopPropagation(); onSelect(i); }}
          style={{ left: `${h.x}%`, top: `${h.y}%` }}
          className={`absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white shadow-[0_2px_8px_rgba(17,17,17,0.35)] grid place-items-center touch-none ${selected === i ? "ring-2 ring-offset-1 ring-[var(--ink)]" : ""}`}
        >
          <span className="w-2 h-2 rounded-full bg-black" />
        </button>
      ))}
    </div>
  );
}

export default function AdminShopTheLookPage() {
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_SLIDE);
  const [selectedHotspot, setSelectedHotspot] = useState<number | null>(null);
  // Not persisted on the slide itself (the schema only stores `image`) —
  // this is a one-time "use this product's own photo" convenience action,
  // not a stored relationship, so the admin can still swap in real editorial
  // photography later via the Desktop image picker below without anything
  // to unwind.
  const [slideProductPick, setSlideProductPick] = useState<ProductPickerValue>({ productId: "", productLabel: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [desktopPickerOpen, setDesktopPickerOpen] = useState(false);
  const [mobilePickerOpen, setMobilePickerOpen] = useState(false);

  function load() {
    fetch("/api/admin/shop-the-look").then((res) => res.json()).then((data) => setSlides(data.items ?? []));
  }
  useEffect(load, []);

  function startNew() { setForm(EMPTY_SLIDE); setSelectedHotspot(null); setSlideProductPick({ productId: "", productLabel: "" }); setError(""); setEditing("new"); }
  function startEdit(s: Slide) {
    setForm({
      image: s.image ?? "", mobileImage: s.mobileImage ?? "", order: s.order ?? 0, isActive: s.isActive,
      hotspots: s.hotspots.map((h) => ({ x: h.x, y: h.y, productId: h.product?._id ?? "", productLabel: h.product?.name ?? "", productImage: h.product?.images?.[0] })),
    });
    setSelectedHotspot(null);
    setSlideProductPick({ productId: "", productLabel: "" });
    setError("");
    setEditing(s._id);
  }

  // The "choose a product for this slide" shortcut — fills the slide's own
  // image from the product's own photo (see slideProductPick's comment) and,
  // if this slide doesn't already have hotspots, drops one centered hotspot
  // pointing at the same product so the slide is shoppable immediately
  // instead of needing the image + a hotspot added as two separate steps.
  function applySlideProduct(v: ProductPickerValue) {
    setSlideProductPick(v);
    if (!v.productImage) return;
    setForm((f) => ({
      ...f,
      image: v.productImage!,
      hotspots: f.hotspots.length === 0 ? [{ x: 50, y: 50, productId: v.productId, productLabel: v.productLabel, productImage: v.productImage }] : f.hotspots,
    }));
  }

  function addHotspot(x: number, y: number) {
    setForm((f) => ({ ...f, hotspots: [...f.hotspots, { x, y, productId: "", productLabel: "" }] }));
    setSelectedHotspot(form.hotspots.length);
  }
  function moveHotspot(index: number, x: number, y: number) {
    setForm((f) => ({ ...f, hotspots: f.hotspots.map((h, i) => (i === index ? { ...h, x, y } : h)) }));
  }
  function updateHotspotProduct(index: number, v: ProductPickerValue) {
    setForm((f) => ({ ...f, hotspots: f.hotspots.map((h, i) => (i === index ? { ...h, ...v } : h)) }));
  }
  function removeHotspot(index: number) {
    setForm((f) => ({ ...f, hotspots: f.hotspots.filter((_, i) => i !== index) }));
    setSelectedHotspot(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const isNew = editing === "new";
      const payload = {
        image: form.image, mobileImage: form.mobileImage, order: form.order, isActive: form.isActive,
        hotspots: form.hotspots.map((h) => ({ x: h.x, y: h.y, product: h.productId || null })),
      };
      const res = await fetch(isNew ? "/api/admin/shop-the-look" : `/api/admin/shop-the-look/${editing}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save slide.");
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: Slide) {
    await fetch(`/api/admin/shop-the-look/${s._id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !s.isActive }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this slide?")) return;
    const res = await fetch(`/api/admin/shop-the-look/${id}`, { method: "DELETE" });
    if (res.ok) load();
    else { const d = await res.json(); alert(d.error); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold">Shop The Look</h1>
          <p className="text-[12.5px] text-stone mt-1">The homepage editorial carousel with clickable, shoppable hotspots.</p>
        </div>
        {editing === null && <Button onClick={startNew}><Plus size={14} /> New slide</Button>}
      </div>

      {editing !== null && (
        <Card title={editing === "new" ? "New slide" : "Edit slide"}>
          <form onSubmit={submit} className="space-y-4 max-w-2xl">
            <div>
              <span className="block text-[12.5px] font-medium mb-1.5">Use a product's own photo (until real editorial photography is ready)</span>
              <ProductPicker value={slideProductPick} onChange={applySlideProduct} />
              <p className="text-[11.5px] text-stone mt-1">Fills the desktop image below from this product's photo and adds a shoppable hotspot for it. You can still swap in a real photo below at any time.</p>
            </div>

            <div>
              <span className="block text-[12.5px] font-medium mb-1.5">Desktop image</span>
              <div className="flex items-center gap-2">
                {form.image && (
                  <div className="relative w-16 h-20 rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.image} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={() => setDesktopPickerOpen(true)}>{form.image ? "Change" : "Choose"}</Button>
              </div>
            </div>

            <div>
              <span className="block text-[12.5px] font-medium mb-1.5">Mobile image (optional)</span>
              <div className="flex items-center gap-2">
                {form.mobileImage && (
                  <div className="relative w-16 h-20 rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.mobileImage} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={() => setMobilePickerOpen(true)}>{form.mobileImage ? "Change" : "Choose"}</Button>
              </div>
            </div>
            <MediaPicker open={desktopPickerOpen} onClose={() => setDesktopPickerOpen(false)} onSelect={(url) => { setForm((f) => ({ ...f, image: url })); setDesktopPickerOpen(false); }} />
            <MediaPicker open={mobilePickerOpen} onClose={() => setMobilePickerOpen(false)} onSelect={(url) => { setForm((f) => ({ ...f, mobileImage: url })); setMobilePickerOpen(false); }} />

            {form.image && (
              <div>
                <span className="block text-[12.5px] font-medium mb-1.5">Hotspots — click the image to add one, drag a dot to reposition</span>
                <div className="flex flex-col sm:flex-row gap-4">
                  <HotspotCanvas image={form.image} hotspots={form.hotspots} onAdd={addHotspot} onMove={moveHotspot} selected={selectedHotspot} onSelect={setSelectedHotspot} />
                  <div className="flex-1 space-y-2 min-w-0">
                    {form.hotspots.length === 0 ? (
                      <p className="text-[12.5px] text-stone">No hotspots yet — click the image.</p>
                    ) : (
                      form.hotspots.map((h, i) => (
                        <div key={i} onClick={() => setSelectedHotspot(i)} className={`flex items-center gap-2 rounded-brand p-1.5 cursor-pointer ${selectedHotspot === i ? "bg-paper-2 dark:bg-[#26221b]" : ""}`}>
                          <span className="text-[11px] font-mono text-stone w-5 shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0"><ProductPicker value={{ productId: h.productId, productLabel: h.productLabel, productImage: h.productImage }} onChange={(v) => updateHotspotProduct(i, v)} /></div>
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeHotspot(i); }} aria-label="Remove hotspot" className="text-stone hover:text-[#4a1414] shrink-0"><X size={15} /></button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Input label="Sort order" type="number" value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) }))} />
            </div>
            <label className="flex items-center gap-2.5 text-[13px] cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 accent-[var(--ink)]" /> Active (visible on the storefront)
            </label>

            {error && <Banner tone="error">{error}</Banner>}
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {slides === null ? (
          <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-11 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
        ) : slides.length === 0 ? (
          <EmptyState icon={<MapPin size={28} strokeWidth={1.3} />} title="No Shop The Look slides yet" />
        ) : (
          <ul className="divide-y divide-line dark:divide-[#332e26]">
            {slides.map((s) => (
              <li key={s._id} className="flex items-center justify-between py-3 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="relative w-11 h-14 rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] shrink-0">
                    {s.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.image} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div>
                    <span className="text-[13.5px]">{s.hotspots.length} hotspot{s.hotspots.length === 1 ? "" : "s"}</span>
                    <span className="text-stone text-[11.5px] font-mono ml-2">order {s.order}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => toggleActive(s)}><Badge tone={s.isActive ? "success" : "neutral"}>{s.isActive ? "Active" : "Inactive"}</Badge></button>
                  <button type="button" onClick={() => startEdit(s)} aria-label="Edit" className="text-stone hover:text-ink dark:hover:text-white transition"><Pencil size={14} /></button>
                  <button type="button" onClick={() => remove(s._id)} aria-label="Delete" className="text-stone hover:text-[#4a1414] transition"><Trash2 size={14} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
