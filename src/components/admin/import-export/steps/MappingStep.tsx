"use client";
import { useEffect, useMemo, useState } from "react";
import { Save, AlertTriangle } from "lucide-react";
import { Button, Select, Input, Banner, Badge } from "@/components/admin/ui";
import type { ImportJobClient, MappingPresetClient, RegistryTargetField } from "../types";
import { isPluginMetadataColumn } from "@/lib/import-export/pluginColumnPatterns";

const NONE = "__none__";

/**
 * Which target field (if any) is claimed by more than one column — the
 * client-side half of the duplicate-mapping guard (the PATCH /mapping route
 * enforces the same rule server-side; see findDuplicateTargetMappings in
 * src/lib/import-export/mapping.ts, which this deliberately mirrors rather
 * than imports — that module pulls in sqlParser.ts's `fs` import and can't
 * be bundled into a "use client" component).
 */
function findDuplicateTargets(mapping: Record<string, string>): Map<string, string[]> {
  const columnsByTarget = new Map<string, string[]>();
  for (const [column, targetKey] of Object.entries(mapping)) {
    if (!targetKey) continue;
    const columns = columnsByTarget.get(targetKey) ?? [];
    columns.push(column);
    columnsByTarget.set(targetKey, columns);
  }
  const duplicates = new Map<string, string[]>();
  for (const [targetKey, columns] of columnsByTarget) {
    if (columns.length > 1) duplicates.set(targetKey, columns);
  }
  return duplicates;
}

