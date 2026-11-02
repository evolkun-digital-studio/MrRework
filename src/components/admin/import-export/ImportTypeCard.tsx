"use client";
import Link from "next/link";
import { Badge } from "@/components/admin/ui";
import { resolveIcon } from "./icons";
import type { RegistryImporter } from "./types";

// Shared between the dashboard hub (one card per registered importer) and
// the wizard's own Step 1 "Choose Import Type" — same visual language in
// both places, since a future importer only needs a registry entry, not a
// second card design.
export default function ImportTypeCard({
  importer, selected, onSelect,
}: {
  importer: RegistryImporter;
  /** When provided, the card behaves as a selectable tile (wizard Step 1) instead of a dashboard link. */
  onSelect?: (key: string) => void;
  selected?: boolean;
}) {
  const Icon = resolveIcon(importer.icon);
  const available = importer.status === "available";

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className={`w-10 h-10 rounded-brand grid place-items-center border ${available ? "border-ink dark:border-[#f3efe8]" : "border-line dark:border-[#332e26]"}`}>
          <Icon size={18} className={available ? "" : "text-stone"} />
        </div>
        {!available && <Badge tone="neutral">Coming Soon</Badge>}
      </div>
      <div className="mt-4">
        <div className="text-[14px] font-semibold">{importer.label}</div>
        <p className="text-[12px] text-stone mt-1 leading-relaxed">{importer.description}</p>
      </div>
    </>
  );

  const baseClass = `text-left border rounded-brand bg-paper dark:bg-[#1a1712] p-5 transition h-full flex flex-col justify-between ${
    available
      ? `hover:border-ink dark:hover:border-[#f3efe8] ${selected ? "border-ink dark:border-[#f3efe8] ring-1 ring-ink dark:ring-[#f3efe8]" : "border-line dark:border-[#332e26]"}`
      : "border-line dark:border-[#332e26] opacity-60 cursor-not-allowed"
  }`;

  if (onSelect) {
    return (
      <button type="button" disabled={!available} onClick={() => onSelect(importer.key)} className={baseClass}>
        {inner}
      </button>
    );
  }

  if (available) {
    return (
      <Link href={`/admin/tools/import-export/import?type=${importer.key}`} className={baseClass}>
        {inner}
      </Link>
    );
  }

  return <div className={baseClass}>{inner}</div>;
}
