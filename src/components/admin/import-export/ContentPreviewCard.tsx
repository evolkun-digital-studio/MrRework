"use client";
import { ArrowRight, AlertTriangle, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/admin/ui";
import type { ContentPreviewRowClient } from "./types";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

// One row of "before -> after" — same pattern established across every
// other Migration Assistant preview card in this app.
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

export default function ContentPreviewCard({ row, kind }: { row: ContentPreviewRowClient; kind: "post" | "page" }) {
  const { before, after, warnings } = row;

  const statusBadges: { label: string; tone: Tone }[] = [];
  if (!row.existsInDb) statusBadges.push({ label: "New", tone: "success" });
  else statusBadges.push({ label: "Update", tone: "info" });
  if (row.isDuplicateInFile) statusBadges.push({ label: "Duplicate in file", tone: "warning" });
  if (row.isProtected) statusBadges.push({ label: "Manually overridden status", tone: "danger" });
  if (!after.featuredImageMatched && after.featuredImage) statusBadges.push({ label: "External image", tone: "warning" });

  return (
    <div className="border border-line dark:border-[#332e26] rounded-brand p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[11px] text-stone shrink-0">Row {row.row}</span>
          <span className="text-[13px] font-medium truncate">{after.title || "(untitled)"}</span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {statusBadges.map((b, i) => <Badge key={i} tone={b.tone}>{b.label}</Badge>)}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
        <div>
          <CompareRow label="Slug" before={before?.slug ?? "—"} after={after.slug} changed={before?.slug !== after.slug} />
          <CompareRow label="Status" before={before?.status ?? "—"} after={after.status} changed={before?.status !== after.status} />
          <CompareRow label="Visibility" before={before?.visibility ?? "—"} after={after.visibility} changed={before?.visibility !== after.visibility} />
          <CompareRow label="Author" before={before?.author || "—"} after={after.author || "—"} changed={(before?.author || "") !== (after.author || "")} />
        </div>
        <div>
          <CompareRow label="SEO Title" before={before?.seoTitle || "—"} after={after.seoTitle || "—"} changed={(before?.seoTitle || "") !== (after.seoTitle || "")} />
          <CompareRow label="SEO Source" before={before?.seoSource || "—"} after={after.seoSource} changed={before?.seoSource !== after.seoSource} />
          <CompareRow label="Created" before={fmtDate(before?.createdAt ?? null)} after={fmtDate(after.createdAt)} changed={before?.createdAt !== after.createdAt} />
          <CompareRow label="Redirects" before="—" after={String(after.redirectCount)} changed={false} />
        </div>
      </div>

      {kind === "post" && (after.categories.length > 0 || after.tags.length > 0) && (
        <div className="mt-3 pt-3 border-t border-line dark:border-[#332e26] flex flex-wrap gap-1.5">
          {after.categories.map((c) => <Badge key={`c-${c}`} tone="neutral">{c}</Badge>)}
          {after.tags.map((t) => <Badge key={`t-${t}`} tone="info">#{t}</Badge>)}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-line dark:border-[#332e26] flex items-center gap-2 text-[12px] text-stone">
        <ImageIcon size={13} />
        {after.featuredImage ? (
          <span className="truncate">{after.featuredImageMatched ? "Linked to Media Library" : "External URL (no local copy yet)"}</span>
        ) : (
          <span>No featured image</span>
        )}
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
