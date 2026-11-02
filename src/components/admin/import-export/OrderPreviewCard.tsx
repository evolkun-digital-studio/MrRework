"use client";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/admin/ui";
import type { OrderPreviewAddressClient, OrderPreviewRowClient } from "./types";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

function fmtMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "GBP" }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

function fmtAddress(a: OrderPreviewAddressClient | null): string {
  if (!a) return "—";
  const line1 = [a.address, a.apartment].filter(Boolean).join(", ");
  const line2 = [a.city, a.state, a.postalCode].filter(Boolean).join(", ");
  const parts = [line1, line2, a.country].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

// One row of "before -> after" — same pattern as CustomerPreviewCard.tsx's
// CompareRow: grayed out and no arrow when the two sides are identical,
// visible arrow and highlighted "after" value when they differ.
function CompareRow({ label, before, after, changed }: { label: string; before: string; after: string; changed: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px] py-1">
      <span className="w-32 shrink-0 text-stone">{label}</span>
      {before !== after ? (
        <>
          <span className="text-stone line-through decoration-line/60">{before}</span>
          <ArrowRight size={12} className={changed ? "text-ink shrink-0" : "text-stone shrink-0"} />
          <span className={changed ? "font-medium" : ""}>{after}</span>
        </>
      ) : (
        <span>{after}</span>
      )}
    </div>
  );
}

export default function OrderPreviewCard({ row }: { row: OrderPreviewRowClient }) {
  const { before, after, warnings } = row;

  const statusBadges: { label: string; tone: Tone }[] = [];
  if (!row.existsInDb) statusBadges.push({ label: "New", tone: "success" });
  else statusBadges.push({ label: "Update", tone: "info" });
  if (row.isDuplicateInFile) statusBadges.push({ label: "Duplicate in file", tone: "warning" });
  if (row.isProtected) statusBadges.push({ label: "Admin-managed status", tone: "danger" });
  if (after.isGuestOrder) statusBadges.push({ label: "Guest order", tone: "neutral" });

  const unmatchedCount = after.items.filter((i) => !i.matched).length;

  return (
    <div className="border border-line dark:border-[#332e26] rounded-brand p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-stone">Row {row.row}</span>
          <span className="text-[13px] font-medium font-mono">{row.orderNumber || "(no order number)"}</span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {statusBadges.map((b, i) => <Badge key={i} tone={b.tone}>{b.label}</Badge>)}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
        <div>
          <CompareRow label="Email" before={before?.email ?? "—"} after={after.email || "—"} changed={before?.email !== after.email} />
          <CompareRow label="Created" before={fmtDate(before?.createdAt ?? null)} after={fmtDate(after.createdAt)} changed={before?.createdAt !== after.createdAt} />
          <CompareRow label="Fulfillment" before={before?.fulfillmentStatus ?? "—"} after={after.fulfillmentStatus} changed={before?.fulfillmentStatus !== after.fulfillmentStatus} />
          <CompareRow label="Payment Status" before={before?.paymentStatus ?? "—"} after={after.paymentStatus} changed={before?.paymentStatus !== after.paymentStatus} />
          <CompareRow label="Woo Status" before={before?.wooStatus || "—"} after={after.wooStatus || "—"} changed={(before?.wooStatus || "") !== (after.wooStatus || "")} />
        </div>
        <div>
          <CompareRow label="Total" before={before ? fmtMoney(before.total, before.currency) : "—"} after={fmtMoney(after.total, after.currency)} changed={before?.total !== after.total} />
          <CompareRow label="Payment Method" before={before?.paymentMethod ?? "—"} after={after.paymentMethod} changed={before?.paymentMethod !== after.paymentMethod} />
          <CompareRow label="Gateway ID" before={before?.paymentGatewayId || "—"} after={after.paymentGatewayId || "—"} changed={(before?.paymentGatewayId || "") !== (after.paymentGatewayId || "")} />
          <CompareRow label="Transaction ID" before={before?.transactionId || "—"} after={after.transactionId || "—"} changed={(before?.transactionId || "") !== (after.transactionId || "")} />
          <CompareRow label="Coupons" before={before?.couponCodes.join(", ") || "—"} after={after.couponCodes.join(", ") || "—"} changed={(before?.couponCodes.join(",") || "") !== after.couponCodes.join(",")} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-3 pt-3 border-t border-line dark:border-[#332e26]">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-stone mb-1">Billing Address</div>
          <div className="text-[12.5px]">{fmtAddress(after.billingAddress)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-stone mb-1">Shipping Address</div>
          <div className="text-[12.5px]">{fmtAddress(after.shippingAddress)}</div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-line dark:border-[#332e26]">
        <div className="text-[11px] uppercase tracking-wide text-stone mb-1.5">
          Items ({after.items.length}){unmatchedCount > 0 && <span className="text-[#8a5a10]"> · {unmatchedCount} unmatched</span>}
        </div>
        <div className="space-y-1">
          {after.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between gap-3 text-[12px]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate">{item.name}</span>
                {Object.entries(item.attributes).map(([k, v]) => <span key={k} className="text-stone shrink-0">· {k}: {v}</span>)}
                <span className="text-stone shrink-0">× {item.quantity}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono">{fmtMoney(item.total, after.currency)}</span>
                <Badge tone={item.matched ? "success" : "danger"}>{item.matched ? item.matchMethod : "unmatched"}</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mt-3 pt-3 border-t border-line dark:border-[#332e26] space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11.5px] text-[#8a5a10]">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