export default function MappingStep({
  job, targetFields, saving, error, onContinue, onBack,
}: {
  job: ImportJobClient;
  targetFields: RegistryTargetField[];
  saving: boolean;
  error: string;
  onContinue: (mapping: Record<string, string>, duplicateStrategy: "update" | "skip") => void;
  onBack: () => void;
}) {
  const [mapping, setMapping] = useState<Record<string, string>>(job.columnMapping ?? {});
  const [duplicateStrategy, setDuplicateStrategy] = useState<"update" | "skip">(job.duplicateStrategy ?? "update");
  const [presets, setPresets] = useState<MappingPresetClient[]>([]);
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);
  const [acknowledgedSuspicious, setAcknowledgedSuspicious] = useState(false);

  function loadPresets() {
    fetch(`/api/admin/import-export/presets?type=${job.type}`).then((res) => res.json()).then((data) => setPresets(data.items ?? []));
  }
  useEffect(loadPresets, [job.type]);

  const mappable = targetFields.filter((f) => !f.unsupported);
  const unsupported = targetFields.filter((f) => f.unsupported);
  const mappedTargetKeys = new Set(Object.values(mapping));
  const missingRequired = mappable.filter((f) => f.required && !mappedTargetKeys.has(f.key));

  // Columns that are almost certainly Woodmart/Elementor/Rank Math plugin
  // internals get their own collapsed section below, instead of being mixed
  // in among the ~15 columns that actually matter — a WooCommerce export can
  // easily carry 80-100 "Meta: ..." columns, and reviewing that many
  // dropdowns in one flat list is exactly how a column meant to be skipped
  // gets mapped to a real field by mistake (see duplicateTargets below).
  const regularColumns = job.detectedColumns.filter((c) => !isPluginMetadataColumn(c));
  const pluginColumns = job.detectedColumns.filter((c) => isPluginMetadataColumn(c));

  const duplicateTargets = useMemo(() => findDuplicateTargets(mapping), [mapping]);
  const conflictedColumns = useMemo(() => new Set([...duplicateTargets.values()].flat()), [duplicateTargets]);

  // A required field mapped from a plugin-metadata column is very likely a
  // mis-click (this exact mistake — "Meta: _elementor_version" mapped to
  // Product Name — silently overwrote 308 real product names with an empty
  // string). Not blocked outright, since an admin might genuinely have
  // useful data stashed in a Meta column, but it does require an explicit
  // "yes, I meant to do that" before Continue is enabled.
  const suspiciousMappings = mappable
    .filter((f) => f.required)
    .map((f) => {
      const column = Object.keys(mapping).find((c) => mapping[c] === f.key);
      return column && isPluginMetadataColumn(column) ? { field: f, column } : null;
    })
    .filter((x): x is { field: RegistryTargetField; column: string } => x !== null);

  const hasDuplicates = duplicateTargets.size > 0;
  const hasUnacknowledgedSuspicion = suspiciousMappings.length > 0 && !acknowledgedSuspicious;

  function setColumnTarget(column: string, targetKey: string) {
    setAcknowledgedSuspicious(false);
    setMapping((m) => {
      const next = { ...m };
      if (targetKey === NONE) delete next[column];
      else next[column] = targetKey;
      return next;
    });
  }

  async function savePreset() {
    if (!presetName.trim()) return;
    setSavingPreset(true);
    try {
      await fetch("/api/admin/import-export/presets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: presetName.trim(), importType: job.type, mapping }),
      });
      setPresetName("");
      loadPresets();
    } finally {
      setSavingPreset(false);
    }
  }

  function applyPreset(id: string) {
    const preset = presets.find((p) => p._id === id);
    if (preset) setMapping(preset.mapping);
  }

  function renderColumnRow(column: string) {
    const current = mapping[column] ?? NONE;
    const conflicted = conflictedColumns.has(column);
    return (
      <div key={column} className={`flex items-center gap-4 px-4 py-2.5 ${conflicted ? "bg-[#4a1414]/5 dark:bg-[#4a1414]/20" : ""}`}>
        <div className="flex-1 min-w-0 flex items-center gap-1.5 text-[13px] truncate" title={column}>
          {conflicted && <AlertTriangle size={13} className="shrink-0 text-[#4a1414] dark:text-[#e08585]" />}
          <span className="truncate">{column}</span>
        </div>
        <div className="w-64 shrink-0">
          <Select
            value={current}
            onChange={(e) => setColumnTarget(column, e.target.value)}
            options={[
              { value: NONE, label: "— Do not import —" },
              ...mappable.map((f) => ({ value: f.key, label: f.required ? `${f.label} *` : f.label })),
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-[15px] font-semibold">Column Mapping</h2>
      <p className="text-[12.5px] text-stone mt-1 mb-5">Columns were auto-matched where possible. Adjust anything that looks wrong.</p>

      {error && <Banner tone="error">{error}</Banner>}

      {hasDuplicates && (
        // Not <Banner> here — Banner always renders a <p>, and this content
        // includes <ul>, which is invalid inside <p> (a real hydration
        // error, not a styling choice — see the identical note in
        // MigrationApprovalCard.tsx) — so this copies Banner's "error" tone
        // styling onto a plain <div> instead.
        <div role="alert" className="mb-4 text-[13px] rounded-brand px-4 py-3 border border-[#4a1414] text-[#4a1414] dark:text-[#e08585] bg-[#4a1414]/5">
          <div className="font-medium mb-1">Multiple columns are mapped to the same field — this must be fixed before continuing.</div>
          <ul className="list-disc pl-4 space-y-0.5">
            {[...duplicateTargets.entries()].map(([targetKey, columns]) => {
              const field = mappable.find((f) => f.key === targetKey);
              return (
                <li key={targetKey}>
                  <strong>{field?.label ?? targetKey}</strong> is mapped from both {columns.map((c) => `"${c}"`).join(" and ")} — set all but one to "Do not import".
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!hasDuplicates && suspiciousMappings.length > 0 && (
        <div role="alert" className="mb-4 text-[13px] rounded-brand px-4 py-3 border border-[#4a1414] text-[#4a1414] dark:text-[#e08585] bg-[#4a1414]/5">
          <div className="font-medium mb-1">Suspicious mapping detected.</div>
          <ul className="list-disc pl-4 space-y-0.5 mb-2">
            {suspiciousMappings.map(({ field, column }) => (
              <li key={field.key}>
                Required field <strong>{field.label}</strong> is mapped from <strong>"{column}"</strong>, which looks like plugin/theme metadata rather than real product data.
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={acknowledgedSuspicious} onChange={(e) => setAcknowledgedSuspicious(e.target.checked)} />
            I checked these columns and want to map them this way anyway.
          </label>
        </div>
      )}

      {presets.length > 0 && (
        <div className="mb-4 max-w-xs">
          <Select label="Load a saved mapping preset" options={[{ value: "", label: "— Select a preset —" }, ...presets.map((p) => ({ value: p._id, label: p.name }))]} onChange={(e) => e.target.value && applyPreset(e.target.value)} />
        </div>
      )}

      <div className="border border-line dark:border-[#332e26] rounded-brand divide-y divide-line dark:divide-[#332e26]">
        {regularColumns.map(renderColumnRow)}
      </div>

      {pluginColumns.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[12px] text-stone select-none">
            Plugin &amp; theme metadata ({pluginColumns.length} columns) — not used by product import unless you map one yourself
          </summary>
          <div className="mt-2 border border-line dark:border-[#332e26] rounded-brand divide-y divide-line dark:divide-[#332e26]">
            {pluginColumns.map(renderColumnRow)}
          </div>
        </details>
      )}

      {unsupported.length > 0 && (
        <div className="mt-4">
          <div className="text-[11.5px] uppercase tracking-wide text-stone mb-2">Not supported by the current schema</div>
          <div className="flex flex-wrap gap-1.5">
            {unsupported.map((f) => <Badge key={f.key} tone="neutral">{f.label}</Badge>)}
          </div>
          <p className="text-[11.5px] text-stone mt-1.5">These are recognized but have no matching Product field, so they're never imported.</p>
        </div>
      )}

      <div className="mt-5 flex items-end gap-3">
        <Input label="Save current mapping as a preset" placeholder="e.g. My WooCommerce export" value={presetName} onChange={(e) => setPresetName(e.target.value)} className="max-w-xs" />
        <Button variant="ghost" size="sm" disabled={!presetName.trim() || savingPreset || hasDuplicates} onClick={savePreset}><Save size={13} /> Save preset</Button>
      </div>

      <div className="mt-5 max-w-xs">
        <Select
          label="If a product already exists (matched by SKU, then slug)"
          value={duplicateStrategy}
          onChange={(e) => setDuplicateStrategy(e.target.value as "update" | "skip")}
          options={[{ value: "update", label: "Update the existing product" }, { value: "skip", label: "Skip it" }]}
        />
      </div>

      {missingRequired.length > 0 && (
        <Banner tone="error">Missing required fields: {missingRequired.map((f) => f.label).join(", ")}.</Banner>
      )}

      <div className="flex justify-between mt-6">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button disabled={saving || missingRequired.length > 0 || hasDuplicates || hasUnacknowledgedSuspicion} onClick={() => onContinue(mapping, duplicateStrategy)}>
          {saving ? "Validating…" : "Continue to Validation"}
        </Button>
      </div>
    </div>
  );
}
