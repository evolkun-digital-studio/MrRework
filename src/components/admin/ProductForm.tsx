"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Star, Eye } from "lucide-react";
import { Card, Input, Textarea, Select, Button, Banner } from "@/components/admin/ui";
import MediaPicker from "@/components/admin/MediaPicker";

export interface ProductFormValues {
  name: string; slug: string; sku: string; description: string; materials: string;
  category: string; collection: string; gender: "men" | "women" | "unisex";
  price: number; compareAtPrice?: number; saleEndsAt?: string; images: string[]; hoverImage: string;
  colors: string[]; sizes: string[]; variants: { size: string; color: string; stock: number; sku: string }[];
  // Overall available quantity for products with no size/color variants
  // (see Product.ts's `stock` field comment — variant-level stock in the
  // Variants card above is a separate, more granular mechanism and is
  // unaffected by this). The dropdown-vs-custom distinction only exists in
  // this form's UI state (stockOption/customStock below); only this
  // resolved integer is ever part of ProductFormValues or sent to the API.
  stock: number;
  // Which storefront catalog this product belongs to — see the field
  // comment on Product.ts. Required (no default that silently picks one
  // for the admin); EMPTY below still needs *a* value for TypeScript, but
  // the New Product page always renders with "shop" pre-selected rather
  // than a blank/placeholder option, matching how every other required
  // Select in this form (Gender, Status) already behaves.
  productType: "shop" | "retail";
  tags: string[]; isNew: boolean; isLimited: boolean; isBestSeller: boolean; isPreOrder: boolean; inStock: boolean;
  status: "draft" | "published"; seoTitle: string; seoDescription: string;
}

const EMPTY: ProductFormValues = {
  name: "", slug: "", sku: "", description: "", materials: "",
  category: "", collection: "", gender: "unisex",
  price: 0, compareAtPrice: undefined, saleEndsAt: undefined, images: [], hoverImage: "",
  colors: [], sizes: [], variants: [], stock: 10, productType: "shop",
  tags: [], isNew: false, isLimited: false, isBestSeller: false, isPreOrder: false, inStock: true,
  status: "draft", seoTitle: "", seoDescription: "",
};

// The predefined Stock Quantity choices — "Custom" (below) is handled as a
// distinct UI state, not one of these numbers, so it can never collide
// with a real value that happens to be typed as a string here.
const STOCK_QUANTITY_OPTIONS = [10, 15, 20, 30, 40, 50] as const;

// Mirrors validation.ts's MAX_STOCK_QUANTITY (a server-only module, can't
// be imported from this client component) — this is only a UX convenience
// that disables the impossible before the user hits submit; the API route
// re-validates against its own copy of this same number regardless.
const MAX_STOCK_QUANTITY = 10_000;

// Reconstructs the dropdown's selection from a stored `stock` value (Edit
// page): a match against one of the predefined numbers selects that
// option, anything else selects "Custom". `stock` is assumed to already be
// a positive integer by the time this runs — see the `effectiveStock`
// fallback in the component below for what happens when it isn't
// (0/undefined on a product that predates this field).
// datetime-local inputs need "YYYY-MM-DDTHH:mm" in the browser's local
// time, not the ISO string (with seconds/ms/Z) this form stores/sends —
// without this, React would warn about an uncontrolled->controlled value
// mismatch and the picker just wouldn't show the saved time.
function isoToLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function deriveStockOption(stock: number): string {
  return (STOCK_QUANTITY_OPTIONS as readonly number[]).includes(stock) ? String(stock) : "custom";
}

