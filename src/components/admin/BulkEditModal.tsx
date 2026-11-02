"use client";
import { useRef, useState } from "react";
import { X, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button, Input, Select } from "@/components/admin/ui";
import { useDialogBehavior } from "@/lib/useDialogBehavior";
import type { BulkProductUpdates } from "@/lib/bulk-products/engine";

type Selection = { productIds: string[] } | { filters: Record<string, unknown> };

interface Props {
  open: boolean;
  onClose: () => void;
  selection: Selection;
  totalCount: number;
  onDone: () => void; // called after a completed/cancelled job, so the caller can refresh the list + clear selection
}

interface FieldState {
  enabled: boolean;
  status: "published" | "draft";
  isFeatured: boolean;
  isTrending: boolean;
  isBestSeller: boolean;
  archived: boolean;
  priceMode: "set" | "increasePct" | "decreasePct";
  priceValue: string;
  discountMode: "apply" | "remove";
  discountValue: string;
  stockMode: "set" | "increase" | "decrease" | "outOfStock";
  stockValue: string;
  category: string;
  collection: string;
  brand: string;
  tagsMode: "add" | "remove";
  tagsValue: string;
  productType: "shop" | "retail";
}

const EMPTY_FIELDS: FieldState = {
  enabled: false, status: "published", isFeatured: true, isTrending: true, isBestSeller: true, archived: true,
  priceMode: "set", priceValue: "", discountMode: "apply", discountValue: "",
  stockMode: "set", stockValue: "", category: "", collection: "", brand: "", tagsMode: "add", tagsValue: "",
  productType: "shop",
};

// One checkbox-gated group per action — unchecked groups are excluded
// entirely from the `updates` payload built on submit, so "only checked
// fields are modified" holds regardless of whatever stale value is sitting
// in that group's inputs.
const GROUPS = ["status", "isFeatured", "isTrending", "isBestSeller", "archived", "price", "discount", "stock", "category", "collection", "brand", "tags", "productType"] as const;
type GroupKey = typeof GROUPS[number];

type JobState = { phase: "edit" } | { phase: "confirm" } | { phase: "running"; jobId: string } | { phase: "done"; jobId: string };

