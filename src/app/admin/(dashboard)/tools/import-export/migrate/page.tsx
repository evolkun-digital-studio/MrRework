"use client";
import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Card, Button, Banner } from "@/components/admin/ui";
import UploadStep from "@/components/admin/import-export/steps/UploadStep";
import RunStep from "@/components/admin/import-export/steps/RunStep";
import ReportStep from "@/components/admin/import-export/steps/ReportStep";
import AnalysisReportView from "@/components/admin/import-export/AnalysisReportView";
import MigrationAssistantView from "@/components/admin/import-export/MigrationAssistantView";
import MigrationApprovalCard from "@/components/admin/import-export/MigrationApprovalCard";
import VerificationReportCard from "@/components/admin/import-export/VerificationReportCard";
import { prepareUploadedJob } from "@/components/admin/import-export/prepareUploadedJob";
import type {
  ImportJobClient, AnalysisReportClient, MigrationAssistantReportClient, MigrationCheckpointClient,
} from "@/components/admin/import-export/types";

type Phase = "upload" | "analyzing" | "ready" | "running" | "finalizing" | "done";

// The production migration workflow — pure orchestration of already-built,
// already-verified pieces (see ADMIN_CMS.md's "Product Migration Workflow"
// section for the full reuse map). Nothing in this file re-implements
// analysis, validation, or import logic; it only sequences existing routes
// and renders existing components, plus the new pre-write checkpoint and
// post-run verification that make this a safe, auditable production flow
// rather than just "the wizard with extra steps."
export default function MigratePage() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [job, setJob] = useState<ImportJobClient | null>(null);
  const [analysisReport, setAnalysisReport] = useState<AnalysisReportClient | null>(null);
  const [migrationReport, setMigrationReport] = useState<MigrationAssistantReportClient | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState<"update" | "skip">("update");
  const [checkpoint, setCheckpoint] = useState<MigrationCheckpointClient | null>(null);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");

  async function handleUploaded(newJob: ImportJobClient) {
    setJob(newJob);
    setPhase("analyzing");
    setError("");
    try {
      newJob = await prepareUploadedJob(newJob, setJob);
      const [analyzeRes, planRes] = await Promise.all([
        fetch(`/api/admin/import-export/jobs/${newJob._id}/analyze`, { method: "POST" }),
        fetch(`/api/admin/import-export/jobs/${newJob._id}/migration-plan`, { method: "POST" }),
      ]);
      const analyzeData = await analyzeRes.json();
      const planData = await planRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeData.error || "Compatibility analysis failed.");
      if (!planRes.ok) throw new Error(planData.error || "Migration assessment failed.");
      setAnalysisReport(analyzeData.report);
      setMigrationReport(planData.report);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
      setPhase("upload");
    }
  }

  async function handleApprove(riskOverridden: boolean) {
    if (!job || !analysisReport || !migrationReport) return;
    setApproving(true);
    setError("");
    try {
      const mapRes = await fetch(`/api/admin/import-export/jobs/${job._id}/mapping`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping: job.columnMapping, duplicateStrategy }),
      });
      const mapData = await mapRes.json();
      if (!mapRes.ok) throw new Error(mapData.error || "Could not save configuration.");

      const validateRes = await fetch(`/api/admin/import-export/jobs/${job._id}/validate`, { method: "POST" });
      const validateData = await validateRes.json();
      if (!validateRes.ok) throw new Error(validateData.error || "Validation failed.");

      const checkpointRes = await fetch("/api/admin/import-export/checkpoints", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job._id, duplicateStrategy, riskOverridden,
          expectedProducts: analysisReport.databaseImpact.productsToCreate + analysisReport.databaseImpact.productsToUpdate,
          expectedCategoriesCreated: analysisReport.categories.toCreate,
          // Only variation rows that can actually attach to a real parent —
          // orphans and rows missing a Parent SKU never will, by design.
          expectedVariations: Math.max(
            0,
            analysisReport.variations.variationRows - analysisReport.variations.orphanVariations - analysisReport.variations.productsMissingParentColumn
          ),
          expectedImages: analysisReport.images.totalImageReferences,
          riskLevel: migrationReport.risk.level, riskScore: migrationReport.risk.score,
          unsupportedFields: analysisReport.unsupported,
        }),
      });
      const checkpointData = await checkpointRes.json();
      if (!checkpointRes.ok) throw new Error(checkpointData.error || "Could not create migration checkpoint.");
      setCheckpoint(checkpointData.checkpoint);

      // Same fire-and-forget trigger the wizard's own Run step uses — the
      // checkpoint above already exists, so this is the first and only
      // request in this flow that writes to Product/Category.
      await fetch(`/api/admin/import-export/jobs/${job._id}/run`, { method: "POST" });
      setPhase("running");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the migration.");
    } finally {
      setApproving(false);
    }
  }

  async function handleRunDone(finishedJob: ImportJobClient) {
    setJob(finishedJob);
    setPhase("finalizing");
    if (!checkpoint) return;
    try {
      const res = await fetch(`/api/admin/import-export/checkpoints/${checkpoint._id}/finalize`, { method: "POST" });
      const data = await res.json();
      if (res.ok) setCheckpoint(data.checkpoint);
    } finally {
      setPhase("done");
    }
  }

  function reset() {
    setPhase("upload");
    setJob(null);
    setAnalysisReport(null);
    setMigrationReport(null);
    setCheckpoint(null);
    setError("");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold">Product Migration</h1>
          <p className="text-[12.5px] text-stone mt-1 max-w-2xl">
            Upload → Compatibility Analysis → Migration Assistant → Approve → Migration → Verification. Nothing is
            written to the database until you explicitly approve.
          </p>
        </div>
        <Link href="/admin/tools/import-export"><Button variant="ghost" size="sm"><X size={13} /> Back to hub</Button></Link>
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      {phase === "upload" && (
        <Card><UploadStep type="products" onUploaded={handleUploaded} /></Card>
      )}

      {phase === "analyzing" && job && (
        <Card>
          <div className="py-12 text-center">
            <p className="text-[13px]">Running compatibility analysis and migration assessment on {job.fileName}…</p>
          </div>
        </Card>
      )}

      {(phase === "ready" || phase === "running" || phase === "finalizing" || phase === "done") && analysisReport && migrationReport && job && (
        <>
          <AnalysisReportView report={analysisReport} />
          <MigrationAssistantView report={migrationReport} jobId={job._id} />

          {phase === "ready" && (
            <MigrationApprovalCard
              analysisReport={analysisReport}
              migrationReport={migrationReport}
              duplicateStrategy={duplicateStrategy}
              onDuplicateStrategyChange={setDuplicateStrategy}
              onApprove={handleApprove}
              approving={approving}
            />
          )}

          {(phase === "running" || phase === "finalizing") && (
            <Card>
              <RunStep job={job} onDone={handleRunDone} />
              {phase === "finalizing" && <p className="text-[12.5px] text-stone mt-3">Migration finished — running post-migration verification…</p>}
            </Card>
          )}

          {phase === "done" && (
            <>
              <Card><ReportStep job={job} onImportAnother={reset} /></Card>
              {checkpoint?.postMigration && <VerificationReportCard checkpoint={checkpoint} />}
            </>
          )}
        </>
      )}
    </div>
  );
}
