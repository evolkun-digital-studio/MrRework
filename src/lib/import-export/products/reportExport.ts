import type { AnalysisReportClient } from "@/components/admin/import-export/types";
import { csvEscape } from "@/lib/csvExport";

// Pure, client-safe formatters for the analysis report's three export
// formats. No PDF library is added for this — jsPDF/pdf-lib would bloat the
// admin bundle for a low-frequency action — instead "Download PDF" opens a
// print-styled document and calls window.print(), letting the browser's own
// "Save as PDF" produce the file. CSV/JSON never leave the browser either:
// both work directly off the report object already sitting in wizard state,
// so no server round-trip (or new API route) is needed for any of the three.

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

/** Flattens the report into a single "section,metric,value" CSV — every number/count in the report gets one row. */
export function reportToCsv(r: AnalysisReportClient): string {
  const rows: [string, string, string | number][] = [];
  const push = (section: string, metric: string, value: string | number) => rows.push([section, metric, value]);

  push("File", "File name", r.fileName);
  push("File", "Total rows", r.totalRows);
  push("File", "Analyzed at", r.analyzedAt);

  for (const [k, v] of Object.entries(r.general)) push("General Information", k, v);
  for (const [k, v] of Object.entries(r.quality)) if (typeof v === "number") push("Product Quality", k, v);
  push("Categories", "Found", r.categories.found);
  push("Categories", "Existing", r.categories.existing);
  push("Categories", "To create", r.categories.toCreate);
  push("Categories", "Nested", r.categories.nested);
  push("Categories", "Duplicate groups", r.categories.duplicateGroups.length);
  for (const a of r.attributes) push("Attributes", a.name, `${a.valueCount} values, supported=${a.supported}`);
  for (const [k, v] of Object.entries(r.variations)) push("Variations", k, v);
  for (const [k, v] of Object.entries(r.images)) push("Images", k, String(v));
  for (const [key, status] of Object.entries(r.seo)) push("SEO", key, `detected=${status.detected}, rowsPopulated=${status.rowsPopulated}`);
  for (const u of r.unsupported) push("Unsupported Data", u.field, u.reason);
  for (const [k, v] of Object.entries(r.databaseImpact)) push("Database Impact", k, v);
  for (const risk of r.risks) push("Risks", risk.message, `${risk.severity} (${risk.count})`);
  push("Summary", "Migration readiness score", r.summary.score);
  push("Summary", "Label", r.summary.label);

  const header = "section,metric,value";
  const body = rows.map(([s, m, v]) => [csvEscape(s), csvEscape(m), csvEscape(v)].join(",")).join("\n");
  return `${header}\n${body}`;
}

export function reportToJson(r: AnalysisReportClient): string {
  return JSON.stringify(r, null, 2);
}

/** A self-contained, print-styled HTML document — opened in a new tab so window.print() can produce a PDF via the browser's own "Save as PDF" destination. */
export function reportToPrintableHtml(r: AnalysisReportClient): string {
  const esc = (s: unknown) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const kv = (obj: Record<string, unknown>) =>
    Object.entries(obj).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Migration Analysis — ${esc(r.fileName)}</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #15120E; padding: 32px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; color: #8B8276; margin-top: 28px; border-bottom: 1px solid #D7D0C3; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
  td { padding: 5px 8px; border-bottom: 1px solid #EAE4D9; }
  td:first-child { color: #2C2620; }
  td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .score { font-size: 40px; font-weight: 700; }
  .label { display: inline-block; padding: 4px 10px; border-radius: 3px; font-size: 12px; text-transform: uppercase; background: #EAE4D9; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>Migration Compatibility Report</h1>
  <p>${esc(r.fileName)} — ${esc(r.totalRows)} rows — analyzed ${esc(new Date(r.analyzedAt).toLocaleString())}</p>

  <h2>Migration Readiness</h2>
  <div class="score">${r.summary.score}%</div>
  <span class="label">${esc(r.summary.label)}</span>

  <h2>General Information</h2>
  <table>${kv(r.general)}</table>

  <h2>Product Quality</h2>
  <table>${kv(Object.fromEntries(Object.entries(r.quality).filter(([, v]) => typeof v === "number")))}</table>

  <h2>Category Analysis</h2>
  <table>${kv({ Found: r.categories.found, Existing: r.categories.existing, "To create": r.categories.toCreate, Nested: r.categories.nested, "Duplicate groups": r.categories.duplicateGroups.length })}</table>

  <h2>Attribute Analysis</h2>
  <table>${r.attributes.map((a) => `<tr><td>${esc(a.name)}</td><td>${a.valueCount} values — ${a.supported ? "supported" : "not mapped"}</td></tr>`).join("")}</table>

  <h2>Variation Analysis</h2>
  <table>${kv(r.variations)}</table>

  <h2>Image Analysis</h2>
  <table>${kv(r.images)}</table>

  <h2>SEO Analysis</h2>
  <table>${Object.entries(r.seo).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.detected ? `Detected (${v.rowsPopulated} rows populated)` : "Not present"}</td></tr>`).join("")}</table>

  <h2>Unsupported Data</h2>
  <table>${r.unsupported.map((u) => `<tr><td>${esc(u.field)}</td><td>${esc(u.reason)}</td></tr>`).join("") || "<tr><td colspan=2>None detected.</td></tr>"}</table>

  <h2>Database Impact</h2>
  <table>${kv(r.databaseImpact)}</table>

  <h2>Risk Report</h2>
  <table>${r.risks.map((risk) => `<tr><td>${esc(risk.severity.toUpperCase())} — ${esc(risk.message)}</td><td>${risk.count}</td></tr>`).join("") || "<tr><td colspan=2>No risks detected.</td></tr>"}</table>
</body>
</html>`;
}
