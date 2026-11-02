"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { X, ScanSearch } from "lucide-react";
import { Card, StatCard, Button, Banner, Badge } from "@/components/admin/ui";
import { MediaMigrationProgress, MediaMigrationReport, MediaSourceBadge } from "@/components/admin/import-export/MediaMigrationView";
import type { MediaSourceClient, MediaScanSummaryClient, MediaMigrationJobClient } from "@/components/admin/import-export/types";

type Phase = "select" | "scanning" | "summary" | "running" | "done";

// The Media Migration Manager's own standalone page — a new tool in the
// Import & Export Center, not a modification of the Import Wizard or any
// existing page. See ADMIN_CMS.md's "Media Migration Manager" section for
// the full architecture (pluggable source registry, download pipeline,
// SSRF/format/size validation, dedup by URL then hash).
export default function MediaMigrationPage() {
  const [phase, setPhase] = useState<Phase>("select");
  const [sources, setSources] = useState<MediaSourceClient[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<MediaScanSummaryClient | null>(null);
  const [job, setJob] = useState<MediaMigrationJobClient | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/media-migration/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sources: [] }) })
      .then((res) => res.json())
      .then((data) => {
        setSources(data.registry ?? []);
        const available = (data.registry ?? []).filter((s: MediaSourceClient) => s.status === "available").map((s: MediaSourceClient) => s.key);
        setSelected(new Set(available));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSource(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function runScan() {
    setPhase("scanning");
    setError("");
    try {
      const res = await fetch("/api/admin/media-migration/scan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed.");
      setSummary(data.summary);
      setPhase("summary");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed.");
      setPhase("select");
    }
  }

  async function startMigration() {
    if (!summary) return;
    setStarting(true);
    setError("");
    try {
      const createRes = await fetch("/api/admin/media-migration/jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: [...selected], expected: { totalReferences: summary.totalReferences, distinctUrls: summary.distinctUrls } }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || "Could not create the migration job.");
      setJob(createData.job);

      await fetch(`/api/admin/media-migration/jobs/${createData.job._id}/run`, { method: "POST" });
      setPhase("running");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the migration.");
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    if (phase !== "running" || !job) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/admin/media-migration/jobs/${job._id}`);
      const data = await res.json();
      if (!data.job) return;
      setJob(data.job);
      if (["completed", "failed", "cancelled"].includes(data.job.status)) {
        clearInterval(interval);
        setPhase("done");
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [phase, job]);

  async function cancelMigration() {
    if (!job) return;
    setCancelling(true);
    await fetch(`/api/admin/media-migration/jobs/${job._id}/cancel`, { method: "POST" });
    setCancelling(false);
  }

  function reset() {
    setPhase("select");
    setSummary(null);
    setJob(null);
    setError("");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold">Media Migration Manager</h1>
          <p className="text-[12.5px] text-stone mt-1 max-w-2xl">
            Downloads every externally-referenced image into the Media Library and repoints the referencing
            products/categories at the new local copy — so the site no longer depends on the old host.
          </p>
        </div>
        <Link href="/admin/tools/import-export"><Button variant="ghost" size="sm"><X size={13} /> Back to hub</Button></Link>
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      {(phase === "select" || phase === "scanning") && (
        <Card title="Media Sources" description="Which already-migrated content should be scanned for external image URLs?">
          {sources === null ? (
            <div className="h-24 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />
          ) : (
            <div className="space-y-2">
              {sources.map((s) => (
                <label key={s.key} className={`flex items-start gap-3 p-3 rounded-brand border border-line dark:border-[#332e26] ${s.status === "available" ? "cursor-pointer" : "opacity-60"}`}>
                  <input
                    type="checkbox" className="mt-0.5" disabled={s.status !== "available"}
                    checked={selected.has(s.key)} onChange={() => toggleSource(s.key)}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{s.label}</span>
                      <MediaSourceBadge status={s.status} />
                    </div>
                    <p className="text-[12px] text-stone mt-0.5">{s.description}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
          <div className="flex justify-end mt-5">
            <Button disabled={phase === "scanning" || selected.size === 0} onClick={runScan}>
              <ScanSearch size={14} /> {phase === "scanning" ? "Scanning…" : "Scan for Images"}
            </Button>
          </div>
        </Card>
      )}

      {(phase === "summary") && summary && (
        <Card title="Pre-Flight Summary" description="Nothing has been downloaded yet.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <StatCard label="Total References" value={summary.totalReferences} />
            <StatCard label="Distinct URLs" value={summary.distinctUrls} />
            <StatCard label="Already in Media Library" value={summary.alreadyExisting} sub="Will be reused" />
            <StatCard label="To Download" value={summary.toDownload} />
          </div>
          <div className="flex flex-wrap gap-1.5 mb-5">
            {summary.perSource.map((s) => <Badge key={s.key} tone="neutral">{s.label}: {s.referenceCount}</Badge>)}
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={reset}>Back</Button>
            <Button disabled={starting} onClick={startMigration}>{starting ? "Starting…" : "Start Media Migration"}</Button>
          </div>
        </Card>
      )}

      {phase === "running" && job && <MediaMigrationProgress job={job} onCancel={cancelMigration} cancelling={cancelling} />}

      {phase === "done" && job && (
        <>
          <MediaMigrationReport job={job} />
          <div className="flex justify-end"><Button variant="ghost" onClick={reset}>Run Another Migration</Button></div>
        </>
      )}
    </div>
  );
}
