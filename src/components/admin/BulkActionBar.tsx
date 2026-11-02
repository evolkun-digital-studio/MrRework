"use client";
import { Archive, ArrowRightLeft, CheckCircle2, PencilLine, Trash2 } from "lucide-react";
import { Button } from "@/components/admin/ui";

type Selection = { productIds: string[] } | { filters: Record<string, unknown> };

interface Props {
  count: number;
  selection: Selection;
  onBulkEdit: () => void;
  onClear: () => void;
  onQuickActionDone: () => void; // refresh the list + clear selection after a quick action completes
}

// Quick single-click actions bypass the full BulkEditModal (same "just
// confirm() and go" pattern the existing per-row Delete button already
// uses) — only genuinely multi-field edits need the modal.
async function runQuickUpdate(selection: Selection, updates: Record<string, unknown>) {
  const body: Record<string, unknown> = { updates };
  if ("productIds" in selection) body.productIds = selection.productIds;
  else body.filters = selection.filters;
  await fetch("/api/admin/products/bulk", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

export default function BulkActionBar({ count, selection, onBulkEdit, onClear, onQuickActionDone }: Props) {
  if (count === 0) return null;

  async function quick(label: string, updates: Record<string, unknown>) {
    if (!confirm(`${label} ${count} product${count === 1 ? "" : "s"}? This runs in the background.`)) return;
    await runQuickUpdate(selection, updates);
    onQuickActionDone();
  }

  return (
    // Mobile: fixed full-width bar pinned to the viewport's bottom edge (the
    // spec's explicit "sticky bulk action toolbar at the bottom" for
    // handset), same fixed-corner-element convention as other mobile chrome
    // added elsewhere on this site this session. Desktop (sm+): reverts to
    // a sticky, inset, rounded bar within the page's own content column
    // instead of spanning the full admin viewport width.
    <div className="fixed inset-x-0 bottom-0 sm:sticky sm:inset-x-auto sm:bottom-4 z-30 flex items-center justify-between gap-3 flex-wrap bg-ink text-paper dark:bg-[#f3efe8] dark:text-[#15130f] px-4 py-3 sm:rounded-brand sm:px-5 sm:py-3.5 shadow-[0_-4px_20px_rgba(0,0,0,0.2)] sm:shadow-[0_12px_32px_rgba(0,0,0,0.25)]">
      <div className="whitespace-nowrap">
        <p className="text-[10px] uppercase tracking-[0.14em] opacity-65">Bulk actions</p>
        <p className="text-[13px] font-semibold">{count} product{count === 1 ? "" : "s"} selected</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap" aria-label="Actions for selected products">
        <Button size="sm" onClick={onBulkEdit}><PencilLine size={14} aria-hidden="true" />Edit selected</Button>
        <Button size="sm" variant="ghost" className="!border-paper/40 dark:!border-[#15130f]/30" onClick={() => quick("Publish", { status: "published" })}><CheckCircle2 size={14} aria-hidden="true" />Publish</Button>
        <Button size="sm" variant="ghost" className="!border-paper/40 dark:!border-[#15130f]/30" onClick={() => quick("Archive", { archived: true })}><Archive size={14} aria-hidden="true" />Archive</Button>
        <Button size="sm" variant="ghost" className="!border-paper/40 dark:!border-[#15130f]/30" onClick={() => quick("Move to Wholesale", { productType: { mode: "set", value: "shop" } })}><ArrowRightLeft size={14} aria-hidden="true" />Move to Wholesale</Button>
        <Button size="sm" variant="ghost" className="!border-paper/40 dark:!border-[#15130f]/30" onClick={() => quick("Move to Retail", { productType: { mode: "set", value: "retail" } })}><ArrowRightLeft size={14} aria-hidden="true" />Move to Retail</Button>
        <Button
          size="sm"
          variant="danger"
          className="!border-[#b3261e] !bg-[#b3261e] !text-white hover:!bg-[#8f1d18] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white dark:!border-[#b3261e] dark:!bg-[#b3261e] dark:!text-white"
          onClick={() => quick("Delete", { delete: true })}
        >
          <Trash2 size={14} aria-hidden="true" />Delete selected
        </Button>
        <button type="button" onClick={onClear} className="text-[12px] underline opacity-75 hover:opacity-100 ml-1">Clear</button>
      </div>
    </div>
  );
}
