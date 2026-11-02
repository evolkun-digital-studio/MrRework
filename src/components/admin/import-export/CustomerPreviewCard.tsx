"use client";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/admin/ui";
import type { CustomerPreviewAddressClient, CustomerPreviewRowClient, CustomerPreviewSideClient } from "./types";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

function fmtName(side: CustomerPreviewSideClient | null): string {
  if (!side) return "—";
  return side.displayName || [side.firstName, side.lastName].filter(Boolean).join(" ") || "—";
}

function fmtAddress(a: CustomerPreviewAddressClient | null): string {
  if (!a) return "—";
  const line1 = [a.address, a.apartment].filter(Boolean).join(", ");
  const line2 = [a.city, a.state, a.postalCode].filter(Boolean).join(", ");
  const parts = [line1, line2, a.country].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

// One row of "before -> after" — grayed out and no arrow when the two sides
// are identical (nothing to compare against, or genuinely unchanged), a
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

export default function CustomerPreviewCard({ row }: { row: CustomerPreviewRowClient }) {
  const { before, after, warnings } = row;

  const statusBadges: { label: string; tone: Tone }[] = [];
  if (!row.existsInDb) statusBadges.push({ label: "New", tone: "success" });
  else statusBadges.push({ label: "Update", tone: "info" });
  if (row.isDuplicateInFile) statusBadges.push({ label: "Duplicate in file", tone: "warning" });
  if (row.isProtected) statusBadges.push({ label: "Protected account", tone: "danger" });

  return (
    <div className="border border-line dark:border-[#332e26] rounded-brand p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-stone">Row {row.row}</span>
          <span className="text-[13px] font-medium">{row.email || "(no email)"}</span>
        </div>
        <div className="flex gap-1.5">
          {statusBadges.map((b, i) => <Badge key={i} tone={b.tone}>{b.label}</Badge>)}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
        <div>
          <CompareRow label="Name" before={fmtName(before)} after={fmtName(after)} changed={fmtName(before) !== fmtName(after)} />
          <CompareRow label="Email" before={before?.email ?? "—"} after={after.email} changed={before?.email !== after.email} />
          <CompareRow label="Role" before={before?.role ?? "—"} after={after.role} changed={before?.role !== after.role} />
          <CompareRow label="WordPress Role" before={before?.wooRole || "—"} after={after.wooRole || "—"} changed={(before?.wooRole || "") !== (after.wooRole || "")} />
        </div>
        <div>
          <CompareRow label="Registered" before={fmtDate(before?.registeredAt ?? null)} after={fmtDate(after.registeredAt)} changed={before?.registeredAt !== after.registeredAt} />
          <CompareRow label="Newsletter" before={before ? (before.newsletter ? "Subscribed" : "Not subscribed") : "—"} after={after.newsletter ? "Subscribed" : "Not subscribed"} changed={!!before && before.newsletter !== after.newsletter} />
          <CompareRow label="Password Reset" before={before ? (before.passwordNeedsReset ? "Required" : "Not required") : "—"} after={after.passwordNeedsReset ? "Required" : "Not required"} changed={!!before && before.passwordNeedsReset !== after.passwordNeedsReset} />
          <CompareRow label="Source System" before={before?.sourceSystem || "—"} after={after.sourceSystem || "—"} changed={(before?.sourceSystem || "") !== (after.sourceSystem || "")} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-3 pt-3 border-t border-line dark:border-[#332e26]">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-stone mb-1">Billing Address</div>
          {fmtAddress(before?.billingAddress ?? null) !== fmtAddress(after.billingAddress) ? (
            <div className="text-[12.5px]">
              <div className="text-stone line-through decoration-line/60">{fmtAddress(before?.billingAddress ?? null)}</div>
              <div className="font-medium">{fmtAddress(after.billingAddress)}</div>
            </div>
          ) : (
            <div className="text-[12.5px]">{fmtAddress(after.billingAddress)}</div>
          )}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-stone mb-1">Shipping Address</div>
          {fmtAddress(before?.shippingAddress ?? null) !== fmtAddress(after.shippingAddress) ? (
            <div className="text-[12.5px]">
              <div className="text-stone line-through decoration-line/60">{fmtAddress(before?.shippingAddress ?? null)}</div>
              <div className="font-medium">{fmtAddress(after.shippingAddress)}</div>
            </div>
          ) : (
            <div className="text-[12.5px]">{fmtAddress(after.shippingAddress)}</div>
          )}
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
