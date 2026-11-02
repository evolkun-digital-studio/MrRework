"use client";
import { Card, StatCard, Table, Th, Td, Badge } from "@/components/admin/ui";
import type { ReviewAnalysisReportClient } from "./types";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
const SCORE_TONE = (label: string): Tone => (label === "Ready to Import" ? "success" : label === "Needs Review" ? "warning" : "danger");

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <Card title={title} description={description}>{children}</Card>;
}

// The Reviews counterpart of CustomerAnalysisReportView.tsx — renders
// wooReviewSqlAnalyzer.ts's own ReviewAnalysisReport shape (rating
// distribution, verified-purchase count, approval breakdown) rather than
// forcing it through the Products-specific AnalysisReportView.
export default function ReviewAnalysisReportView({ report }: { report: ReviewAnalysisReportClient }) {
  const { general, quality, unsupportedMetaKeys, databaseImpact, summary } = report;

  return (
    <div className="space-y-5">
      <SectionCard title="Migration Readiness" description={report.fileName}>
        <div className="flex items-center gap-4 mb-4">
          <Badge tone={SCORE_TONE(summary.label)}>{summary.label}</Badge>
          <span className="text-[13px] text-stone">Score: {summary.score}/100</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Reviews" value={general.totalReviews} />
          <StatCard label="Guest Reviews" value={general.guestReviews} />
          <StatCard label="Registered Customer Reviews" value={general.registeredCustomerReviews} />
          <StatCard label="Verified Purchases" value={general.verifiedPurchaseCount} />
          <StatCard label="With Admin Reply" value={general.withAdminReply} />
          <StatCard label="To Create" value={databaseImpact.reviewsToCreate} />
          <StatCard label="To Update" value={databaseImpact.reviewsToUpdate} />
          <StatCard label="Matched Products" value={databaseImpact.matchedProducts} />
        </div>
      </SectionCard>

      {databaseImpact.protectedReviewsMatched > 0 && (
        <SectionCard title="Protected Reviews">
          <p className="text-[13px] text-stone">
            {databaseImpact.protectedReviewsMatched} matched review(s) already have an admin reply, are featured, or have a manually-overridden status.
            Only rating/text/dates stay eligible for correction — moderation state is never touched on an existing review. See ADMIN_CMS.md § Review Migration Security.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Rating Distribution">
        <Table>
          <thead><tr><Th>Rating</Th><Th>Count</Th></tr></thead>
          <tbody>
            {general.ratingDistribution.map((r) => (
              <tr key={r.rating}><Td>{"★".repeat(r.rating)}</Td><Td className="font-mono">{r.count}</Td></tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      <SectionCard title="Approval Status Breakdown">
        <Table>
          <thead><tr><Th>WooCommerce Status</Th><Th>App Status</Th><Th>Count</Th></tr></thead>
          <tbody>
            {general.approvalBreakdown.map((a, i) => (
              <tr key={i}>
                <Td className="font-mono text-[11.5px]">{a.wooStatus}</Td>
                <Td className="capitalize">{a.status}</Td>
                <Td className="font-mono">{a.count}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      <SectionCard
        title="Data Quality"
        description={quality.unratedProductComments > 0 || quality.trashedComments > 0
          ? `${quality.unratedProductComments + quality.trashedComments} comment_type="review" row(s) have no rating at all — normal WooCommerce data (a product comment, not a star review), not an error. Excluded from the review import automatically.`
          : undefined}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard label="Missing Product Reference" value={quality.missingProductReference} />
          <StatCard label="Invalid Ratings (malformed)" value={quality.invalidRatings} />
          <StatCard label="Unrated Product Comments" value={quality.unratedProductComments} sub="Not a review — skipped" />
          <StatCard label="Trashed (unrated)" value={quality.trashedComments} sub="Not a review — skipped" />
          <StatCard label="Duplicate Review IDs" value={quality.duplicateReviewIdsInFile} />
          <StatCard label="Duplicate Reviewer/Product" value={quality.duplicateReviewerProductCombos} />
          <StatCard label="Missing Review Text" value={quality.missingReviewText} />
          <StatCard label="Spam Comments" value={quality.spamComments} />
          <StatCard label="Non-Product Comments" value={quality.nonProductComments} />
          <StatCard label="Broken Product References" value={quality.brokenProductReferences} />
          <StatCard label="Unrecognized Status" value={quality.unrecognizedStatus} />
        </div>
        {quality.issues.length > 0 && (
          <Table>
            <thead><tr><Th>Row</Th><Th>Source ID</Th><Th>Issue</Th><Th>Level</Th></tr></thead>
            <tbody>
              {quality.issues.slice(0, 50).map((i, idx) => (
                <tr key={idx}>
                  <Td className="font-mono">{i.row}</Td>
                  <Td className="max-w-[160px] truncate">{i.sourceId}</Td>
                  <Td>{i.message}</Td>
                  <Td><Badge tone={i.level === "error" ? "danger" : "warning"}>{i.level}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {quality.issuesTruncated && <p className="text-[11.5px] text-stone mt-2">Showing the first 300 issues found.</p>}
      </SectionCard>

      {unsupportedMetaKeys.length > 0 && (
        <SectionCard title="Unsupported Meta Keys" description="Comment meta keys found in the file that aren't mapped to any field — nothing is silently lost, just not imported.">
          <Table>
            <thead><tr><Th>Meta Key</Th><Th>Reviews</Th></tr></thead>
            <tbody>
              {unsupportedMetaKeys.map((m) => (
                <tr key={m.key}><Td className="font-mono text-[11.5px]">{m.key}</Td><Td className="font-mono">{m.reviewCount}</Td></tr>
              ))}
            </tbody>
          </Table>
        </SectionCard>
      )}
    </div>
  );
}
