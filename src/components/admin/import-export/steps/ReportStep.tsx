"use client";
import Link from "next/link";
import { CheckCircle2, XCircle, AlertOctagon, Download } from "lucide-react";
import { Button, StatCard, Banner, Table, Th, Td } from "@/components/admin/ui";
import type { ImportJobClient } from "../types";

function formatDuration(ms?: number): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function ReportStep({ job, onImportAnother }: { job: ImportJobClient; onImportAnother: () => void }) {
  const report = job.report;
  const failed = report?.failed ?? 0;

  return (
    <div>
      <div className="flex items-center gap-2.5">
        {job.status === "completed" ? (
          <CheckCircle2 size={20} className="text-[#1f3d2b]" />
        ) : job.status === "cancelled" ? (
          <AlertOctagon size={20} className="text-stone" />
        ) : (
          <XCircle size={20} className="text-[#4a1414]" />
        )}
        <h2 className="text-[15px] font-semibold">
          {job.status === "completed" ? "Import complete" : job.status === "cancelled" ? "Import cancelled" : "Import failed"}
        </h2>
      </div>
      <p className="text-[12.5px] text-stone mt-1 mb-5">Finished in {formatDuration(report?.durationMs)}.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Imported" value={report?.imported ?? 0} />
        <StatCard label="Updated" value={report?.updated ?? 0} />
        <StatCard label="Skipped" value={report?.skipped ?? 0} />
        <StatCard label="Failed" value={failed} />
      </div>

      {report?.warnings.map((w, i) => <Banner key={i} tone="error">{w}</Banner>)}

      {failed > 0 && report && report.errorSummary && report.errorSummary.length > 0 && (
        <div className="mt-5">
          <div className="text-[12px] font-medium mb-2">Why rows failed</div>
          <Table>
            <thead><tr><Th>Count</Th><Th>Reason</Th></tr></thead>
            <tbody>
              {report.errorSummary.map((s, i) => (
                <tr key={i}><Td className="font-mono">{s.count}</Td><Td>{s.message}</Td></tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {failed > 0 && report && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[12px] font-medium">Failed rows</div>
            <a href={`/api/admin/import-export/jobs/${job._id}/errors`} className="inline-flex items-center gap-1.5 text-[12px] text-stone hover:text-ink dark:hover:text-[#f3efe8]">
              <Download size={13} /> Download error log
            </a>
          </div>
          <Table>
            <thead><tr><Th>Row</Th><Th>SKU</Th><Th>Name</Th><Th>Reason</Th></tr></thead>
            <tbody>
              {report.errors.slice(0, 50).map((e, i) => (
                <tr key={i}>
                  <Td className="font-mono">{e.row}</Td>
                  <Td className="font-mono">{e.identifier || "—"}</Td>
                  <Td>{e.label || "—"}</Td>
                  <Td>{e.message}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {report.errors.length > 50 && <p className="text-[11.5px] text-stone mt-2">And {report.errors.length - 50} more — download the full log above.</p>}
        </div>
      )}

      <div className="flex justify-between mt-6">
        <Link href="/admin/tools/import-export/history"><Button variant="ghost">View Import History</Button></Link>
        <div className="flex gap-2">
          <Link href="/admin/products"><Button variant="ghost">Go to Products</Button></Link>
          <Button onClick={onImportAnother}>Import Another File</Button>
        </div>
      </div>
    </div>
  );
}
