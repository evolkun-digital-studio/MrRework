"use client";
import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Card, Button, Banner } from "@/components/admin/ui";
import UploadStep from "@/components/admin/import-export/steps/UploadStep";
import OrderMigrationAssistantView from "@/components/admin/import-export/OrderMigrationAssistantView";
import type { ImportJobClient, OrderMigrationAssistantReportClient, OrderPreviewResultClient } from "@/components/admin/import-export/types";
import { prepareUploadedJob } from "@/components/admin/import-export/prepareUploadedJob";

// The order counterpart of customer-migration-assistant/page.tsx — same
// pattern: a standalone tool, separate from the Import Wizard, reusing the
// wizard's existing UploadStep and upload endpoint purely for file intake.
// Entirely read-only past that one upload call — both the plan and the
// preview list are computed once up front so the view below is a pure
// renderer, not a component that fetches its own data mid-render.
export default function OrderMigrationAssistantPage() {
  const [job, setJob] = useState<ImportJobClient | null>(null);
  const [report, setReport] = useState<OrderMigrationAssistantReportClient | null>(null);
  const [preview, setPreview] = useState<OrderPreviewResultClient | null>(null);
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
        fetch(`/api/admin/import-export/jobs/${newJob._id}/preview-order`, { method: "POST" }),
      ]);
      const planData = await planRes.json();
      if (!planRes.ok) throw new Error(planData.error || "Migration analysis failed.");
      const previewData = await previewRes.json();
      if (!previewRes.ok) throw new Error(previewData.error || "Order preview failed.");
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
          <h1 className="text-[20px] font-semibold">Order Migration Assistant</h1>
          <p className="text-[12.5px] text-stone mt-1 max-w-2xl">
            Upload your real WooCommerce order SQL export to fully understand it before importing anything — an
            overview, risk analysis, revenue/status/payment breakdowns, a timeline, per-order before/after preview,
            duplicate/missing-product/missing-customer detection, a migration plan, and a readiness summary. Nothing
            is imported here.
          </p>
        </div>
        <Link href="/admin/tools/import-export"><Button variant="ghost" size="sm"><X size={13} /> Back to hub</Button></Link>
      </div>

      {!job && (
        <Card>
          <UploadStep type="orders" acceptedExtensions={[".sql"]} onUploaded={handleUploaded} />
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
          <OrderMigrationAssistantView report={report} preview={preview} />
        </>
      )}
    </div>
  );
}
