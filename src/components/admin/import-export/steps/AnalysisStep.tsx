"use client";
import { useState } from "react";
import { ScanSearch } from "lucide-react";
import { Button, Banner } from "@/components/admin/ui";
import AnalysisReportView from "../AnalysisReportView";
import CustomerAnalysisReportView from "../CustomerAnalysisReportView";
import OrderAnalysisReportView from "../OrderAnalysisReportView";
import ReviewAnalysisReportView from "../ReviewAnalysisReportView";
import ContentAnalysisReportView from "../ContentAnalysisReportView";
import type {
  AnalysisReportClient, CustomerAnalysisReportClient, OrderAnalysisReportClient,
  ReviewAnalysisReportClient, ContentAnalysisReportClient, ImportJobClient,
} from "../types";

type AnyAnalysisReport =
  | AnalysisReportClient | CustomerAnalysisReportClient | OrderAnalysisReportClient
  | ReviewAnalysisReportClient | ContentAnalysisReportClient;

// A read-only "dry run" gate: nothing here writes to MongoDB (the /analyze
// route is a pure read), and "Continue to Column Mapping" stays disabled
// until a report has been produced at least once for this file. The report
// *shape* depends on job.type — each importer's analyzer returns its own
// domain-specific fields (Products: categories/attributes/variations/risks;
// Orders: revenue/status breakdowns; Reviews: ratings/verified-purchase;
// Content: SEO coverage/redirects) rather than one forced-generic contract,
// so which view component renders it must be dispatched here by job.type,
// exactly like the customers case already did — every job.type below must
// have an entry, or it silently falls through to the Products-shaped
// AnalysisReportView and crashes on the first Products-only field it reads
// (this is exactly the bug that shipped for "orders": AnalysisReportView
// destructures `risks`, which no non-Product analyzer report has).
export default function AnalysisStep({
  job, onContinue, onBack,
}: {
  job: ImportJobClient;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [report, setReport] = useState<AnyAnalysisReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  async function analyze() {
    setAnalyzing(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/import-export/jobs/${job._id}/analyze`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed.");
      setReport(data.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div>
      <h2 className="text-[15px] font-semibold">Migration Analysis</h2>
      <p className="text-[12.5px] text-stone mt-1 mb-5">
        A read-only compatibility check — nothing is written to the database. Run this before mapping columns so you know exactly what a real import will do.
      </p>

      {error && <Banner tone="error">{error}</Banner>}

      {!report && (
        <div className="border border-dashed border-line dark:border-[#332e26] rounded-brand py-12 text-center">
          <ScanSearch size={26} className="mx-auto text-stone" />
          <p className="text-[13px] mt-3">{analyzing ? "Analyzing the file — this can take a moment for large exports…" : "No analysis has been run yet."}</p>
          <Button className="mt-4" disabled={analyzing} onClick={analyze}>{analyzing ? "Analyzing…" : "Analyze CSV"}</Button>
        </div>
      )}

      {report && (
        <>
          <div className="flex justify-end mb-4">
            <Button variant="ghost" size="sm" disabled={analyzing} onClick={analyze}>{analyzing ? "Re-analyzing…" : "Re-analyze"}</Button>
          </div>
          {job.type === "customers" ? (
            <CustomerAnalysisReportView report={report as CustomerAnalysisReportClient} />
          ) : job.type === "orders" ? (
            <OrderAnalysisReportView report={report as OrderAnalysisReportClient} />
          ) : job.type === "reviews" ? (
            <ReviewAnalysisReportView report={report as ReviewAnalysisReportClient} />
          ) : job.type === "blog" || job.type === "pages" ? (
            <ContentAnalysisReportView report={report as ContentAnalysisReportClient} />
          ) : (
            <AnalysisReportView report={report as AnalysisReportClient} />
          )}
        </>
      )}

      <div className="flex justify-between mt-6">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button disabled={!report} onClick={onContinue}>
          {report ? "Continue to Column Mapping" : "Analyze CSV to continue"}
        </Button>
      </div>
    </div>
  );
}
