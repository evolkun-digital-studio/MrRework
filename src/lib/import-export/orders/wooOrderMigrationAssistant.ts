import { analyzeWooOrderSql, type OrderAnalysisReport } from "./wooOrderSqlAnalyzer";

// The order counterpart of customers/wooCustomerMigrationAssistant.ts — same
// relationship: composes the Compatibility Analyzer's report (never
// re-scans the file itself) and adds the "what's my plan" layer on top —
// risk assessment, recommendations, and a phased migration plan. Still
// entirely read-only; nothing here writes anything.

export type RiskLevel = "Low Risk" | "Medium Risk" | "High Risk";
export interface RiskAssessment { level: RiskLevel; score: number; reasons: string[] }
export interface Recommendation { priority: "high" | "medium" | "low"; message: string }
export interface MigrationPhase { phase: number; title: string; description: string; expectedCount: number; unit: string }
export interface MigrationEstimate { durationMs: number; peakMemoryBytes: number; writes: number }

export interface OrderMigrationAssistantReport {
  analysis: OrderAnalysisReport;
  risk: RiskAssessment;
  recommendations: Recommendation[];
  plan: MigrationPhase[];
  estimate: MigrationEstimate;
}

function assessRisk(a: OrderAnalysisReport): RiskAssessment {
  const reasons: string[] = [];
  const score = a.summary.score;

  if (a.quality.missingOrderNumber > 0) reasons.push(`${a.quality.missingOrderNumber} row(s) have no order number — these orders cannot be imported at all (order number is the only identity key).`);
  if (a.quality.negativeOrInvalidTotals > 0) reasons.push(`${a.quality.negativeOrInvalidTotals} order(s) have a negative or invalid total.`);
  if (a.quality.duplicateOrderNumbersInFile > 0) reasons.push(`${a.quality.duplicateOrderNumbersInFile} duplicate order number(s) within the file — the later row wins for each.`);
  if (a.databaseImpact.missingProductItems > 0) reasons.push(`${a.databaseImpact.missingProductItems} of ${a.databaseImpact.totalLineItems} line item(s) couldn't be matched to any product already in the catalog — they'll import with their original name/price preserved but no live product link.`);
  if (a.databaseImpact.missingVariationItems > 0) reasons.push(`${a.databaseImpact.missingVariationItems} line item(s) matched a product but not the specific variation ordered (size/color/attribute mismatch) — reconciling the product catalog's variants may fix this on re-import.`);
  if (a.databaseImpact.missingCustomers > 0) reasons.push(`${a.databaseImpact.missingCustomers} order(s) have no matching customer by email or WordPress ID — these will import as guest orders.`);
  if (a.databaseImpact.protectedOrdersMatched > 0) reasons.push(`${a.databaseImpact.protectedOrdersMatched} matched order(s) already have admin-managed status history — only order data will be updated, fulfillment/payment status left untouched.`);
  if (a.quality.currencyMismatch > 0) reasons.push(`${a.quality.currencyMismatch} order(s) use a currency other than the file's dominant currency (${a.general.revenue.dominantCurrency ?? "unknown"}) — double-check this store didn't sell in multiple currencies unexpectedly.`);
  if (a.quality.unrecognizedStatus > 0) reasons.push(`${a.quality.unrecognizedStatus} order(s) have an unrecognized status — defaulted to pending/pending, original value preserved.`);
  if (!reasons.length) reasons.push("No significant issues detected in this file.");

  const level: RiskLevel = score >= 90 ? "Low Risk" : score >= 70 ? "Medium Risk" : "High Risk";
  return { level, score, reasons };
}

