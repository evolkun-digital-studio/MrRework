import type { CsvPreview, TargetField } from "./types";
import { reportParsingProgress, yieldToEventLoop } from "./parsingProgress";
import { discoverTables } from "./sqlParser";
import { isPluginMetadataColumn } from "./pluginColumnPatterns";

/**
 * Finds every target field claimed by more than one source column —
 * { targetFieldKey: [column1, column2, ...] } for each conflict, empty when
 * the mapping is injective (the only state that should ever reach
 * applyMapping/the database). This is the single source of truth for
 * "is this mapping corrupt" — the Mapping step UI, the PATCH /mapping route,
 * and applyMapping's own defense-in-depth below all call this same check.
 *
 * See mapping-corruption incident: a saved job had both "Name" and
 * "Meta: _elementor_version" mapped to "name" — applyMapping's old
 * last-write-wins behavior silently replaced 308 of 309 product names with
 * an empty string (and one with the literal text "3.35.6", an Elementor
 * plugin version), because nothing anywhere checked for this.
 */
export function findDuplicateTargetMappings(mapping: Record<string, string>): Record<string, string[]> {
  const columnsByTarget = new Map<string, string[]>();
  for (const [column, targetKey] of Object.entries(mapping)) {
    if (!targetKey) continue;
    const columns = columnsByTarget.get(targetKey) ?? [];
    columns.push(column);
    columnsByTarget.set(targetKey, columns);
  }
  const duplicates: Record<string, string[]> = {};
  for (const [targetKey, columns] of columnsByTarget) {
    if (columns.length > 1) duplicates[targetKey] = columns;
  }
  return duplicates;
}

/**
 * Applies a saved/edited mapping to one raw CSV row -> { targetFieldKey: value }.
 *
 * Defense-in-depth only: by the time a mapping reaches here it should
 * already be injective (rejected otherwise by the Mapping step UI and the
 * PATCH /mapping route — see findDuplicateTargetMappings above). This still
 * guards against a mapping saved before that validation existed, or written
 * directly to the database — first column for a given target field wins
 * (deterministic, matches the order autoMatchColumns itself would produce),
 * rather than the old behavior of silently overwriting with whichever
 * column happened to be inserted last.
 */
export function applyMapping(raw: Record<string, string>, mapping: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const claimed = new Set<string>();
  for (const [column, targetKey] of Object.entries(mapping)) {
    if (!targetKey || claimed.has(targetKey)) continue;
    claimed.add(targetKey);
    out[targetKey] = raw[column] ?? "";
  }
  return out;
}

/**
 * Best-effort automatic column matching for Step 4 — exact alias matches
 * only (case-insensitive). Left for manual remapping when nothing matches.
 * Returns { csvColumnName: targetFieldKey }, matching ImportJob.columnMapping's shape.
 *
 * Never auto-matches a plugin/theme-metadata-looking column (Meta: *,
 * _elementor_*, woodmart_*, rank_math*, _attribute:* — see
 * pluginColumnPatterns.ts) onto a real field, even if some future TARGET_FIELDS
 * alias would otherwise happen to match one — these columns are Woodmart/
 * Elementor/Rank Math internals, never real product data.
 *
 * Pure — no filesystem access, so unlike the rest of csv.ts this has no
 * `server-only` guard and is safe to import from a plain Node script (the
 * repair scripts under scripts/ run outside Next's module resolution).
 */
export function autoMatchColumns(detectedColumns: string[], targetFields: TargetField[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const usedTargets = new Set<string>();
  for (const column of detectedColumns) {
    if (isPluginMetadataColumn(column)) continue;
    const norm = column.trim().toLowerCase();
    const match = targetFields.find(
      (f) => !f.unsupported && !usedTargets.has(f.key) && f.aliases.some((a) => a.toLowerCase() === norm)
    );
    if (match) {
      mapping[column] = match.key;
      usedTargets.add(match.key);
    }
  }
  return mapping;
}

/**
 * The same preview shape parseHeaderAndPreview (csv.ts) produces — headers,
 * first `previewCount` rows, total row count — but generic over *any* row
 * source, not just CSV. The upload route uses this for an importer that
 * registers its own `streamRows` (e.g. customers, parsing SQL): the source
 * format can be anything, as long as it yields flat { column: value } rows,
 * which is exactly what makes the rest of the wizard (preview, column
 * mapping, validation) format-agnostic in the first place.
 */
export async function buildPreviewFromRows(
  readRows: (filePath: string) => AsyncGenerator<Record<string, string>>,
  filePath: string,
  previewCount = 10
): Promise<CsvPreview> {
  const rows: Record<string, string>[] = [];
  let columns: string[] = [];
  let totalRows = 0;
  for await (const record of readRows(filePath)) {
    if (totalRows === 0) columns = Object.keys(record);
    if (rows.length < previewCount) rows.push(record);
    totalRows++;
    reportParsingProgress({ rowsProcessed: 1 });
    if (totalRows % 250 === 0) await yieldToEventLoop();
  }
  const warnings: string[] = totalRows === 0 ? [await describeEmptySqlSource(filePath)] : [];
  return { totalRows, columns, rows, warnings };
}

/**
 * Every importer that reaches this function is SQL-sourced (this is only
 * ever called when `importer.streamRows` is registered — see
 * preparePreview.ts; today that's Customers/Orders/Reviews/Blog/Pages/
 * Content, never the plain-CSV Product importer) — so a bare "The file has
 * no data rows" is ambiguous in exactly the way that caused real confusion:
 * it reads the same whether the file is genuinely empty, or it's a
 * perfectly valid, non-empty export that simply doesn't contain the tables
 * this importer looks for (e.g. uploading a WooCommerce sessions/log-only
 * dump to the Customer importer). Running discoverTables() over the same
 * file turns that into a concrete, actionable answer either way.
 */
async function describeEmptySqlSource(filePath: string): Promise<string> {
  let discovered: Awaited<ReturnType<typeof discoverTables>>;
  try {
    discovered = await discoverTables(filePath);
  } catch {
    return "The file has no data rows.";
  }
  if (!discovered.length) return "The file has no data rows — no CREATE TABLE or INSERT/REPLACE statements were found in it at all.";
  const shown = discovered.slice(0, 8);
  const summary = shown.map((t) => `${t.table} (${t.rowCount} row${t.rowCount === 1 ? "" : "s"})`).join(", ");
  const remainder = discovered.length > shown.length ? `, and ${discovered.length - shown.length} more table(s)` : "";
  return `This file doesn't contain any of the tables this importer looks for. Tables found instead: ${summary}${remainder}.`;
}
