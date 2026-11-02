import { analyzeWooReviewSql, type ReviewAnalysisReport } from "./wooReviewSqlAnalyzer";

// The review counterpart of orders/wooOrderMigrationAssistant.ts — same
// relationship: composes the Compatibility Analyzer's report (never
// re-scans the file itself) and adds the "what's my plan" layer on top —
// risk assessment, recommendations, and a phased migration plan. Still
// entirely read-only; nothing here writes anything.

export type RiskLevel = "Low Risk" | "Medium Risk" | "High Risk";
export interface RiskAssessment { level: RiskLevel; score: number; reasons: string[] }
export interface Recommendation { priority: "high" | "medium" | "low"; message: string }
export interface MigrationPhase { phase: number; title: string; description: string; expectedCount: number; unit: string }
export interface MigrationEstimate { durationMs: number; peakMemoryBytes: number; writes: number }

export interface ReviewMigrationAssistantReport {
  analysis: ReviewAnalysisReport;
  risk: RiskAssessment;
  recommendations: Recommendation[];
  plan: MigrationPhase[];
  estimate: MigrationEstimate;
}

function assessRisk(a: ReviewAnalysisReport): RiskAssessment {
  const reasons: string[] = [];
  const score = a.summary.score;

  if (a.quality.missingProductReference > 0) reasons.push(`${a.quality.missingProductReference} review(s) have no product reference — these cannot be imported at all.`);
  if (a.quality.invalidRatings > 0) reasons.push(`${a.quality.invalidRatings} review(s) have a rating value present but out of the 1-5 range or malformed — these cannot be imported as a review.`);
  if (a.quality.unratedProductComments > 0) reasons.push(`${a.quality.unratedProductComments} comment_type="review" row(s) have no rating at all — WooCommerce doesn't require one (a plain product comment, not a star review); these are skipped from the review import, not treated as failures.`);
  if (a.quality.trashedComments > 0) reasons.push(`${a.quality.trashedComments} trashed, unrated comment_type="review" row(s) found — skipped, not imported.`);
  if (a.quality.duplicateReviewIdsInFile > 0) reasons.push(`${a.quality.duplicateReviewIdsInFile} duplicate review ID(s) within the file — the later row wins for each.`);
  if (a.databaseImpact.missingProducts > 0) reasons.push(`${a.databaseImpact.missingProducts} review(s) reference a product that couldn't be matched in the catalog by SKU, slug, or name.`);
  if (a.quality.brokenProductReferences > 0) reasons.push(`${a.quality.brokenProductReferences} review(s) reference a product post ID that doesn't exist among this file's own product posts — possibly a non-product comment misclassified as a review, or a partial export.`);
  if (a.databaseImpact.missingCustomers > 0) reasons.push(`${a.databaseImpact.missingCustomers} review(s) have no matching customer by email or WordPress ID — these will import as guest reviews.`);
  if (a.databaseImpact.protectedReviewsMatched > 0) reasons.push(`${a.databaseImpact.protectedReviewsMatched} matched review(s) already have an admin reply, are featured, or have a manually-overridden status — only rating/text/dates will be updated, moderation decisions left untouched.`);
  if (a.quality.spamComments > 0) reasons.push(`${a.quality.spamComments} review(s) are flagged as spam in the source — will import with status "rejected".`);
  if (a.quality.duplicateReviewerProductCombos > 0) reasons.push(`${a.quality.duplicateReviewerProductCombos} case(s) of the same reviewer reviewing the same product more than once — not blocked (WooCommerce allows this), just flagged.`);
  if (!reasons.length) reasons.push("No significant issues detected in this file.");

  const level: RiskLevel = score >= 90 ? "Low Risk" : score >= 70 ? "Medium Risk" : "High Risk";
  return { level, score, reasons };
}