function buildRecommendations(a: OrderAnalysisReport): Recommendation[] {
  const recs: Recommendation[] = [];
  if (a.quality.missingOrderNumber > 0 || a.quality.negativeOrInvalidTotals > 0) {
    recs.push({ priority: "high", message: "Fix rows with missing order numbers or invalid totals in the source database before re-exporting, or accept they'll be skipped." });
  }
  if (a.databaseImpact.missingProductItems > 0) {
    recs.push({ priority: "high", message: "Run the Product Migration first (or reconcile SKUs) so more line items can reconnect to a live product — unmatched items still import with their original name/price/quantity, just without a product link for inventory or storefront lookups." });
  }
  if (a.databaseImpact.missingVariationItems > 0) {
    recs.push({ priority: "medium", message: "Some matched products couldn't resolve the exact variation ordered — check that size/color (or custom attribute) values in the product catalog match the original store's naming exactly." });
  }
  if (a.databaseImpact.missingCustomers > 0 && a.general.totalOrders > 0 && a.databaseImpact.missingCustomers / a.general.totalOrders > 0.3) {
    recs.push({ priority: "medium", message: "Over 30% of orders will import as guest orders — run the Customer Migration first if this store's customers haven't been imported yet." });
  }
  if (a.unsupportedMetaKeys.length > 0) {
    recs.push({ priority: "low", message: `${a.unsupportedMetaKeys.length} order metadata key(s) found in the file aren't imported (see Unsupported Metadata) — review whether any carry data this store needs preserved.` });
  }
  if (a.databaseImpact.couponCodesUsed > 0 && a.databaseImpact.couponCodesMatched < a.databaseImpact.couponCodesUsed) {
    recs.push({ priority: "low", message: `${a.databaseImpact.couponCodesUsed - a.databaseImpact.couponCodesMatched} of ${a.databaseImpact.couponCodesUsed} coupon code(s) used on these orders don't exist in the Coupon collection — codes are preserved on the order either way, just without a live coupon link.` });
  }
  if (!recs.length) recs.push({ priority: "low", message: "This file looks ready to import as-is." });
  return recs;
}

// A transparent, documented estimate — not a measurement, same posture as
// the customer assistant's. Orders cost more per row than customers: each
// row triggers a handful of batched-but-real lookups (customer, coupons,
// and a per-order product/variant query pair) plus a larger embedded
// items[] payload, so both the throughput and per-row memory figures are
// deliberately more conservative than the customer importer's.
const ESTIMATED_ROWS_PER_SEC = 150;
const BASE_MEMORY_BYTES = 60 * 1024 * 1024;
const BYTES_PER_ROW = 8 * 1024;

function estimateMigration(a: OrderAnalysisReport): MigrationEstimate {
  const durationMs = Math.max(50, Math.round((a.totalRows / ESTIMATED_ROWS_PER_SEC) * 1000));
  const peakMemoryBytes = BASE_MEMORY_BYTES + a.totalRows * BYTES_PER_ROW;
  const writes = a.databaseImpact.ordersToCreate + a.databaseImpact.ordersToUpdate;
  return { durationMs, peakMemoryBytes, writes };
}

export async function buildOrderMigrationPlan(filePath: string, fileName: string): Promise<OrderMigrationAssistantReport> {
  const analysis = await analyzeWooOrderSql(filePath, fileName);
  const risk = assessRisk(analysis);
  const recommendations = buildRecommendations(analysis);
  const estimate = estimateMigration(analysis);

  const plan: MigrationPhase[] = [
    { phase: 1, title: "Validate", description: "Every row checked for a usable order number, valid total, and parseable fields — nothing written yet.", expectedCount: analysis.totalRows, unit: "order rows" },
    { phase: 2, title: "Create new orders", description: "Orders with no existing match by order number, with items reconnected to the live Product collection where possible.", expectedCount: analysis.databaseImpact.ordersToCreate, unit: "new orders" },
    { phase: 3, title: "Update existing orders", description: "Matched by order number — order data merged in; fulfillment/payment status are never touched on an order with admin-managed status history.", expectedCount: analysis.databaseImpact.ordersToUpdate, unit: "existing orders" },
    { phase: 4, title: "Verify", description: "Post-run reconciliation against these expected counts.", expectedCount: analysis.general.totalOrders, unit: "total orders" },
  ];

  return { analysis, risk, recommendations, plan, estimate };
}