export default function BulkEditModal({ open, onClose, selection, totalCount, onDone }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  useDialogBehavior(open, onClose, containerRef);

  const [checked, setChecked] = useState<Record<GroupKey, boolean>>(
    () => Object.fromEntries(GROUPS.map((g) => [g, false])) as Record<GroupKey, boolean>
  );
  const [fields, setFields] = useState<FieldState>(EMPTY_FIELDS);
  const [job, setJob] = useState<JobState>({ phase: "edit" });
  const [jobData, setJobData] = useState<any>(null);
  const [error, setError] = useState("");
  const [undoState, setUndoState] = useState<"idle" | "running" | "done" | "error">("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const undoPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (!open) return null;

  function toggleGroup(g: GroupKey) {
    setChecked((c) => ({ ...c, [g]: !c[g] }));
  }
  function set<K extends keyof FieldState>(key: K, value: FieldState[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function buildUpdates(): BulkProductUpdates {
    const u: BulkProductUpdates = {};
    if (checked.status) u.status = fields.status;
    if (checked.isFeatured) u.isFeatured = fields.isFeatured;
    if (checked.isTrending) u.isTrending = fields.isTrending;
    if (checked.isBestSeller) u.isBestSeller = fields.isBestSeller;
    if (checked.archived) u.archived = fields.archived;
    if (checked.price && fields.priceValue.trim() !== "") {
      u.price = { mode: fields.priceMode, value: Number(fields.priceValue) };
    }
    if (checked.discount) {
      u.discount = fields.discountMode === "remove" ? { mode: "remove" } : { mode: "apply", value: Number(fields.discountValue) };
    }
    if (checked.stock) {
      u.stock = fields.stockMode === "outOfStock" ? { mode: "outOfStock" } : { mode: fields.stockMode as "set" | "increase" | "decrease", value: Number(fields.stockValue) };
    }
    if (checked.category && fields.category.trim()) u.category = { mode: "set", value: fields.category.trim() };
    if (checked.collection && fields.collection.trim()) u.collection = { mode: "set", value: fields.collection.trim() };
    if (checked.brand && fields.brand.trim()) u.brand = { mode: "set", value: fields.brand.trim() };
    if (checked.tags && fields.tagsValue.trim()) {
      u.tags = { mode: fields.tagsMode, values: fields.tagsValue.split(",").map((t) => t.trim()).filter(Boolean) };
    }
    if (checked.productType) u.productType = { mode: "set", value: fields.productType };
    return u;
  }

  const anyChecked = GROUPS.some((g) => checked[g]);

  async function submit() {
    setError("");
    const updates = buildUpdates();
    const body: Record<string, unknown> = { updates };
    if ("productIds" in selection) body.productIds = selection.productIds;
    else body.filters = selection.filters;

    const res = await fetch("/api/admin/products/bulk", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to start bulk update."); return; }

    setJob({ phase: "running", jobId: data.jobId });
    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/admin/products/bulk/${data.jobId}`);
      const d = await r.json();
      if (!r.ok) return;
      setJobData(d.job);
      if (d.job.status !== "pending" && d.job.status !== "running") {
        if (pollRef.current) clearInterval(pollRef.current);
        setJob({ phase: "done", jobId: data.jobId });
      }
    }, 1000);
  }

  function handleClose() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (undoPollRef.current) clearInterval(undoPollRef.current);
    if (job.phase === "done") onDone();
    onClose();
  }

  async function undoJob() {
    if (job.phase !== "done") return;
    setUndoState("running");
    const res = await fetch(`/api/admin/products/bulk/${job.jobId}/undo`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { setUndoState("error"); setError(data.error ?? "Undo failed."); return; }

    undoPollRef.current = setInterval(async () => {
      const r = await fetch(`/api/admin/products/bulk/${data.jobId}`);
      const d = await r.json();
      if (!r.ok) return;
      if (d.job.status !== "pending" && d.job.status !== "running") {
        if (undoPollRef.current) clearInterval(undoPollRef.current);
        setUndoState(d.job.status === "completed" ? "done" : "error");
      }
    }, 1000);
  }

  const selectClass = "mt-2 w-full bg-transparent border border-line dark:border-[#332e26] rounded-brand px-3 py-2 text-[13px] outline-none";

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center sm:p-6">
      <div className="absolute inset-0 bg-black/40 hidden sm:block" onClick={handleClose} />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Bulk edit products"
        // Full-screen below `sm` (the spec's explicit "full-screen modal on
        // mobile devices") — no rounding/border/backdrop-inset, occupies
        // the entire viewport so there's no cramped centered card on a
        // phone; sm+ reverts to the centered, rounded, max-height panel.
        className="relative w-full h-full sm:h-auto sm:max-w-2xl sm:max-h-[90dvh] overflow-y-auto bg-paper dark:bg-[#1a1712] border-0 sm:border border-line dark:border-[#332e26] rounded-none sm:rounded-brand shadow-none sm:shadow-[0_24px_60px_rgba(0,0,0,0.25)]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-[#332e26]">
          <div>
            <h2 className="text-[15px] font-semibold">Bulk Edit Products</h2>
            <p className="text-[12px] text-stone mt-0.5">{totalCount} product{totalCount === 1 ? "" : "s"} selected</p>
          </div>
          <button type="button" onClick={handleClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-5">
          {job.phase === "edit" && (
            <div className="space-y-4">
              <FieldRow label="Publish / Unpublish" checked={checked.status} onToggle={() => toggleGroup("status")}>
                <Select className={selectClass} value={fields.status} onChange={(e) => set("status", e.target.value as FieldState["status"])}
                  options={[{ value: "published", label: "Publish" }, { value: "draft", label: "Unpublish (draft)" }]} />
              </FieldRow>
              <FieldRow label="Featured" checked={checked.isFeatured} onToggle={() => toggleGroup("isFeatured")}>
                <Select className={selectClass} value={String(fields.isFeatured)} onChange={(e) => set("isFeatured", e.target.value === "true")}
                  options={[{ value: "true", label: "Mark as Featured" }, { value: "false", label: "Remove Featured" }]} />
              </FieldRow>
              <FieldRow label="Trending" checked={checked.isTrending} onToggle={() => toggleGroup("isTrending")}>
                <Select className={selectClass} value={String(fields.isTrending)} onChange={(e) => set("isTrending", e.target.value === "true")}
                  options={[{ value: "true", label: "Add to Trending" }, { value: "false", label: "Remove from Trending" }]} />
              </FieldRow>
              <FieldRow label="Bestseller" checked={checked.isBestSeller} onToggle={() => toggleGroup("isBestSeller")}>
                <Select className={selectClass} value={String(fields.isBestSeller)} onChange={(e) => set("isBestSeller", e.target.value === "true")}
                  options={[{ value: "true", label: "Mark as Bestseller" }, { value: "false", label: "Remove Bestseller" }]} />
              </FieldRow>
              <FieldRow label="Archive" checked={checked.archived} onToggle={() => toggleGroup("archived")}>
                <Select className={selectClass} value={String(fields.archived)} onChange={(e) => set("archived", e.target.value === "true")}
                  options={[{ value: "true", label: "Archive (hide from storefront)" }, { value: "false", label: "Un-archive" }]} />
              </FieldRow>

              <FieldRow label="Price" checked={checked.price} onToggle={() => toggleGroup("price")}>
                <div className="flex gap-2">
                  <Select className={selectClass} value={fields.priceMode} onChange={(e) => set("priceMode", e.target.value as FieldState["priceMode"])}
                    options={[{ value: "set", label: "Set fixed price" }, { value: "increasePct", label: "Increase by %" }, { value: "decreasePct", label: "Decrease by %" }]} />
                  <Input className="mt-2" type="number" value={fields.priceValue} onChange={(e) => set("priceValue", e.target.value)} placeholder={fields.priceMode === "set" ? "e.g. 49.99" : "e.g. 10"} />
                </div>
              </FieldRow>
              <FieldRow label="Discount" checked={checked.discount} onToggle={() => toggleGroup("discount")}>
                <div className="flex gap-2">
                  <Select className={selectClass} value={fields.discountMode} onChange={(e) => set("discountMode", e.target.value as FieldState["discountMode"])}
                    options={[{ value: "apply", label: "Apply discount %" }, { value: "remove", label: "Remove discount" }]} />
                  {fields.discountMode === "apply" && (
                    <Input className="mt-2" type="number" value={fields.discountValue} onChange={(e) => set("discountValue", e.target.value)} placeholder="e.g. 20" />
                  )}
                </div>
              </FieldRow>

              <FieldRow label="Stock" checked={checked.stock} onToggle={() => toggleGroup("stock")}>
                <div className="flex gap-2">
                  <Select className={selectClass} value={fields.stockMode} onChange={(e) => set("stockMode", e.target.value as FieldState["stockMode"])}
                    options={[{ value: "set", label: "Set quantity" }, { value: "increase", label: "Increase by" }, { value: "decrease", label: "Decrease by" }, { value: "outOfStock", label: "Mark Out of Stock" }]} />
                  {fields.stockMode !== "outOfStock" && (
                    <Input className="mt-2" type="number" value={fields.stockValue} onChange={(e) => set("stockValue", e.target.value)} placeholder="e.g. 150" />
                  )}
                </div>
              </FieldRow>

              <FieldRow label="Product Type" checked={checked.productType} onToggle={() => toggleGroup("productType")}>
                <Select className={selectClass} value={fields.productType} onChange={(e) => set("productType", e.target.value as FieldState["productType"])}
                  options={[{ value: "shop", label: "Move to Wholesale" }, { value: "retail", label: "Move to Retail" }]} />
              </FieldRow>
              <FieldRow label="Category" checked={checked.category} onToggle={() => toggleGroup("category")}>
                <Input className="mt-2" value={fields.category} onChange={(e) => set("category", e.target.value)} placeholder="Category slug, e.g. vintage" />
              </FieldRow>
              <FieldRow label="Collection" checked={checked.collection} onToggle={() => toggleGroup("collection")}>
                <Input className="mt-2" value={fields.collection} onChange={(e) => set("collection", e.target.value)} placeholder="Collection slug" />
              </FieldRow>
              <FieldRow label="Brand" checked={checked.brand} onToggle={() => toggleGroup("brand")}>
                <Input className="mt-2" value={fields.brand} onChange={(e) => set("brand", e.target.value)} placeholder="e.g. Levi's" />
              </FieldRow>
              <FieldRow label="Tags" checked={checked.tags} onToggle={() => toggleGroup("tags")}>
                <div className="flex gap-2">
                  <Select className={selectClass} value={fields.tagsMode} onChange={(e) => set("tagsMode", e.target.value as FieldState["tagsMode"])}
                    options={[{ value: "add", label: "Add tags" }, { value: "remove", label: "Remove tags" }]} />
                  <Input className="mt-2" value={fields.tagsValue} onChange={(e) => set("tagsValue", e.target.value)} placeholder="comma, separated, tags" />
                </div>
              </FieldRow>

              {error && <p className="text-[13px] text-[#4a1414] dark:text-[#e08585]">{error}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button disabled={!anyChecked} onClick={() => setJob({ phase: "confirm" })}>Review changes</Button>
              </div>
            </div>
          )}

          {job.phase === "confirm" && (
            <div className="space-y-4">
              <p className="text-[13px]">
                This will update <strong>{totalCount}</strong> product{totalCount === 1 ? "" : "s"}:
              </p>
              <ul className="space-y-1.5 text-[13px] list-disc list-inside">
                {summarizeUpdates(checked, fields).map((line, i) => <li key={i}>{line}</li>)}
              </ul>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setJob({ phase: "edit" })}>Back</Button>
                <Button onClick={submit}>Confirm &amp; apply</Button>
              </div>
            </div>
          )}

          {(job.phase === "running" || job.phase === "done") && (
            <div className="space-y-4">
              {jobData ? (
                <>
                  <div className="flex items-center gap-2">
                    {job.phase === "running"
                      ? <Loader2 size={16} className="animate-spin" />
                      : jobData.status === "completed" ? <CheckCircle2 size={16} className="text-[#1f3d2b]" /> : <XCircle size={16} className="text-[#4a1414]" />}
                    <span className="text-[13px] font-medium capitalize">{jobData.status}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-paper-2 dark:bg-[#26221b] overflow-hidden">
                    <div
                      className="h-full bg-ink dark:bg-[#f3efe8] transition-all duration-300"
                      style={{ width: `${jobData.progress?.total ? Math.round((jobData.progress.processed / jobData.progress.total) * 100) : 0}%` }}
                    />
                  </div>
                  <p className="text-[12.5px] text-stone">
                    {jobData.progress?.processed ?? 0} / {jobData.progress?.total ?? totalCount} processed
                    {" · "}{jobData.progress?.succeeded ?? 0} succeeded{jobData.progress?.failed ? `, ${jobData.progress.failed} failed` : ""}
                  </p>
                  {job.phase === "done" && jobData.report?.summary && (
                    <div className="border border-line dark:border-[#332e26] rounded-brand p-3 text-[13px]">
                      {jobData.report.summary}
                      {jobData.snapshotTruncated && (
                        <p className="mt-1.5 text-[12px] text-stone">Too many products to support Undo for this job.</p>
                      )}
                    </div>
                  )}
                  {job.phase === "done" && jobData.report?.errors?.length > 0 && (
                    <details className="text-[12.5px] text-stone">
                      <summary className="cursor-pointer">First {Math.min(10, jobData.report.errors.length)} error(s)</summary>
                      <ul className="mt-1.5 space-y-1">
                        {jobData.report.errors.slice(0, 10).map((e: any, i: number) => <li key={i}>{e.productId}: {e.message}</li>)}
                      </ul>
                    </details>
                  )}
                </>
              ) : (
                <p className="text-[13px] text-stone">Starting…</p>
              )}
              {job.phase === "done" && undoState !== "idle" && (
                <p className="text-[12.5px] text-stone">
                  {undoState === "running" ? "Undoing…" : undoState === "done" ? "Undone — products restored to their pre-edit values." : "Undo failed — please try again."}
                </p>
              )}
              <div className="flex justify-end gap-3">
                {job.phase === "running" && (
                  <Button variant="ghost" onClick={async () => { await fetch(`/api/admin/products/bulk/${job.jobId}/cancel`, { method: "POST" }); }}>
                    Cancel job
                  </Button>
                )}
                {job.phase === "done" && jobData?.status === "completed" && jobData?.kind !== "undo" && !jobData?.snapshotTruncated && !jobData?.undoneAt && undoState === "idle" && (
                  <Button variant="ghost" onClick={undoJob}>Undo this job</Button>
                )}
                {job.phase === "done" && <Button onClick={handleClose}>Done</Button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, checked, onToggle, children }: { label: string; checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-3 p-4 border border-line dark:border-[#332e26] rounded-brand cursor-pointer">
      {/* The whole row is the real tap target (native label-wraps-input
          behavior) — sizing the checkbox itself up a little is just visual
          weight for touch, not the actual hit-area fix. */}
      <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1 w-5 h-5 shrink-0" />
      <div className={`flex-1 ${checked ? "" : "opacity-40 pointer-events-none"}`}>
        <span className="text-[13px] font-medium">{label}</span>
        {children}
      </div>
    </label>
  );
}

function summarizeUpdates(checked: Record<GroupKey, boolean>, f: FieldState): string[] {
  const lines: string[] = [];
  if (checked.status) lines.push(f.status === "published" ? "Publish" : "Unpublish (set to draft)");
  if (checked.isFeatured) lines.push(f.isFeatured ? "Mark as Featured" : "Remove Featured");
  if (checked.isTrending) lines.push(f.isTrending ? "Add to Trending" : "Remove from Trending");
  if (checked.isBestSeller) lines.push(f.isBestSeller ? "Mark as Bestseller" : "Remove Bestseller");
  if (checked.archived) lines.push(f.archived ? "Archive (hide from storefront)" : "Un-archive");
  if (checked.price) lines.push(f.priceMode === "set" ? `Set price to £${f.priceValue}` : `${f.priceMode === "increasePct" ? "Increase" : "Decrease"} price by ${f.priceValue}%`);
  if (checked.discount) lines.push(f.discountMode === "apply" ? `Apply ${f.discountValue}% discount` : "Remove discount");
  if (checked.stock) lines.push(f.stockMode === "outOfStock" ? "Mark Out of Stock" : f.stockMode === "set" ? `Set stock to ${f.stockValue}` : `${f.stockMode === "increase" ? "Increase" : "Decrease"} stock by ${f.stockValue}`);
  if (checked.category) lines.push(`Change category to "${f.category}"`);
  if (checked.collection) lines.push(`Change collection to "${f.collection}"`);
  if (checked.brand) lines.push(`Set brand to "${f.brand}"`);
  if (checked.tags) lines.push(`${f.tagsMode === "add" ? "Add" : "Remove"} tags: ${f.tagsValue}`);
  if (checked.productType) lines.push(f.productType === "shop" ? "Move to Wholesale" : "Move to Retail");
  return lines;
}
