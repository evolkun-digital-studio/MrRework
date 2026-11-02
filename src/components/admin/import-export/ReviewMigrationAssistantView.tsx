"use client";
import { useMemo, useState } from "react";
import { Card, StatCard, Table, Th, Td, Badge, Input } from "@/components/admin/ui";
import ReviewPreviewCard from "./ReviewPreviewCard";
import type { ReviewMigrationAssistantReportClient, ReviewPreviewResultClient } from "./types";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
const RISK_TONE: Record<string, Tone> = { "Low Risk": "success", "Medium Risk": "warning", "High Risk": "danger" };
const PRIORITY_TONE: Record<string, Tone> = { high: "danger", medium: "warning", low: "neutral" };
const SCORE_TONE = (label: string): Tone => (label === "Ready to Import" ? "success" : label === "Needs Review" ? "warning" : "danger");

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <Card title={title} description={description}>{children}</Card>;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
function fmtBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ReviewMigrationAssistantView({
  report, preview,
}: {
  report: ReviewMigrationAssistantReportClient;
  preview: ReviewPreviewResultClient;
}) {
  const { analysis, risk, recommendations, plan, estimate } = report;
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q ? preview.rows.filter((r) => r.after.author.toLowerCase().includes(q) || r.after.email.toLowerCase().includes(q)) : preview.rows;
    return showAll ? rows : rows.slice(0, 20);
  }, [preview.rows, search, showAll]);

  const duplicateRows = useMemo(() => preview.rows.filter((r) => r.existsInDb || r.isDuplicateInFile), [preview.rows]);
  const missingProductRows = useMemo(() => preview.rows.filter((r) => !r.after.productId), [preview.rows]);
  const missingCustomerRows = useMemo(() => preview.rows.filter((r) => r.after.isGuestReview), [preview.rows]);
  const verifiedCount = useMemo(() => preview.rows.filter((r) => r.after.verified).length, [preview.rows]);

  return (
    <div className="space-y-5">
      {/* Risk */}
      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-stone">Migration Risk</div>
            <div className="mt-1.5"><Badge tone={RISK_TONE[risk.level] ?? "neutral"}>{risk.level}</Badge> <span className="text-stone text-[12.5px] ml-2">score {risk.score}%</span></div>
          </div>
        </div>
        <ul className="mt-3 space-y-1 text-[12.5px] text-stone list-disc list-inside">
          {risk.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
        </ul>
      </Card>

      {/* Overview */}
      <SectionCard title="Overview" description={analysis.fileName}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Reviews" value={analysis.general.totalReviews} />
          <StatCard label="Reviews to Create" value={analysis.databaseImpact.reviewsToCreate} />
          <StatCard label="Reviews to Update" value={analysis.databaseImpact.reviewsToUpdate} />
          <StatCard label="Guest Reviews" value={analysis.general.guestReviews} />
          <StatCard label="With Admin Reply" value={analysis.general.withAdminReply} />
          <StatCard label="Verified Purchases" value={analysis.general.verifiedPurchaseCount} />
          <StatCard label="Duplicate Reviews" value={analysis.quality.duplicateReviewIdsInFile} />
          <StatCard label="Invalid Records" value={analysis.quality.missingProductReference + analysis.quality.invalidRatings} />
        </div>
      </SectionCard>

      {/* Verified Purchase Summary */}
      <SectionCard title="Verified Purchase Summary" description="verifiedPurchase is only set true when an imported Order confirms the purchase — otherwise WooCommerce's own flag is preserved as-is.">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Verified (this preview)" value={verifiedCount} sub={`of ${preview.rows.length} shown`} />
          <StatCard label="Order-Confirmed" value={preview.rows.filter((r) => r.after.verifiedSource === "order-confirmed").length} />
          <StatCard label="Source Flag Trusted" value={preview.rows.filter((r) => r.after.verifiedSource === "source-flag").length} />
        </div>
      </SectionCard>

      {/* Rating Distribution */}
      <SectionCard title="Rating Distribution">
        <div className="flex flex-wrap gap-2">
          {analysis.general.ratingDistribution.map((r) => (
            <Badge key={r.rating} tone="neutral">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}: {r.count}</Badge>
          ))}
        </div>
      </SectionCard>

      {/* Approval Status Breakdown */}
      <SectionCard title="Approval Status Breakdown" description="Every raw WordPress comment_approved value found in the file, mapped to this app's Review.status.">
        <Table>
          <thead><tr><Th>WordPress Status</Th><Th>Mapped Status</Th><Th>Count</Th></tr></thead>
          <tbody>
            {analysis.general.approvalBreakdown.map((s) => (
              <tr key={s.wooStatus}>
                <Td className="font-mono">{s.wooStatus || "(none)"}</Td>
                <Td>{s.status}</Td>
                <Td className="font-mono">{s.count}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      {/* Migration Timeline */}
      <SectionCard title="Migration Timeline" description="Reviews by month, from each review's created date.">
        {analysis.general.timeline.length === 0 ? (
          <p className="text-[13px] text-stone">No parseable review dates found in this file.</p>
        ) : (
          <Table>
            <thead><tr><Th>Period</Th><Th>Reviews</Th></tr></thead>
            <tbody>
              {analysis.general.timeline.map((t) => (
                <tr key={t.period}><Td className="font-mono">{t.period}</Td><Td className="font-mono">{t.count}</Td></tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <SectionCard title="Recommendations">
          <div className="space-y-2">
            {recommendations.map((rec, i) => (
              <div key={i} className="flex items-center gap-2.5 text-[13px]">
                <Badge tone={PRIORITY_TONE[rec.priority]}>{rec.priority}</Badge>
                {rec.message}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Warnings */}
      <SectionCard title="Warnings" description="Aggregated data-quality issues across every review row in this file.">
        <div className="flex flex-wrap gap-2">
          <Badge tone="warning">Missing product reference: {analysis.quality.missingProductReference}</Badge>
          <Badge tone="warning">Invalid ratings: {analysis.quality.invalidRatings}</Badge>
          <Badge tone="warning">Missing review text: {analysis.quality.missingReviewText}</Badge>
          <Badge tone="warning">Spam comments: {analysis.quality.spamComments}</Badge>
          <Badge tone="warning">Non-product comments: {analysis.quality.nonProductComments}</Badge>
          <Badge tone="warning">Broken product references: {analysis.quality.brokenProductReferences}</Badge>
          <Badge tone="warning">Unrecognized status: {analysis.quality.unrecognizedStatus}</Badge>
          <Badge tone="warning">Duplicate reviewer/product combos: {analysis.quality.duplicateReviewerProductCombos}</Badge>
        </div>
        {analysis.unsupportedMetaKeys.length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-wide text-stone mb-1.5">Unsupported Metadata</div>
            <div className="flex flex-wrap gap-2">
              {analysis.unsupportedMetaKeys.slice(0, 40).map((k) => <Badge key={k.key} tone="neutral">{k.key}: {k.reviewCount}</Badge>)}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Migration Timeline (plan) */}
      <SectionCard title="Migration Plan" description="A phased, step-by-step timeline derived from this file's actual contents.">
        <div className="space-y-3">
          {plan.map((p) => (
            <div key={p.phase} className="flex items-start justify-between gap-4 border border-line dark:border-[#332e26] rounded-brand px-4 py-3">
              <div>
                <div className="text-[13px] font-semibold">Phase {p.phase} — {p.title}</div>
                <div className="text-[12px] text-stone mt-0.5">{p.description}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-[18px]">{p.expectedCount}</div>
                <div className="text-[11px] text-stone">{p.unit}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Verification Preview */}
      <SectionCard title="Verification Preview" description={'Expected outcome of a real run, assuming the default "update" duplicate strategy.'}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Imported" value={analysis.databaseImpact.reviewsToCreate} />
          <StatCard label="Updated" value={analysis.databaseImpact.reviewsToUpdate} />
          <StatCard label="Skipped" value={0} sub='0 unless "skip" strategy is chosen' />
          <StatCard label="Failed" value={analysis.quality.missingProductReference + analysis.quality.invalidRatings} sub="Missing product ref / invalid rating" />
        </div>
      </SectionCard>

      {/* Broken Product Links */}
      <SectionCard title="Broken Product Links" description="Reviews whose product couldn't be matched in the catalog by SKU, slug, or name.">
        {missingProductRows.length === 0 ? (
          <p className="text-[13px] text-stone">Every review in this file matched a product.</p>
        ) : (
          <div className="space-y-3">
            {missingProductRows.slice(0, 30).map((row) => <ReviewPreviewCard key={row.row} row={row} />)}
          </div>
        )}
        {missingProductRows.length > 30 && <p className="text-[11.5px] text-stone mt-2">Showing the first 30 of {missingProductRows.length} unmatched.</p>}
      </SectionCard>

      {/* Broken Customer Links */}
      <SectionCard title="Broken Customer Links" description="Reviews with no matching customer by email or WordPress ID — these will import as guest reviews.">
        {missingCustomerRows.length === 0 ? (
          <p className="text-[13px] text-stone">Every review in this file matched an existing customer.</p>
        ) : (
          <div className="space-y-3">
            {missingCustomerRows.slice(0, 30).map((row) => <ReviewPreviewCard key={row.row} row={row} />)}
          </div>
        )}
        {missingCustomerRows.length > 30 && <p className="text-[11.5px] text-stone mt-2">Showing the first 30 of {missingCustomerRows.length} guest reviews.</p>}
      </SectionCard>

      {/* Duplicate Reviews */}
      <SectionCard title="Duplicate Reviews" description="Every incoming review that matches an existing review by ID, or shares an ID with another row in this file.">
        {duplicateRows.length === 0 ? (
          <p className="text-[13px] text-stone">No duplicates or existing matches found.</p>
        ) : (
          <div className="space-y-3">
            {duplicateRows.slice(0, 30).map((row) => <ReviewPreviewCard key={row.row} row={row} />)}
          </div>
        )}
        {duplicateRows.length > 30 && <p className="text-[11.5px] text-stone mt-2">Showing the first 30 of {duplicateRows.length} matches.</p>}
      </SectionCard>

      {/* Review Preview */}
      <SectionCard title="Review Preview" description="Before → after for every review in this file — no database write.">
        <div className="flex items-center gap-3 mb-4">
          <Input placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <span className="text-[11.5px] text-stone">{filteredRows.length} of {preview.rows.length} shown{preview.truncated ? ` (file has ${preview.totalRows} total — preview capped at ${preview.rows.length})` : ""}</span>
        </div>
        <div className="space-y-3">
          {filteredRows.map((row) => <ReviewPreviewCard key={row.row} row={row} />)}
        </div>
        {!showAll && preview.rows.length > 20 && !search && (
          <button type="button" onClick={() => setShowAll(true)} className="mt-4 text-[12px] uppercase tracking-wide underline">
            Show all {preview.rows.length} reviews
          </button>
        )}
      </SectionCard>

      {/* Summary */}
      <SectionCard title="Summary">
        <div className="flex items-center gap-3 mb-4">
          <Badge tone={SCORE_TONE(analysis.summary.label)}>{analysis.summary.label}</Badge>
          <span className="text-[13px] text-stone">Readiness score: {analysis.summary.score}/100</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Estimated Duration" value={fmtMs(estimate.durationMs)} sub="Estimate — not a measurement" />
          <StatCard label="Estimated Peak Memory" value={fmtBytes(estimate.peakMemoryBytes)} sub="Estimate — not a measurement" />
          <StatCard label="Estimated Writes" value={estimate.writes} sub="One document write per review" />
        </div>
      </SectionCard>
    </div>
  );
}