const csv = (arr: string[]) => arr.join(", ");
const parseCsv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export default function ProductForm({ initial, productId }: { initial?: Partial<ProductFormValues>; productId?: string }) {
  const router = useRouter();
  // A product created before this field existed has `stock: 0` (the
  // schema's pre-existing default, from before there was any UI to set
  // it) — treated the same as "unset" and defaulted like a brand-new
  // product (dropdown → 10), not as a literal, invalid-per-the-min-1-rule
  // "Custom: 0". Every value from here on (form.stock, stockOption,
  // customStock) is derived from this single normalized starting point so
  // they can never disagree with each other.
  const effectiveInitialStock = initial?.stock && initial.stock > 0 ? initial.stock : EMPTY.stock;
  const [form, setForm] = useState<ProductFormValues>({ ...EMPTY, ...initial, stock: effectiveInitialStock });
  const [stockOption, setStockOption] = useState<string>(() => deriveStockOption(effectiveInitialStock));
  const [customStock, setCustomStock] = useState<string>(() => (deriveStockOption(effectiveInitialStock) === "custom" ? String(effectiveInitialStock) : ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragImageIndex, setDragImageIndex] = useState<number | null>(null);

  function update<K extends keyof ProductFormValues>(k: K, v: ProductFormValues[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Reordering is just rearranging this same string[] — images[0] is what
  // ProductCard.tsx already treats as the primary image by position, so a
  // reorder (or "Set as primary") needs no schema change and no dedicated
  // API: it's saved by the form's existing single submit, same as any other
  // field.
  function reorderImages(from: number, to: number) {
    if (from === to) return;
    const next = [...form.images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    update("images", next);
  }
  function makePrimaryImage(i: number) {
    if (i === 0) return;
    reorderImages(i, 0);
  }

  function addVariant() {
    update("variants", [...form.variants, { size: "", color: "", stock: 0, sku: "" }]);
  }
  function updateVariant(i: number, patch: Partial<ProductFormValues["variants"][number]>) {
    update("variants", form.variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }
  function removeVariant(i: number) {
    update("variants", form.variants.filter((_, idx) => idx !== i));
  }

  function selectStockOption(value: string) {
    setStockOption(value);
    if (value === "custom") {
      // Keep form.stock in sync with whatever's already typed in the
      // custom field (0 if it's empty — submit's own validation below
      // catches that rather than silently carrying over the previous
      // dropdown value).
      const n = Number(customStock);
      update("stock", customStock && Number.isInteger(n) ? n : 0);
    } else {
      update("stock", Number(value));
    }
  }

  function changeCustomStock(raw: string) {
    // Strips everything but digits in one pass — this is what makes
    // decimals, negative signs, and letters/symbols impossible to enter at
    // all, rather than merely rejecting them on submit.
    const digitsOnly = raw.replace(/[^0-9]/g, "");
    setCustomStock(digitsOnly);
    update("stock", digitsOnly ? Number(digitsOnly) : 0);
  }

  async function submit(e: React.FormEvent, publish?: boolean) {
    e.preventDefault();
    setError("");

    if (stockOption === "custom" && !customStock) {
      setError("Enter a custom stock quantity, or choose one of the predefined options.");
      return;
    }
    if (!Number.isInteger(form.stock) || form.stock < 1) {
      setError("Stock quantity must be a whole number greater than 0.");
      return;
    }
    if (form.stock > MAX_STOCK_QUANTITY) {
      setError(`Stock quantity must be ${MAX_STOCK_QUANTITY.toLocaleString()} or fewer.`);
      return;
    }

    setSaving(true);
    const payload = { ...form, status: publish === undefined ? form.status : publish ? "published" : "draft" };
    try {
      const res = await fetch(productId ? `/api/admin/products/${productId}` : "/api/admin/products", {
        method: productId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save product.");
      router.push(`/admin/products/${data.product._id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => submit(e)} className="space-y-5">
      {error && <Banner tone="error">{error}</Banner>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card title="Basic information">
            <div className="space-y-3">
              <Input label="Name" required value={form.name} onChange={(e) => update("name", e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Slug" required value={form.slug} onChange={(e) => update("slug", e.target.value)} />
                <Input label="SKU" required value={form.sku} onChange={(e) => update("sku", e.target.value)} />
              </div>
              <Textarea label="Description" rows={4} value={form.description} onChange={(e) => update("description", e.target.value)} />
              <Input label="Materials" value={form.materials} onChange={(e) => update("materials", e.target.value)} />
            </div>
          </Card>

          <Card title="Pricing">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Price" type="number" step="0.01" required value={form.price} onChange={(e) => update("price", Number(e.target.value))} />
              <Input label="Compare-at price (optional)" type="number" step="0.01" value={form.compareAtPrice ?? ""} onChange={(e) => update("compareAtPrice", e.target.value ? Number(e.target.value) : undefined)} />
              <Input
                label="Sale ends at (optional)" type="datetime-local"
                value={isoToLocalInput(form.saleEndsAt)}
                onChange={(e) => update("saleEndsAt", e.target.value ? new Date(e.target.value).toISOString() : undefined)}
              />
            </div>
          </Card>

          <Card title="Images" description={form.images.length > 1 ? "Drag to reorder. The first image is the primary image shown everywhere on the storefront." : undefined} action={<Button type="button" variant="ghost" size="sm" onClick={() => setPickerOpen(true)}><Plus size={13} /> Add from media library</Button>}>
            {form.images.length === 0 ? (
              <p className="text-[12.5px] text-stone">No images yet.</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                {form.images.map((src, i) => (
                  <div
                    key={src + i}
                    draggable
                    onDragStart={() => setDragImageIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); if (dragImageIndex !== null) reorderImages(dragImageIndex, i); setDragImageIndex(null); }}
                    onDragEnd={() => setDragImageIndex(null)}
                    className={`relative aspect-square rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] group cursor-grab active:cursor-grabbing transition ${dragImageIndex === i ? "opacity-40" : ""}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Product image ${i + 1}`} className="w-full h-full object-cover pointer-events-none" />

                    {/* Status badges — only ever one of each, bottom-left. */}
                    <div className="absolute bottom-1 left-1 flex gap-1">
                      {i === 0 && <span className="text-[9px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-ink/80 text-white">Primary</span>}
                      {src === form.hoverImage && <span className="text-[9px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-ink/80 text-white">Hover</span>}
                    </div>

                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      {i !== 0 && (
                        <button
                          type="button" onClick={() => makePrimaryImage(i)} aria-label="Set as primary image" title="Set as primary image"
                          className="w-5 h-5 rounded-full bg-black/60 text-white grid place-items-center"
                        >
                          <Star size={11} />
                        </button>
                      )}
                      {src !== form.hoverImage && (
                        <button
                          type="button" onClick={() => update("hoverImage", src)} aria-label="Use as hover image" title="Use as hover image"
                          className="w-5 h-5 rounded-full bg-black/60 text-white grid place-items-center"
                        >
                          <Eye size={11} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          update("images", form.images.filter((_, idx) => idx !== i));
                          if (src === form.hoverImage) update("hoverImage", "");
                        }}
                        aria-label="Remove image" title="Remove image"
                        className="w-5 h-5 rounded-full bg-black/60 text-white grid place-items-center"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <MediaPicker
              open={pickerOpen} onClose={() => setPickerOpen(false)}
              onSelect={(url) => { update("images", [...form.images, url]); setPickerOpen(false); }}
              multiple
              onSelectMany={(urls) => update("images", [...form.images, ...urls])}
            />
          </Card>

          <Card title="Inventory" description="Overall available quantity for this product.">
            <div className="space-y-3">
              <Select
                label="Stock Quantity"
                required
                value={stockOption}
                onChange={(e) => selectStockOption(e.target.value)}
                options={[
                  ...STOCK_QUANTITY_OPTIONS.map((n) => ({ value: String(n), label: String(n) })),
                  { value: "custom", label: "Custom" },
                ]}
              />
              {stockOption === "custom" && (
                <Input
                  label="Custom Quantity"
                  required
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_STOCK_QUANTITY}
                  step={1}
                  value={customStock}
                  onChange={(e) => changeCustomStock(e.target.value)}
                  placeholder="e.g. 125"
                />
              )}
            </div>
          </Card>

          <Card title="Variants" description="Size / colour combinations and their stock." action={<Button type="button" variant="ghost" size="sm" onClick={addVariant}><Plus size={13} /> Add variant</Button>}>
            {form.variants.length === 0 ? (
              <p className="text-[12.5px] text-stone">No variants — this product will use the simple in-stock flag below.</p>
            ) : (
              <div className="space-y-2">
                {form.variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_80px_1fr_auto] gap-2 items-end">
                    <Input label={i === 0 ? "Size" : undefined} value={v.size} onChange={(e) => updateVariant(i, { size: e.target.value })} />
                    <Input label={i === 0 ? "Colour" : undefined} value={v.color} onChange={(e) => updateVariant(i, { color: e.target.value })} />
                    <Input label={i === 0 ? "Stock" : undefined} type="number" value={v.stock} onChange={(e) => updateVariant(i, { stock: Number(e.target.value) })} />
                    <Input label={i === 0 ? "Variant SKU" : undefined} value={v.sku} onChange={(e) => updateVariant(i, { sku: e.target.value })} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeVariant(i)}><Trash2 size={13} /></Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Search engine optimisation">
            <div className="space-y-3">
              <Input label="SEO title" value={form.seoTitle} onChange={(e) => update("seoTitle", e.target.value)} />
              <Textarea label="SEO description" rows={2} value={form.seoDescription} onChange={(e) => update("seoDescription", e.target.value)} />
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Organisation">
            <div className="space-y-3">
              <Select label="Status" value={form.status} onChange={(e) => update("status", e.target.value as "draft" | "published")} options={[{ value: "draft", label: "Draft" }, { value: "published", label: "Published" }]} />
              <Select
                label="Product Type"
                required
                value={form.productType}
                onChange={(e) => update("productType", e.target.value as "shop" | "retail")}
                options={[{ value: "shop", label: "Wholesale" }, { value: "retail", label: "Retail" }]}
              />
              <Input label="Category" value={form.category} onChange={(e) => update("category", e.target.value)} />
              <Input label="Collection" value={form.collection} onChange={(e) => update("collection", e.target.value)} />
              <Select label="Gender" value={form.gender} onChange={(e) => update("gender", e.target.value as ProductFormValues["gender"])} options={[{ value: "unisex", label: "Unisex" }, { value: "men", label: "Men" }, { value: "women", label: "Women" }]} />
              <Input label="Tags (comma separated)" value={csv(form.tags)} onChange={(e) => update("tags", parseCsv(e.target.value))} />
              <Input label="Colours (comma separated)" value={csv(form.colors)} onChange={(e) => update("colors", parseCsv(e.target.value))} />
              <Input label="Sizes (comma separated)" value={csv(form.sizes)} onChange={(e) => update("sizes", parseCsv(e.target.value))} />
            </div>
          </Card>

          <Card title="Flags">
            <div className="space-y-2.5">
              {([
                ["inStock", "In stock"], ["isNew", "New arrival"], ["isLimited", "Limited run"], ["isBestSeller", "Bestseller"], ["isPreOrder", "Pre-order"],
              ] as [keyof ProductFormValues, string][]).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2.5 text-[13px] cursor-pointer">
                  <input type="checkbox" checked={!!form[key]} onChange={(e) => update(key, e.target.checked as any)} className="w-4 h-4 accent-[var(--ink)]" />
                  {label}
                </label>
              ))}
            </div>
          </Card>

          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={saving} className="justify-center">{saving ? "Saving…" : "Save"}</Button>
            <Button type="button" variant="ghost" disabled={saving} onClick={(e) => submit(e as any, true)} className="justify-center">Save &amp; publish</Button>
          </div>
        </div>
      </div>
    </form>
  );
}
