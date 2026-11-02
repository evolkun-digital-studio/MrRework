"use client";
import { useEffect, useState } from "react";
import { Ticket, Plus, Trash2, Pencil } from "lucide-react";
import { Card, Table, Th, Td, Badge, Input, Select, Textarea, Button, EmptyState, Banner } from "@/components/admin/ui";
import { formatPrice } from "@/lib/utils";

type DiscountType = "percentage" | "fixed" | "free_shipping" | "buy_x_get_y";

interface Discount {
  _id: string; code?: string; type: DiscountType; value: number; description?: string;
  expiresAt?: string; startsAt?: string; usageLimit?: number; usageCount: number;
  minimumOrder: number; maximumDiscount?: number; perCustomerLimit?: number;
  active: boolean; automatic: boolean; freeShipping: boolean; stackable: boolean; priority: number;
  applicableProducts: string[]; applicableCategories: string[];
  excludedProducts: string[]; excludedCategories: string[];
  firstOrderOnly: boolean;
  buyQuantity?: number; getQuantity?: number; buyGetProduct?: string;
  totalSavings: number;
}

interface Form {
  code: string; type: DiscountType; value: number; description: string;
  expiresAt: string; startsAt: string; usageLimit: string; minimumOrder: number;
  maximumDiscount: string; perCustomerLimit: string;
  active: boolean; automatic: boolean; stackable: boolean; priority: number; firstOrderOnly: boolean;
  applicableCategories: string; excludedCategories: string;
  applicableProducts: string; excludedProducts: string;
  buyQuantity: string; getQuantity: string; buyGetProduct: string;
}

const EMPTY: Form = {
  code: "", type: "percentage", value: 10, description: "",
  expiresAt: "", startsAt: "", usageLimit: "", minimumOrder: 0,
  maximumDiscount: "", perCustomerLimit: "",
  active: true, automatic: false, stackable: false, priority: 0, firstOrderOnly: false,
  applicableCategories: "", excludedCategories: "", applicableProducts: "", excludedProducts: "",
  buyQuantity: "", getQuantity: "", buyGetProduct: "",
};

const TYPE_OPTIONS = [
  { value: "percentage", label: "Percentage" },
  { value: "fixed", label: "Fixed amount" },
  { value: "free_shipping", label: "Free shipping" },
  { value: "buy_x_get_y", label: "Buy X Get Y" },
];

function csvToList(s: string): string[] { return s.split(",").map((x) => x.trim()).filter(Boolean); }
function listToCsv(list: string[] = []): string { return list.join(", "); }

