"use client";
import { useEffect, useState } from "react";
import { Boxes } from "lucide-react";
import { Card, Table, Th, Td, Badge, Select, Input, Button, EmptyState } from "@/components/admin/ui";
import { variantKey } from "@/lib/utils";

interface Variant { size: string; color: string; stock: number; sku: string; attributes?: Record<string, string> }
interface InventoryItem { _id: string; name: string; sku: string; image: string; variants: Variant[]; totalStock: number | null; inStock: boolean }
interface HistoryItem { _id: string; message: string; createdAt: string }

export default function AdminInventoryPage() {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});

  function load() {
    const sp = new URLSearchParams();
    if (filter) sp.set("filter", filter);
    fetch(`/api/admin/inventory?${sp}`).then((res) => res.json()).then((data) => { setItems(data.items ?? []); setHistory(data.history ?? []); }).catch(() => setItems([]));
  }
  useEffect(load, [filter]);

  // Matched by the variant's full canonical identity (variantKey — see
  // lib/utils.ts), not size+colour alone: a WooCommerce "bundle" product's
  // variants are commonly distinguished by an attribute like Quantity
  // instead, in which case every variant shares size="" colour="" and a
  // size+colour-only key can't tell them apart (that was both a duplicate
  // React key on this page and a silent wrong-variant-updated bug in the
  // PATCH route below).
  async function saveVariant(productId: string, variant: Variant) {
    const vKey = variantKey(variant.attributes, variant.size, variant.color);
    const key = `${productId}-${vKey}`;
    const value = edits[key];
    if (value === undefined) return;
    await fetch("/api/admin/inventory", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, variantKey: vKey, variantSize: variant.size, variantColor: variant.color, stock: Number(value) }),
    });
    setEdits((e) => { const next = { ...e }; delete next[key]; return next; });
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold">Inventory</h1>
          <p className="text-[12.5px] text-stone mt-1">Stock levels across every product and variant.</p>
        </div>
        <div className="w-48"><Select value={filter} onChange={(e) => setFilter(e.target.value)} options={[{ value: "", label: "All products" }, { value: "low", label: "Low stock" }, { value: "out", label: "Out of stock" }]} /></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <Card>
            {items === null ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-11 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
            ) : items.length === 0 ? (
              <EmptyState icon={<Boxes size={28} strokeWidth={1.3} />} title="Nothing to show" description="No products match this filter." />
            ) : (
              <div className="space-y-5">
                {items.map((p) => (
                  <div key={p._id} className="border-b border-line dark:border-[#332e26] pb-4 last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[13.5px] font-medium">{p.name}</span>
                      <Badge tone={p.totalStock === 0 ? "danger" : p.totalStock !== null && p.totalStock <= 5 ? "warning" : "success"}>
                        {p.totalStock === null ? (p.inStock ? "In stock" : "Out of stock") : `${p.totalStock} in stock`}
                      </Badge>
                    </div>
                    {p.variants.length > 0 && (
                      <Table>
                        <thead><tr><Th>Size</Th><Th>Colour</Th><Th>SKU</Th><Th>Stock</Th><Th /></tr></thead>
                        <tbody>
                          {p.variants.map((v) => {
                            // Keyed by the variant's full canonical identity
                            // (variantKey — lib/utils.ts), not size+colour
                            // alone: a WooCommerce "bundle" product's variants
                            // are commonly distinguished by an attribute like
                            // Quantity instead, in which case every variant
                            // shares size="" colour="" and a size+colour-only
                            // key collapses them all onto one React key.
                            const key = `${p._id}-${variantKey(v.attributes, v.size, v.color)}`;
                            const attrLabel = !v.size && !v.color && v.attributes && Object.keys(v.attributes).length
                              ? Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(", ")
                              : null;
                            return (
                              <tr key={key}>
                                <Td>{v.size || (attrLabel ? <span className="text-stone">{attrLabel}</span> : "")}</Td>
                                <Td>{v.color}</Td>
                                <Td className="font-mono text-[11.5px]">{v.sku}</Td>
                                <Td className="w-24"><Input type="number" value={edits[key] ?? v.stock} onChange={(e) => setEdits((ed) => ({ ...ed, [key]: e.target.value }))} /></Td>
                                <Td><Button size="sm" variant="ghost" onClick={() => saveVariant(p._id, v)}>Save</Button></Td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card title="Inventory history">
          {history.length === 0 ? <p className="text-[12.5px] text-stone">No adjustments recorded yet.</p> : (
            <ul className="space-y-3">
              {history.map((h) => (
                <li key={h._id}>
                  <p className="text-[12.5px]">{h.message}</p>
                  <p className="text-[10.5px] text-stone mt-0.5">{new Date(h.createdAt).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
