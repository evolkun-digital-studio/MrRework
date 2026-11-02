"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { Card, Badge, Button, Table, Th, Td, EmptyState, Select } from "@/components/admin/ui";
import type { ImportJobClient } from "@/components/admin/import-export/types";

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  uploaded: "neutral", mapped: "neutral", validated: "info", importing: "warning",
  completed: "success", failed: "danger", cancelled: "neutral",
};

function formatDuration(ms?: number): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function adminName(job: ImportJobClient): string {
  const u = job.adminUser;
  if (!u || typeof u === "string") return "—";
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "—";
}

export default function ImportHistoryPage() {
  const [items, setItems] = useState<ImportJobClient[] | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  function load() {
    const sp = new URLSearchParams({ page: String(page), limit: "15" });
    if (status) sp.set("status", status);
    fetch(`/api/admin/import-export/jobs?${sp.toString()}`)
      .then((res) => res.json())
      .then((data) => { setItems(data.items ?? []); setPages(data.pages ?? 1); });
  }

  useEffect(() => { setItems(null); load(); }, [page, status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reaches an import stuck on "importing" from a crashed/restarted server
  // process — the wizard's own Run step only exists for the browser tab
  // that started it, so this is the only recovery path once that tab is
  // gone. DELETE distinguishes a genuinely stale job (no progress in 10+
  // minutes — marked failed outright) from one still actively running
  // (a normal cancel request) automatically.
  async function cancel(jobId: string) {
    setCancellingId(jobId);
    await fetch(`/api/admin/import-export/jobs/${jobId}`, { method: "DELETE" });
    load();
    setCancellingId(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold">Import History</h1>
          <p className="text-[12.5px] text-stone mt-1">Every import attempt, successful or not — kept as a permanent record.</p>
        </div>
        <Link href="/admin/tools/import-export"><Button variant="ghost" size="sm"><X size={13} /> Back to hub</Button></Link>
      </div>

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <Select
            label="Status" className="max-w-[180px]"
            value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            options={[
              { value: "", label: "All statuses" },
              { value: "completed", label: "Completed" },
              { value: "importing", label: "Importing" },
              { value: "failed", label: "Failed" },
              { value: "cancelled", label: "Cancelled" },
              { value: "uploaded", label: "Uploaded (not run)" },
              { value: "mapped", label: "Mapped (not run)" },
              { value: "validated", label: "Validated (not run)" },
            ]}
          />
        </div>

        {items === null ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState title="No imports found" description="Try a different status filter, or run your first import." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th><Th>Admin</Th><Th>File</Th><Th>Type</Th>
                  <Th>Imported</Th><Th>Updated</Th><Th>Failed</Th><Th>Duration</Th><Th>Status</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {items.map((job) => (
                  <tr key={job._id}>
                    <Td className="whitespace-nowrap text-stone">{new Date(job.createdAt).toLocaleString()}</Td>
                    <Td className="whitespace-nowrap">{adminName(job)}</Td>
                    <Td className="max-w-[200px] truncate">{job.fileName}</Td>
                    <Td className="capitalize">{job.type}</Td>
                    <Td className="font-mono">{job.report?.imported ?? 0}</Td>
                    <Td className="font-mono">{job.report?.updated ?? 0}</Td>
                    <Td className="font-mono">{job.report?.failed ?? 0}</Td>
                    <Td className="whitespace-nowrap text-stone">{formatDuration(job.report?.durationMs)}</Td>
                    <Td><Badge tone={STATUS_TONE[job.status] ?? "neutral"}>{job.status}</Badge></Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        {(job.report?.errors?.length ?? 0) > 0 && (
                          <a href={`/api/admin/import-export/jobs/${job._id}/errors`} className="inline-flex items-center gap-1 text-[11px] text-stone hover:text-ink dark:hover:text-[#f3efe8]">
                            <Download size={12} /> Errors
                          </a>
                        )}
                        {job.status === "importing" && (
                          <Button variant="ghost" size="sm" disabled={cancellingId === job._id} onClick={() => cancel(job._id)}>
                            {cancellingId === job._id ? "Cancelling…" : "Cancel"}
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>

            {pages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-line dark:border-[#332e26]">
                <span className="text-[12px] text-stone">Page {page} of {pages}</span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></Button>
                  <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