function buildRecommendations(a: ReviewAnalysisReport): Recommendation[] {
  const recs: Recommendation[] = [];
  if (a.quality.missingProductReference > 0 || a.quality.invalidRatings > 0) {
    recs.push({ priority: "high", message: "Fix rows with missing product references or malformed rating values in the source database before re-exporting, or accept they'll be skipped." });
  }
  if (a.quality.unratedProductComments > 0 || a.quality.trashedComments > 0) {
    recs.push({ priority: "low", message: `${a.quality.unratedProductComments + a.quality.trashedComments} row(s) with comment_type="review" but no rating were found — this is normal WooCommerce data (a product comment, not a star review) and requires no action; they're excluded from the review import automatically.` });
  }
  if (a.databaseImpact.missingProducts > 0) {
    recs.push({ priority: "high", message: "Run the Product Migration first (or reconcile SKUs/slugs/names) so more reviews can reconnect to a live product — unmatched reviews still import with their original text/rating, just without a product link." });
  }
  if (a.databaseImpact.missingCustomers > 0 && a.general.totalReviews > 0 && a.databaseImpact.missingCustomers / a.general.totalReviews > 0.3) {
    recs.push({ priority: "medium", message: "Over 30% of reviews will import as guest reviews — run the Customer Migration first if this store's customers haven't been imported yet." });
  }
  if (a.general.verifiedPurchaseCount > 0) {
    recs.push({ priority: "low", message: "Run the Order Migration before this one if you want more reviews to resolve to a confirmed, order-verified purchase rather than falling back to WooCommerce's own verified flag." });
  }
  if (a.unsupportedMetaKeys.length > 0) {
    recs.push({ priority: "low", message: `${a.unsupportedMetaKeys.length} comment metadata key(s) found in the file aren't imported (see Unsupported Metadata) — review whether any carry data this store needs preserved.` });
  }
  if (!recs.length) recs.push({ priority: "low", message: "This file looks ready to import as-is." });
  return recs;
}

// A transparent, documented estimate — not a measurement, same posture as
// the order/customer assistants'. A review row is cheaper per-row than an
// order (no line-item sub-queries) but still does a handful of real lookups
// (product, customer, existing-review, order-verification), so pitched
// between the two.
const ESTIMATED_ROWS_PER_SEC = 250;
const BASE_MEMORY_BYTES = 60 * 1024 * 1024;
const BYTES_PER_ROW = 3 * 1024;

function estimateMigration(a: ReviewAnalysisReport): MigrationEstimate {
  const durationMs = Math.max(50, Math.round((a.totalRows / ESTIMATED_ROWS_PER_SEC) * 1000));
  const peakMemoryBytes = BASE_MEMORY_BYTES + a.totalRows * BYTES_PER_ROW;
  const writes = a.databaseImpact.reviewsToCreate + a.databaseImpact.reviewsToUpdate;
  return { durationMs, peakMemoryBytes, writes };
}

export async function buildReviewMigrationPlan(filePath: string, fileName: string): Promise<ReviewMigrationAssistantReport> {
  const analysis = await analyzeWooReviewSql(filePath, fileName);
  const risk = assessRisk(analysis);
  const recommendations = buildRecommendations(analysis);
  const estimate = estimateMigration(analysis);

  const plan: MigrationPhase[] = [
    { phase: 1, title: "Validate", description: "Every row checked for a usable review ID, product reference, and valid rating — nothing written yet.", expectedCount: analysis.totalRows, unit: "review rows" },
    { phase: 2, title: "Create new reviews", description: "Reviews with no existing match by review ID, linked to product/customer/order data where possible.", expectedCount: analysis.databaseImpact.reviewsToCreate, unit: "new reviews" },
    { phase: 3, title: "Update existing reviews", description: "Matched by review ID — rating/text/dates merged in; moderation state (status/admin reply/featured) is never touched on a review an admin has already acted on.", expectedCount: analysis.databaseImpact.reviewsToUpdate, unit: "existing reviews" },
    { phase: 4, title: "Verify", description: "Post-run reconciliation against these expected counts, and product rating/reviewCount resync.", expectedCount: analysis.general.totalReviews, unit: "total reviews" },
  ];

  return { analysis, risk, recommendations, plan, estimate };
}
