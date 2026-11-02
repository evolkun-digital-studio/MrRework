"use client";
import ImportTypeCard from "../ImportTypeCard";
import type { RegistryImporter } from "../types";

export default function TypeStep({
  importers, selected, onSelect,
}: {
  importers: RegistryImporter[] | null;
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div>
      <h2 className="text-[15px] font-semibold">Choose what to import</h2>
      <p className="text-[12.5px] text-stone mt-1 mb-5">Only Products can be imported today — the rest are on the roadmap and will appear here once ready.</p>

      {importers === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-[150px] rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {importers.map((imp) => (
            <ImportTypeCard key={imp.key} importer={imp} selected={selected === imp.key} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
