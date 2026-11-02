"use client";
import { useEffect, useRef, useState } from "react";
import { Button, StatCard } from "@/components/admin/ui";
import type { ImportJobClient } from "../types";

function formatEta(ms?: number): string {
  if (ms === undefined) return "Calculating…";
  const s = Math.round(ms / 1000);
  if (s <= 0) return "Almost done";
  if (s < 60) return `~${s}s remaining`;
  return `~${Math.floor(s / 60)}m ${s % 60}s remaining`;
}

// Polls GET /jobs/[id] every 1.5s while status is "importing" — there's no
// push/socket layer anywhere in this app (see ARCHITECTURE.md), so this
// mirrors the same fetch-and-refresh pattern used by the rest of the admin
// panel and the customer dashboard.
export default function RunStep({ job, onDone }: { job: ImportJobClient; onDone: (job: ImportJobClient) => void }) {
  const [current, setCurrent] = useState(job);
  const [cancelling, setCancelling] = useState(false);
  const [stale, setStale] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const triggeredRef = useRef(false);

  useEffect(() => {
    // Avoids a redundant POST if this effect body ever re-runs within the
    // same mount. This alone doesn't survive React's development-mode
    // StrictMode remount (a fresh ref starts at false again there) — the
    // real protection against that is the atomic claim in runImportJob()
    // itself, which is what actually makes a second /run call a no-op.
    if (!triggeredRef.current) {
      triggeredRef.current = true;
      fetch(`/api/admin/import-export/jobs/${job._id}/run`, { method: "POST" });
    }

    intervalRef.current = setInterval(async () => {
      const res = await fetch(`/api/admin/import-export/jobs/${job._id}`);
      const data = await res.json();
      if (!data.job) return;
      setCurrent(data.job);
      setStale(!!data.stale);
      if (["completed", "failed", "cancelled"].includes(data.job.status)) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        onDone(data.job);
      }
    }, 1500);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job._id]);

  async function cancel() {
    setCancelling(true);
    await fetch(`/api/admin/import-export/jobs/${job._id}`, { method: "DELETE" });
  }

  const total = current.totalRows || 1;
  const pct = Math.min(100, Math.round((current.progress.currentRow / total) * 100));

  return (
    <div>
      <h2 className="text-[15px] font-semibold">Importing…</h2>
      <p className="text-[12.5px] text-stone mt-1 mb-5">Keep this tab open — you can navigate away safely, the import continues on the server, and you'll find it in Import History.</p>

      {stale && (
        <div role="alert" className="mb-5 rounded-brand border border-[#c98a3a] bg-[#fbf1e2] dark:bg-[#3a2c14] px-4 py-3 text-[12.5px] text-[#5a3d10] dark:text-[#e8c98a]">
          This import hasn't reported progress in over 10 minutes — the server process that was running it may have crashed or restarted. Click "Cancel Import" below to mark it as failed and stop waiting; rows already written before the interruption stay as-is.
        </div>
      )}

      <div className="border border-line dark:border-[#332e26] rounded-brand p-5">
        <div className="flex items-center justify-between text-[12.5px] mb-2">
          <span>Row {current.progress.currentRow} of {current.totalRows}</span>
          <span className="text-stone">{formatEta(current.progress.estimatedRemainingMs)}</span>
        </div>
        <div className="h-2 rounded-full bg-paper-2 dark:bg-[#26221b] overflow-hidden">
          <div className="h-full bg-ink dark:bg-[#f3efe8] transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-right text-[11.5px] text-stone mt-1">{pct}%</div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        <StatCard label="Imported" value={current.progress.imported} />
        <StatCard label="Updated" value={current.progress.updated} />
        <StatCard label="Skipped" value={current.progress.skipped} />
        <StatCard label="Failed" value={current.progress.failed} />
      </div>

      <div className="flex justify-end mt-6">
        <Button variant="danger" disabled={cancelling} onClick={cancel}>{cancelling ? "Cancelling…" : "Cancel Import"}</Button>
      </div>
    </div>
  );
}
