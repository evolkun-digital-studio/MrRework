"use client";
import { useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Card, StatCard, Select, Button, Badge } from "@/components/admin/ui";
import type { AnalysisReportClient, MigrationAssistantReportClient } from "./types";

// The literal implementation of "If Migration Risk is HIGH, do NOT allow
// migration — require explicit confirmation." Reads risk.level from the
// already-computed Migration Assistant report; adds no new risk logic of
// its own.
export default function MigrationApprovalCard({
  analysisReport, migrationReport, duplicateStrategy, onDuplicateStrategyChange, onApprove, approving,
}: {
  analysisReport: AnalysisReportClient;
  migrationReport: MigrationAssistantReportClient;
  duplicateStrategy: "update" | "skip";
  onDuplicateStrategyChange: (v: "update" | "skip") => void;
  onApprove: (riskOverridden: boolean) => void;
  approving: boolean;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const isHighRisk = migrationReport.risk.level === "High Risk";

  return (
    <Card title="Approve Migration" description="Nothing has been written to the database yet — this is the last step before it is.">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Products to Create" value={analysisReport.databaseImpact.productsToCreate} />
        <StatCard label="Products to Update" value={analysisReport.databaseImpact.productsToUpdate} />
        <StatCard label="Categories to Create" value={analysisReport.categories.toCreate} />
        <StatCard label="Migration Risk" value={migrationReport.risk.level} />
      </div>

      <div className="max-w-xs mb-5">
        <Select
          label="If a product already exists (matched by SKU, then slug)"
          value={duplicateStrategy}
          onChange={(e) => onDuplicateStrategyChange(e.target.value as "update" | "skip")}
          options={[{ value: "update", label: "Update the existing product" }, { value: "skip", label: "Skip it" }]}
        />
      </div>

      {!isHighRisk ? (
        <div className="flex items-center justify-between gap-4 border border-line dark:border-[#332e26] rounded-brand px-4 py-3">
          <div className="flex items-center gap-2 text-[13px]">
            <ShieldCheck size={16} className="text-[#1f3d2b]" />
            <span>Risk level is <Badge tone={migrationReport.risk.level === "Low Risk" ? "success" : "warning"}>{migrationReport.risk.level}</Badge> — migration is allowed.</span>
          </div>
          <Button disabled={approving} onClick={() => onApprove(false)}>{approving ? "Starting…" : "Approve & Start Migration"}</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Not <Banner> here — Banner always renders a <p>, and this
              content includes <div>/<ul>, which are invalid inside <p>
              (a real hydration error, not a styling choice) — so this
              copies Banner's "error" tone styling onto a plain <div>. */}
          <div role="alert" className="text-[13px] rounded-brand px-4 py-3 border border-[#4a1414] text-[#4a1414] dark:text-[#e08585] bg-[#4a1414]/5">
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">Migration blocked — High Risk detected</div>
                <ul className="mt-1.5 space-y-1 list-disc list-inside">
                  {migrationReport.risk.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
                </ul>
              </div>
            </div>
          </div>
          <label className="flex items-start gap-2.5 text-[13px] cursor-pointer">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5" />
            I have reviewed the risks above and want to proceed anyway.
          </label>
          <div className="flex justify-end">
            <Button variant="danger" disabled={!acknowledged || approving} onClick={() => onApprove(true)}>
              {approving ? "Starting…" : "Override & Start Migration Anyway"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
