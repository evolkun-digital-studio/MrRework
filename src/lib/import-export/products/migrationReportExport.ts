import type { MigrationAssistantReportClient } from "@/components/admin/import-export/types";
import { csvEscape } from "@/lib/csvExport";

// Client-side export helpers for the Migration Assistant report — a new,
// separate file mirroring the pattern already established in
// reportExport.ts (which stays untouched; it's still what the Import
// Wizard's Analysis step uses). Same reasoning as before: no PDF library is
// added (print-to-PDF via the browser instead), and CSV/JSON both work
// directly off the report object already sitting in the page's state.

export function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function migrationReportToCsv(r: MigrationAssistantReportClient): string {
  const rows: [string, string, string | number][] = [];
  const push = (section: string, metric: string, value: string | number) => rows.push([section, metric, value]);

  push("File", "File name", r.fileName);
  push("File", "Analyzed at", r.analyzedAt);
  for (const [k, v] of Object.entries(r.storeProfile)) {
    push("Store Profile", k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  for (const p of r.plugins) push("Plugin Detection", p.name, `${p.status} — ${p.matchedColumns.join(", ")}`);
  for (const f of r.fieldMapping) push("Field Mapping", f.column, `${f.importStatus} (confidence: ${f.confidence})${f.mappedField ? ` -> ${f.mappedField}` : ""}`);
  for (const [k, v] of Object.entries(r.dataQuality)) push("Data Quality", k, String(v));
  for (const s of r.seo) push("SEO Report", s.label, `detected=${s.detected}, rowsPopulated=${s.rowsPopulated}, willImport=${s.willImport}`);
  for (const a of r.attributes) push("Attribute Report", a.name, `${a.valueCount} values, ${a.productsUsing} products using it, supported=${a.supported}`);
  for (const p of r.migrationPlan) push("Migration Plan", `Phase ${p.phase}: ${p.title}`, `${p.expectedCount} ${p.unit}`);
  push("Risk Assessment", "Level", r.risk.level);
  push("Risk Assessment", "Score", r.risk.score);
  r.risk.reasons.forEach((reason, i) => push("Risk Assessment", `Reason ${i + 1}`, reason));
  r.recommendations.forEach((rec, i) => push("Recommendations", `${i + 1} (${rec.priority})`, rec.message));

  const header = "section,metric,value";
  const body = rows.map(([s, m, v]) => [csvEscape(s), csvEscape(m), csvEscape(v)].join(",")).join("\n");
  return `${header}\n${body}`;
}

export function migrationReportToJson(r: MigrationAssistantReportClient): string {
  return JSON.stringify(r, null, 2);
}

export function migrationReportToPrintableHtml(r: MigrationAssistantReportClient): string {
  const esc = (s: unknown) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const kv = (obj: Record<string, unknown>) =>
    Object.entries(obj).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(typeof v === "object" ? JSON.stringify(v) : v)}</td></tr>`).join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Migration Plan — ${esc(r.fileName)}</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #15120E; padding: 32px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; color: #8B8276; margin-top: 28px; border-bottom: 1px solid #D7D0C3; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
  td { padding: 5px 8px; border-bottom: 1px solid #EAE4D9; vertical-align: top; }
  td:first-child { color: #2C2620; white-space: nowrap; }
  .level { display: inline-block; padding: 4px 10px; border-radius: 3px; font-size: 13px; text-transform: uppercase; background: #EAE4D9; }
  ul { font-size: 12.5px; padding-left: 18px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>MrRework Migration Plan</h1>
  <p>${esc(r.fileName)} — generated ${esc(new Date(r.analyzedAt).toLocaleString())}</p>

  <h2>Migration Risk</h2>
  <span class="level">${esc(r.risk.level)}</span> — score ${r.risk.score}%
  <ul>${r.risk.reasons.map((reason) => `<li>${esc(reason)}</li>`).join("")}</ul>

  <h2>Recommendations</h2>
  <ul>${r.recommendations.map((rec) => `<li>[${esc(rec.priority)}] ${esc(rec.message)}</li>`).join("") || "<li>None — no significant issues detected.</li>"}</ul>

  <h2>Migration Plan</h2>
  <table>${r.migrationPlan.map((p) => `<tr><td>Phase ${p.phase}: ${esc(p.title)}</td><td>${esc(p.description)} — expecting ${p.expectedCount} ${esc(p.unit)}</td></tr>`).join("")}</table>

  <h2>Store Profile</h2>
  <table>${kv(r.storeProfile)}</table>

  <h2>Plugin Detection</h2>
  <table>${r.plugins.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.status)} — ${esc(p.explanation)}</td></tr>`).join("") || "<tr><td colspan=2>No known plugins detected.</td></tr>"}</table>

  <h2>Data Quality</h2>
  <table>${kv(r.dataQuality as unknown as Record<string, unknown>)}</table>

  <h2>SEO Report</h2>
  <table>${r.seo.map((s) => `<tr><td>${esc(s.label)}</td><td>${s.detected ? `Detected (${s.rowsPopulated} rows) — ${s.willImport ? "will be imported" : "will NOT be imported"}` : "Not present"}</td></tr>`).join("")}</table>

  <h2>Field Mapping</h2>
  <table>${r.fieldMapping.map((f) => `<tr><td>${esc(f.column)}</td><td>${esc(f.importStatus)} (confidence: ${esc(f.confidence)})${f.mappedField ? ` → ${esc(f.mappedField)}` : ""}</td></tr>`).join("")}</table>
</body>
</html>`;
}
