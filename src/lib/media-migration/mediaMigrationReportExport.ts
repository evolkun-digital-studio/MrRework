import type { MediaMigrationJobClient } from "@/components/admin/import-export/types";
import { csvEscape } from "@/lib/csvExport";

// Third instance of the same client-side export pattern established by
// reportExport.ts and migrationReportExport.ts — no PDF library, print-to-PDF
// via the browser instead; CSV/JSON built from the already-fetched job object.

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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function mediaReportToCsv(job: MediaMigrationJobClient): string {
  const rows: [string, string, string | number][] = [
    ["Report", "Downloaded", job.report.downloaded],
    ["Report", "Reused", job.report.reused],
    ["Report", "Duplicates", job.report.duplicates],
    ["Report", "Failed", job.report.failed],
    ["Report", "Broken URLs", job.report.brokenUrls],
    ["Report", "Unsupported Formats", job.report.unsupportedFormats],
    ["Report", "Total Storage Used", formatBytes(job.report.totalBytes)],
    ["Report", "Average Download Speed", `${formatBytes(job.report.avgDownloadSpeedBytesPerSec)}/s`],
    ["Report", "Duration (ms)", job.report.durationMs ?? 0],
    ["Rollback Prep", "Downloaded Media IDs", job.rollbackPrep.downloadedMediaIds.length],
    ["Rollback Prep", "Updated Product IDs", job.rollbackPrep.updatedProductIds.length],
    ["Rollback Prep", "Updated Category IDs", job.rollbackPrep.updatedCategoryIds.length],
    ...job.report.errors.map((e): [string, string, string] => ["Errors", e.url, e.message]),
  ];
  return ["section,metric,value", ...rows.map(([s, m, v]) => [csvEscape(s), csvEscape(m), csvEscape(v)].join(","))].join("\n");
}

export function mediaReportToJson(job: MediaMigrationJobClient): string {
  return JSON.stringify(job, null, 2);
}

export function mediaReportToPrintableHtml(job: MediaMigrationJobClient): string {
  const esc = (s: unknown) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>Media Migration Report</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #15120E; padding: 32px; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 20px; } h2 { font-size: 14px; text-transform: uppercase; color: #8B8276; margin-top: 24px; border-bottom: 1px solid #D7D0C3; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
  td { padding: 5px 8px; border-bottom: 1px solid #EAE4D9; } td:last-child { text-align: right; }
</style></head>
<body>
  <h1>Media Migration Report</h1>
  <p>Sources: ${esc(job.sources.join(", "))} — status: ${esc(job.status)}</p>
  <h2>Summary</h2>
  <table>
    <tr><td>Downloaded</td><td>${job.report.downloaded}</td></tr>
    <tr><td>Reused</td><td>${job.report.reused}</td></tr>
    <tr><td>Duplicates</td><td>${job.report.duplicates}</td></tr>
    <tr><td>Failed</td><td>${job.report.failed}</td></tr>
    <tr><td>Broken URLs</td><td>${job.report.brokenUrls}</td></tr>
    <tr><td>Unsupported Formats</td><td>${job.report.unsupportedFormats}</td></tr>
    <tr><td>Total Storage Used</td><td>${esc(formatBytes(job.report.totalBytes))}</td></tr>
    <tr><td>Average Download Speed</td><td>${esc(formatBytes(job.report.avgDownloadSpeedBytesPerSec))}/s</td></tr>
  </table>
  <h2>Errors</h2>
  <table>${job.report.errors.map((e) => `<tr><td>${esc(e.url)}</td><td>${esc(e.message)}</td></tr>`).join("") || "<tr><td colspan=2>None.</td></tr>"}</table>
</body></html>`;
}
