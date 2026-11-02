"use client";
import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Card, Button, Banner } from "@/components/admin/ui";
import UploadStep from "@/components/admin/import-export/steps/UploadStep";
import MigrationAssistantView from "@/components/admin/import-export/MigrationAssistantView";
import type { ImportJobClient, MigrationAssistantReportClient } from "@/components/admin/import-export/types";
import { prepareUploadedJob } from "@/components/admin/import-export/prepareUploadedJob";

// A standalone tool, deliberately separate from the Import Wizard — it
// reuses the wizard's existing, unmodified UploadStep component (and the
// existing, unmodified POST /jobs upload endpoint) purely for file intake,
// but never enters the wizard's own step flow. Nothing here writes to the
// database beyond the one upload call every import path already makes to
// store the file — the actual analysis is entirely read-only. See
// ADMIN_CMS.md's "MrRework Migration Assistant" section.
export default function MigrationAssistantPage() {
  const [job, setJob] = useState<ImportJobClient | null>(null);
  const [report, setReport] = useState<MigrationAssistantReportClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUploaded(newJob: ImportJobClient) {
    setJob(newJob);
    setLoading(true);
    setError("");
    try {
      newJob = await prepareUploadedJob(newJob, setJob);
      const res = await fetch(`/api/admin/import-export/jobs/${newJob._id}/migration-plan`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Migration analysis failed.");
      setReport(data.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Migration analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setJob(null);
    setReport(null);
    setError("");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold">MrRework Migration Assistant</h1>
          <p className="text-[12.5px] text-stone mt-1 max-w-2xl">
            Upload your real WooCommerce export to fully understand it before importing anything — a store profile, plugin
            compatibility, field-by-field mapping, data quality, a phased migration plan, a risk assessment, and a
            per-product preview. Nothing is imported here.
          </p>
        </div>
        <Link href="/admin/tools/import-export"><Button variant="ghost" size="sm"><X size={13} /> Back to hub</Button></Link>
      </div>

      {!job && (
        <Card>
          <UploadStep type="products" onUploaded={handleUploaded} />
        </Card>
      )}

      {job && loading && (
        <Card>
          <div className="py-12 text-center">
            <p className="text-[13px]">Analyzing {job.fileName} — this can take a moment for large exports…</p>
          </div>
        </Card>
      )}

      {error && (
        <Card>
          <Banner tone="error">{error}</Banner>
          <div className="flex justify-end mt-4"><Button variant="ghost" onClick={reset}>Try another file</Button></div>
        </Card>
      )}

      {job && report && !loading && (
        <>
          <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={reset}>Analyze a different file</Button></div>
          <MigrationAssistantView report={report} jobId={job._id} />
        </>
      )}
    </div>
  );
}
