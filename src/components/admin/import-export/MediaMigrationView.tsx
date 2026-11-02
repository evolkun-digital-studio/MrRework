"use client";
import { Card, StatCard, Table, Th, Td, Badge, Button, Banner } from "@/components/admin/ui";
import { FileJson, FileText, Printer } from "lucide-react";
import { downloadBlob, mediaReportToCsv, mediaReportToJson, mediaReportToPrintableHtml } from "@/lib/media-migration/mediaMigrationReportExport";
import type { MediaMigrationJobClient } from "./types";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatEta(ms?: number): string {
  if (ms === undefined) return "Calculating…";
  const s = Math.round(ms / 1000);
  if (s <= 0) return "Almost done";
  if (s < 60) return `~${s}s remaining`;
  return `~${Math.floor(s / 60)}m ${s % 60}s remaining`;
}

export function MediaMigrationProgress({ job, onCancel, cancelling }: { job: MediaMigrationJobClient; onCancel: () => void; cancelling: boolean }) {
  const total = job.expected.distinctUrls || 1;
  const pct = Math.min(100, Math.round((job.progress.processed / total) * 100));

  return (
    <Card>
      <h2 className="text-[15px] font-semibold mb-1">Downloading Media…</h2>
      <p className="text-[12.5px] text-stone mb-4">Keep this tab open — the migration continues on the server either way.</p>

      <div className="border border-line dark:border-[#332e26] rounded-brand p-5">
        <div className="flex items-center justify-between text-[12.5px] mb-2">
          <span>{job.progress.processed} of {job.expected.distinctUrls} URLs</span>
          <span className="text-stone">{formatEta(job.progress.estimatedRemainingMs)}</span>
        </div>
        <div className="h-2 rounded-full bg-paper-2 dark:bg-[#26221b] overflow-hidden">
          <div className="h-full bg-ink dark:bg-[#f3efe8] transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px] text-stone truncate max-w-[70%]">{job.progress.currentUrl}</span>
          <span className="text-[11.5px] text-stone">{pct}%</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-5">
        <StatCard label="Downloaded" value={job.progress.downloaded} />
        <StatCard label="Reused" value={job.progress.reused} />
        <StatCard label="Duplicates" value={job.progress.duplicates} />
        <StatCard label="Skipped" value={job.progress.skipped} />
        <StatCard label="Failed" value={job.progress.failed} />
      </div>
      <div className="text-[11.5px] text-stone mt-2">{formatBytes(job.progress.bytesDownloaded)} downloaded so far</div>

      <div className="flex justify-end mt-5">
        <Button variant="danger" disabled={cancelling} onClick={onCancel}>{cancelling ? "Cancelling…" : "Cancel Migration"}</Button>
      </div>
    </Card>
  );
}

export function MediaMigrationReport({ job }: { job: MediaMigrationJobClient }) {
  function exportCsv() { downloadBlob(mediaReportToCsv(job), `media-migration-${job._id}.csv`, "text/csv;charset=utf-8"); }
  function exportJson() { downloadBlob(mediaReportToJson(job), `media-migration-${job._id}.json`, "application/json"); }
  function exportPdf() {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(mediaReportToPrintableHtml(job));
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <Card
      title={job.status === "completed" ? "Media Migration Complete" : job.status === "cancelled" ? "Media Migration Cancelled" : "Media Migration Failed"}
      description={`Finished in ${job.report.durationMs ? Math.round(job.report.durationMs / 1000) : 0}s.`}
      action={
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={exportPdf}><Printer size={13} /> PDF</Button>
          <Button variant="ghost" size="sm" onClick={exportCsv}><FileText size={13} /> CSV</Button>
          <Button variant="ghost" size="sm" onClick={exportJson}><FileJson size={13} /> JSON</Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <StatCard label="Downloaded" value={job.report.downloaded} />
        <StatCard label="Reused" value={job.report.reused} />
        <StatCard label="Duplicates" value={job.report.duplicates} />
        <StatCard label="Failed" value={job.report.failed} />
        <StatCard label="Broken URLs" value={job.report.brokenUrls} />
        <StatCard label="Unsupported Formats" value={job.report.unsupportedFormats} />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label="Total Storage Used" value={formatBytes(job.report.totalBytes)} />
        <StatCard label="Avg. Download Speed" value={`${formatBytes(job.report.avgDownloadSpeedBytesPerSec)}/s`} />
      </div>

      {job.report.warnings.map((w, i) => <Banner key={i} tone="error">{w}</Banner>)}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Media Downloaded" value={job.rollbackPrep.downloadedMediaIds.length} sub="Recorded for future rollback" />
        <StatCard label="Products Updated" value={job.rollbackPrep.updatedProductIds.length} />
        <StatCard label="Categories Updated" value={job.rollbackPrep.updatedCategoryIds.length} />
      </div>

      {job.report.errors.length > 0 && (
        <div>
          <div className="text-[12px] font-medium mb-2">Errors ({job.report.errors.length})</div>
          <Table>
            <thead><tr><Th>URL</Th><Th>Reason</Th></tr></thead>
            <tbody>
              {job.report.errors.slice(0, 50).map((e, i) => (
                <tr key={i}><Td className="max-w-[280px] truncate">{e.url}</Td><Td>{e.message}</Td></tr>
              ))}
            </tbody>
          </Table>
          {job.report.errors.length > 50 && <p className="text-[11.5px] text-stone mt-2">And {job.report.errors.length - 50} more — download the full log above.</p>}
        </div>
      )}
    </Card>
  );
}

export function MediaSourceBadge({ status }: { status: "available" | "coming-soon" }) {
  return <Badge tone={status === "available" ? "success" : "neutral"}>{status === "available" ? "Available" : "Coming Soon"}</Badge>;
}
