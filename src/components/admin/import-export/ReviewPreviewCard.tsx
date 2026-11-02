"use client";
import { ArrowRight, AlertTriangle, Star } from "lucide-react";
import { Badge } from "@/components/admin/ui";
import type { ReviewPreviewRowClient } from "./types";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

function truncate(text: string, max = 140): string {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={11} className={i < rating ? "fill-ink text-ink dark:fill-[#f3efe8] dark:text-[#f3efe8]" : "text-line"} />
      ))}
    </span>
  );
}

// One row of "before -> after" — same pattern established by
// CustomerPreviewCard.tsx / OrderPreviewCard.tsx's CompareRow.
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

export default function ReviewPreviewCard({ row }: { row: ReviewPreviewRowClient }) {
  const { before, after, warnings } = row;

  const statusBadges: { label: string; tone: Tone }[] = [];
  if (!row.willImport) {
    // No rating meta — a valid WooCommerce product comment (see
    // wooReviewMapping.ts's classifyReviewRow), not a star review. Shown
    // distinctly so this never reads as "broken" — it just isn't a review.
    statusBadges.push({ label: `Not a review (${row.classification})`, tone: "neutral" });
  } else if (!row.existsInDb) statusBadges.push({ label: "New", tone: "success" });
  else statusBadges.push({ label: "Update", tone: "info" });
  if (row.isDuplicateInFile) statusBadges.push({ label: "Duplicate in file", tone: "warning" });
  if (row.isProtected) statusBadges.push({ label: "Admin-moderated", tone: "danger" });
  if (row.willImport && after.isGuestReview) statusBadges.push({ label: "Guest review", tone: "neutral" });
  if (row.willImport && !after.productId) statusBadges.push({ label: "Unmatched product", tone: "danger" });

  return (
    <div className="border border-line dark:border-[#332e26] rounded-brand p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-stone">Row {row.row}</span>
          <span className="text-[13px] font-medium">{after.author || "(no name)"}</span>
          <Stars rating={after.rating} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {statusBadges.map((b, i) => <Badge key={i} tone={b.tone}>{b.label}</Badge>)}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
        <div>
          <CompareRow label="Email" before={before?.email || "—"} after={after.email || "—"} changed={before?.email !== after.email} />
          <CompareRow label="Product Match" before={before?.productMatchMethod ?? "—"} after={after.productMatchMethod} changed={false} />
          <CompareRow label="Status" before={before?.status ?? "—"} after={after.status} changed={before?.status !== after.status} />
          <CompareRow label="Woo Status" before={before?.wooStatus || "—"} after={after.wooStatus || "—"} changed={(before?.wooStatus || "") !== (after.wooStatus || "")} />
        </div>
        <div>
          <CompareRow label="Verified" before={before ? (before.verified ? "Yes" : "No") : "—"} after={after.verified ? `Yes (${after.verifiedSource})` : "No"} changed={before?.verified !== after.verified} />
          <CompareRow label="Created" before={fmtDate(before?.createdAt ?? null)} after={fmtDate(after.createdAt)} changed={before?.createdAt !== after.createdAt} />
          <CompareRow label="Admin Reply" before={before?.adminReply ? "Set" : "—"} after={after.adminReply ? "Set" : "—"} changed={!!before?.adminReply !== !!after.adminReply} />
          <CompareRow label="Helpful" before={before ? `${before.helpfulYes ?? 0}/${before.helpfulNo ?? 0}` : "—"} after={`${after.helpfulYes ?? 0}/${after.helpfulNo ?? 0}`} changed={false} />
        </div>
      </div>

      {(after.title || before?.title) && (
        <div className="mt-3 pt-3 border-t border-line dark:border-[#332e26]">
          <div className="text-[11px] uppercase tracking-wide text-stone mb-1">Title</div>
          <div className="text-[12.5px] font-medium">{after.title || "—"}</div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-line dark:border-[#332e26]">
        <div className="text-[11px] uppercase tracking-wide text-stone mb-1">Review Text</div>
        <div className="text-[12.5px]">{truncate(after.body)}</div>
      </div>

      {after.adminReply && (
        <div className="mt-3 pt-3 border-t border-line dark:border-[#332e26]">
          <div className="text-[11px] uppercase tracking-wide text-stone mb-1">Admin Reply {after.adminReplyDate ? `· ${fmtDate(after.adminReplyDate)}` : ""}</div>
          <div className="text-[12.5px]">{truncate(after.adminReply)}</div>
        </div>
      )}

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