export default function AdminDiscountsPage() {
  const [discounts, setDiscounts] = useState<Discount[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/admin/coupons").then((res) => res.json()).then((data) => setDiscounts(data.items ?? []));
  }
  useEffect(load, []);

  function startNew() { setForm(EMPTY); setError(""); setEditing("new"); }
  function startEdit(d: Discount) {
    setForm({
      code: d.code ?? "", type: d.type, value: d.value, description: d.description ?? "",
      expiresAt: d.expiresAt ? d.expiresAt.slice(0, 10) : "", startsAt: d.startsAt ? d.startsAt.slice(0, 10) : "",
      usageLimit: d.usageLimit ? String(d.usageLimit) : "", minimumOrder: d.minimumOrder,
      maximumDiscount: d.maximumDiscount ? String(d.maximumDiscount) : "", perCustomerLimit: d.perCustomerLimit ? String(d.perCustomerLimit) : "",
      active: d.active, automatic: d.automatic, stackable: d.stackable, priority: d.priority, firstOrderOnly: d.firstOrderOnly,
      applicableCategories: listToCsv(d.applicableCategories), excludedCategories: listToCsv(d.excludedCategories),
      applicableProducts: listToCsv(d.applicableProducts), excludedProducts: listToCsv(d.excludedProducts),
      buyQuantity: d.buyQuantity ? String(d.buyQuantity) : "", getQuantity: d.getQuantity ? String(d.getQuantity) : "",
      buyGetProduct: d.buyGetProduct ?? "",
    });
    setError("");
    setEditing(d._id);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const isNew = editing === "new";
      const payload = {
        code: form.automatic ? undefined : form.code,
        type: form.type,
        value: Number(form.value),
        description: form.description || undefined,
        minimumOrder: Number(form.minimumOrder),
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        maximumDiscount: form.maximumDiscount ? Number(form.maximumDiscount) : undefined,
        perCustomerLimit: form.perCustomerLimit ? Number(form.perCustomerLimit) : undefined,
        expiresAt: form.expiresAt || undefined,
        startsAt: form.startsAt || undefined,
        active: form.active,
        automatic: form.automatic,
        freeShipping: form.type === "free_shipping",
        stackable: form.stackable,
        priority: Number(form.priority),
        firstOrderOnly: form.firstOrderOnly,
        applicableCategories: csvToList(form.applicableCategories),
        excludedCategories: csvToList(form.excludedCategories),
        applicableProducts: csvToList(form.applicableProducts),
        excludedProducts: csvToList(form.excludedProducts),
        buyQuantity: form.buyQuantity ? Number(form.buyQuantity) : undefined,
        getQuantity: form.getQuantity ? Number(form.getQuantity) : undefined,
        buyGetProduct: form.buyGetProduct || undefined,
      };
      const res = await fetch(isNew ? "/api/admin/coupons" : `/api/admin/coupons/${editing}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(d: Discount) {
    await fetch(`/api/admin/coupons/${d._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !d.active }) });
    load();
  }
  async function remove(id: string) {
    if (!confirm("Delete this discount?")) return;
    await fetch(`/api/admin/coupons/${id}`, { method: "DELETE" });
    load();
  }

  function statusOf(d: Discount): { tone: "success" | "neutral" | "warning"; label: string } {
    if (!d.active) return { tone: "neutral", label: "Inactive" };
    if (d.expiresAt && new Date(d.expiresAt) < new Date()) return { tone: "warning", label: "Expired" };
    if (d.usageLimit && d.usageCount >= d.usageLimit) return { tone: "warning", label: "Usage limit reached" };
    return { tone: "success", label: "Active" };
  }

  function summaryOf(d: Discount): string {
    if (d.type === "percentage") return `${d.value}%`;
    if (d.type === "fixed") return formatPrice(d.value);
    if (d.type === "free_shipping") return "Free shipping";
    return `Buy ${d.buyQuantity ?? "?"} Get ${d.getQuantity ?? "?"}`;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold">Discounts</h1>
          <p className="text-[12.5px] text-stone mt-1">Coupon codes, automatic discounts, free shipping, and Buy X Get Y offers.</p>
        </div>
        {editing === null && <Button onClick={startNew}><Plus size={14} /> New discount</Button>}
      </div>

      {editing !== null && (
        <Card title={editing === "new" ? "New discount" : "Edit discount"}>
          <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3 max-w-3xl">
            <label className="flex items-center gap-2.5 text-[13px] cursor-pointer lg:col-span-2">
              <input type="checkbox" checked={form.automatic} onChange={(e) => setForm((f) => ({ ...f, automatic: e.target.checked }))} className="w-4 h-4 accent-[var(--ink)]" />
              Automatic discount (applies without a code)
            </label>

            {!form.automatic && (
              <Input label="Code" required={!form.automatic} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
            )}
            <Select label="Type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as DiscountType }))} options={TYPE_OPTIONS} />

            {form.type !== "free_shipping" && form.type !== "buy_x_get_y" && (
              <Input label={form.type === "percentage" ? "Value (%)" : "Value"} type="number" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))} />
            )}
            <Input label="Minimum order" type="number" value={form.minimumOrder} onChange={(e) => setForm((f) => ({ ...f, minimumOrder: Number(e.target.value) }))} />

            {form.type === "buy_x_get_y" && (
              <>
                <Input label="Buy Get Product ID" value={form.buyGetProduct} onChange={(e) => setForm((f) => ({ ...f, buyGetProduct: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Buy quantity" type="number" value={form.buyQuantity} onChange={(e) => setForm((f) => ({ ...f, buyQuantity: e.target.value }))} />
                  <Input label="Get quantity (free)" type="number" value={form.getQuantity} onChange={(e) => setForm((f) => ({ ...f, getQuantity: e.target.value }))} />
                </div>
              </>
            )}

            <Input label="Starts (optional)" type="date" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
            <Input label="Expires (optional)" type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />

            <Input label="Usage limit (optional)" type="number" value={form.usageLimit} onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))} />
            <Input label="Per-customer limit (optional)" type="number" value={form.perCustomerLimit} onChange={(e) => setForm((f) => ({ ...f, perCustomerLimit: e.target.value }))} />

            <Input label="Maximum discount amount (optional)" type="number" value={form.maximumDiscount} onChange={(e) => setForm((f) => ({ ...f, maximumDiscount: e.target.value }))} />
            <Input label="Priority" type="number" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))} />

            <Input label="Applicable categories (comma-separated, optional)" value={form.applicableCategories} onChange={(e) => setForm((f) => ({ ...f, applicableCategories: e.target.value }))} />
            <Input label="Excluded categories (comma-separated, optional)" value={form.excludedCategories} onChange={(e) => setForm((f) => ({ ...f, excludedCategories: e.target.value }))} />
            <Input label="Applicable product IDs (comma-separated, optional)" value={form.applicableProducts} onChange={(e) => setForm((f) => ({ ...f, applicableProducts: e.target.value }))} />
            <Input label="Excluded product IDs (comma-separated, optional)" value={form.excludedProducts} onChange={(e) => setForm((f) => ({ ...f, excludedProducts: e.target.value }))} />

            <div className="lg:col-span-2">
              <Textarea label="Admin note (optional)" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>

            <div className="lg:col-span-2 flex flex-wrap gap-5">
              <label className="flex items-center gap-2.5 text-[13px] cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="w-4 h-4 accent-[var(--ink)]" /> Active
              </label>
              <label className="flex items-center gap-2.5 text-[13px] cursor-pointer">
                <input type="checkbox" checked={form.stackable} onChange={(e) => setForm((f) => ({ ...f, stackable: e.target.checked }))} className="w-4 h-4 accent-[var(--ink)]" /> Stackable with other discounts
              </label>
              <label className="flex items-center gap-2.5 text-[13px] cursor-pointer">
                <input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => setForm((f) => ({ ...f, firstOrderOnly: e.target.checked }))} className="w-4 h-4 accent-[var(--ink)]" /> First order only
              </label>
            </div>

            {error && <div className="lg:col-span-2"><Banner tone="error">{error}</Banner></div>}
            <div className="lg:col-span-2 flex gap-3">
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {discounts === null ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-11 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
        ) : discounts.length === 0 ? (
          <EmptyState icon={<Ticket size={28} strokeWidth={1.3} />} title="No discounts yet" />
        ) : (
          <Table>
            <thead><tr><Th>Code</Th><Th>Type</Th><Th>Usage</Th><Th>Expires</Th><Th>Savings generated</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {discounts.map((d) => {
                const status = statusOf(d);
                return (
                  <tr key={d._id}>
                    <Td className="font-mono">{d.code || <span className="text-stone">Automatic</span>}</Td>
                    <Td>{summaryOf(d)}</Td>
                    <Td>{d.usageCount}{d.usageLimit ? ` / ${d.usageLimit}` : ""}</Td>
                    <Td>{d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : "Never"}</Td>
                    <Td className="font-mono">{formatPrice(d.totalSavings)}</Td>
                    <Td><button type="button" onClick={() => toggleActive(d)}><Badge tone={status.tone}>{status.label}</Badge></button></Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => startEdit(d)} aria-label="Edit" className="text-stone hover:text-ink dark:hover:text-white transition"><Pencil size={14} /></button>
                        <button type="button" onClick={() => remove(d._id)} aria-label="Delete" className="text-stone hover:text-[#4a1414] transition"><Trash2 size={14} /></button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
