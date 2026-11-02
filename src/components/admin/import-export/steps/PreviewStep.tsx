"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button, StatCard, Table, Th, Td, Banner } from "@/components/admin/ui";
import type { ImportJobClient } from "../types";
import { formatUploadBytes } from "@/lib/import-export/uploadLimits";

export default function PreviewStep({ job, onPrepared, onContinue, onCancel }: {
  job: ImportJobClient;
  onPrepared: (job: ImportJobClient) => void;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const [currentJob, setCurrentJob] = useState(job);
  const [error, setError] = useState("");
  const preview = currentJob.preview;

  useEffect(() => {
    if (currentJob.preview) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const res = await fetch(`/api/admin/import-export/jobs/${job._id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not read preview progress.");
        if (stopped) return;
        setCurrentJob(data.job);
        if (data.job.progress?.currentPhase === "failed") {
          setError(data.job.progress.error || "Could not parse this file.");
          return;
        }
        if (data.job.preview) {
          onPrepared(data.job);
          return;
        }
        timer = setTimeout(poll, 1000);
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : "Could not prepare preview.");
      }
    }

    fetch(`/api/admin/import-export/jobs/${job._id}/preview`, { method: "POST" })
      .then(async (res) => { if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Could not start preview."); } })
      .then(poll)
      .catch((err) => { if (!stopped) setError(err instanceof Error ? err.message : "Could not start preview."); });

    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [job._id, currentJob.preview, onPrepared]);

  if (!preview) {
    const progress = currentJob.progress;
    const phase = progress?.currentPhase === "checking-duplicates" ? "Checking possible duplicates" : "Parsing uploaded file";
    return (
      <div>
        <h2 className="text-[15px] font-semibold">Preview</h2>
        <p className="text-[12.5px] text-stone mt-1 mb-5">Preparing a preview from the uploaded file.</p>
        {error ? <Banner tone="error">{error}</Banner> : (
          <div className="py-8">
            <div className="flex items-center gap-2 text-[13px]"><Loader2 size={16} className="animate-spin" />{phase}</div>
            <div className="h-2 mt-4 rounded-full bg-paper-2 dark:bg-[#26221b] overflow-hidden">
              <div className="h-full bg-ink dark:bg-[#f3efe8] transition-[width]" style={{ width: `${progress?.percentComplete ?? 0}%` }} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <StatCard label="Progress" value={`${progress?.percentComplete ?? 0}%`} />
              <StatCard label="File read" value={`${formatUploadBytes(progress?.bytesRead ?? 0)} / ${formatUploadBytes(progress?.bytesTotal ?? currentJob.fileSize)}`} />
              <StatCard label="Rows processed" value={progress?.rowsProcessed ?? 0} />
              <StatCard label="Statements parsed" value={progress?.statementsParsed ?? 0} />
            </div>
            {!!progress?.tablesFound?.length && <p className="text-[11.5px] text-stone mt-3">Tables found: {progress.tablesFound.join(", ")}</p>}
          </div>
        )}
        <div className="flex justify-start mt-6"><Button variant="ghost" onClick={onCancel}>Cancel</Button></div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-[15px] font-semibold">Preview</h2>
      <p className="text-[12.5px] text-stone mt-1 mb-5">A quick look at what was uploaded before you map any columns.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total rows" value={preview.totalRows} />
        <StatCard label="Columns detected" value={preview.columns.length} />
        <StatCard label="Possible duplicates" value={preview?.duplicateCount ?? 0} sub="Within this file" />
        <StatCard label="Warnings" value={preview?.warnings.length ?? 0} />
      </div>

      {preview?.warnings.map((w, i) => (
        <Banner key={i} tone="error"><AlertTriangle size={13} className="inline -mt-0.5 mr-1.5" />{w}</Banner>
      ))}

      <div className="mt-5">
        <div className="text-[12px] font-medium mb-2">Detected columns</div>
        <div className="flex flex-wrap gap-1.5">
          {(preview?.columns ?? []).map((c) => (
            <span key={c} className="text-[11px] px-2 py-1 rounded-brand border border-line dark:border-[#332e26] bg-paper-2 dark:bg-[#26221b]">{c}</span>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="text-[12px] font-medium mb-2">First {preview?.rows.length ?? 0} rows</div>
        <Table>
          <thead><tr>{(preview?.columns ?? []).map((c) => <Th key={c}>{c}</Th>)}</tr></thead>
          <tbody>
            {(preview?.rows ?? []).map((row, i) => (
              <tr key={i}>{(preview?.columns ?? []).map((c) => <Td key={c} className="max-w-[180px] truncate">{row[c]}</Td>)}</tr>
            ))}
          </tbody>
        </Table>
      </div>

      <div className="flex justify-between mt-6">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={onContinue}>Continue to Column Mapping</Button>
      </div>
    </div>
  );
}
