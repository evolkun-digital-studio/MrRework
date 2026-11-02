"use client";
import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Card, Button, Banner } from "@/components/admin/ui";
import UploadStep from "@/components/admin/import-export/steps/UploadStep";
import ContentMigrationAssistantView from "@/components/admin/import-export/ContentMigrationAssistantView";
import type { ImportJobClient, ContentMigrationAssistantReportClient, UnifiedContentPreviewResultClient } from "@/components/admin/import-export/types";
import { prepareUploadedJob } from "@/components/admin/import-export/prepareUploadedJob";

// The Content & SEO counterpart of order-migration-assistant/page.tsx —
// same pattern: a standalone tool, separate from the Import Wizard, reusing
// the wizard's existing UploadStep and upload endpoint purely for file
// intake. Uploads against `type=content` (a real, "available" registry
// entry with no importRow of its own — see registry.ts) — entirely
// read-only, composing the Blog Posts + Pages importers' own analyzers/
// mappers from this one file. Actually importing anything happens via the
// separate Blog Posts / Pages wizard runs, not here.
export default function ContentMigrationAssistantPage() {
  const [job, setJob] = useState<ImportJobClient | null>(null);
  const [report, setReport] = useState<ContentMigrationAssistantReportClient | null>(null);
  const [preview, setPreview] = useState<UnifiedContentPreviewResultClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUploaded(newJob: ImportJobClient) {
    setJob(newJob);
    setLoading(true);
    setError("");
    try {
      newJob = await prepareUploadedJob(newJob, setJob);
      const [planRes, previewRes] = await Promise.all([
        fetch(`/api/admin/import-export/jobs/${newJob._id}/migration-plan`, { method: "POST" }),
        fetch(`/api/admin/import-export/jobs/${newJob._id}/preview-content`, { method: "POST" }),
      ]);
      const planData = await planRes.json();
      if (!planRes.ok) throw new Error(planData.error || "Migration analysis failed.");
      const previewData = await previewRes.json();
      if (!previewRes.ok) throw new Error(previewData.error || "Content preview failed.");
      setReport(planData.report);
      setPreview(previewData.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Migration analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setJob(null);
    setReport(null);
    setPreview(null);
    setError("");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold">Content & SEO Migration Assistant</h1>
          <p className="text-[12.5px] text-stone mt-1 max-w-2xl">
            Upload your real WordPress SQL export to fully understand your blog posts, pages, SEO metadata, and
            future redirects before importing anything — overview, risk analysis, SEO coverage, redirect summary,
            media summary, a per-item before/after preview, and a readiness summary. Nothing is imported here — run
            the Blog Posts and Pages importers separately to actually write data.
          </p>
        </div>
        <Link href="/admin/tools/import-export"><Button variant="ghost" size="sm"><X size={13} /> Back to hub</Button></Link>
      </div>

      {!job && (
        <Card>
          <UploadStep type="content" acceptedExtensions={[".sql"]} onUploaded={handleUploaded} />
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

      {job && report && preview && !loading && (
        <>
          <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={reset}>Analyze a different file</Button></div>
          <ContentMigrationAssistantView report={report} preview={preview} />
        </>
      )}
    </div>
  );
}
