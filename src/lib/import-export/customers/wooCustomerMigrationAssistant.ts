import { analyzeWooCustomerSql, type CustomerAnalysisReport } from "./wooCustomerSqlAnalyzer";

// The customer counterpart of products/migrationAssistant.ts — same
// relationship: this composes the Compatibility Analyzer's report (never
// re-scans the file itself) and adds the "what's my plan" layer on top —
// risk assessment, recommendations, and a phased migration plan. Still
// entirely read-only; nothing here writes anything.

export type RiskLevel = "Low Risk" | "Medium Risk" | "High Risk";
export interface RiskAssessment { level: RiskLevel; score: number; reasons: string[] }
export interface Recommendation { priority: "high" | "medium" | "low"; message: string }
export interface MigrationPhase { phase: number; title: string; description: string; expectedCount: number; unit: string }

export interface MigrationEstimate { durationMs: number; peakMemoryBytes: number; writes: number }

export interface CustomerMigrationAssistantReport {
  analysis: CustomerAnalysisReport;
  risk: RiskAssessment;
  recommendations: Recommendation[];
  plan: MigrationPhase[];
  estimate: MigrationEstimate;
}

function assessRisk(a: CustomerAnalysisReport): RiskAssessment {
  const reasons: string[] = [];
  let score = a.summary.score;

  if (a.quality.missingEmail > 0) reasons.push(`${a.quality.missingEmail} row(s) have no email — these customers cannot be imported at all (email is the only identity key).`);
  if (a.quality.invalidEmail > 0) reasons.push(`${a.quality.invalidEmail} row(s) have a malformed email.`);
  if (a.quality.duplicateEmailsInFile > 0) reasons.push(`${a.quality.duplicateEmailsInFile} duplicate email(s) within the file — the later row wins for each.`);
  if (a.databaseImpact.protectedAccountsMatched > 0) reasons.push(`${a.databaseImpact.protectedAccountsMatched} matched account(s) already have a role other than customer or a working password — only their profile/address fields will be touched, never role or password state.`);
  if (a.general.withoutEmail > 0 && a.general.totalCustomers > 0 && a.general.withoutEmail / a.general.totalCustomers > 0.2) {
    reasons.push("More than 20% of rows have no email — double-check this is really a wp_users export and not a partial/corrupted dump.");
  }
  if (!reasons.length) reasons.push("No significant issues detected in this file.");

  const level: RiskLevel = score >= 90 ? "Low Risk" : score >= 70 ? "Medium Risk" : "High Risk";
  return { level, score, reasons };
}

function buildRecommendations(a: CustomerAnalysisReport): Recommendation[] {
  const recs: Recommendation[] = [];
  if (a.quality.missingEmail > 0 || a.quality.invalidEmail > 0) {
    recs.push({ priority: "high", message: "Fix or remove rows with missing/invalid emails in the source WordPress database before re-exporting, or accept they'll be skipped." });
  }
  if (a.databaseImpact.protectedAccountsMatched > 0) {
    recs.push({ priority: "high", message: "Review the matched admin/password-holding accounts after import — confirm none of them were meant to be a different person entirely (an email collision, not the same account)." });
  }
  if (a.general.subscribedToNewsletter === 0 && a.general.totalCustomers > 0) {
    recs.push({ priority: "low", message: "No newsletter subscribers were detected — if your store used a newsletter plugin, confirm its meta key is one of the common conventions this importer recognizes (see ADMIN_CMS.md), or subscriptions may need a manual follow-up import." });
  }
  const unimported = a.metaKeyCoverage.filter((k) => !k.imported);
  if (unimported.length > 0) {
    recs.push({ priority: "medium", message: `${unimported.length} usermeta key(s) found in the file aren't imported (see Meta Key Coverage) — review whether any carry data your store actually needs preserved.` });
  }
  if (!recs.length) recs.push({ priority: "low", message: "This file looks ready to import as-is." });
  return recs;
}

// A transparent, documented estimate — not a measurement. There's no
// historical benchmark store to draw a real figure from (unlike an
// already-completed ImportJob's own report.durationMs/peakMemoryBytes,
// which this deliberately doesn't fabricate a substitute for). Based on the
// same order of magnitude actually observed running this importer
// end-to-end during development (a few hundred rows/sec on customer-sized
// records, tens of MB of overhead) — rounded to conservative, clearly
// approximate figures rather than a false-precision number.
const ESTIMATED_ROWS_PER_SEC = 300;
const BASE_MEMORY_BYTES = 60 * 1024 * 1024; // Node/Mongoose/connection overhead, independent of row count.
const BYTES_PER_ROW = 4 * 1024; // one mapped customer + its addresses, comfortably rounded up.

function estimateMigration(a: CustomerAnalysisReport): MigrationEstimate {
  const durationMs = Math.max(50, Math.round((a.totalRows / ESTIMATED_ROWS_PER_SEC) * 1000));
  const peakMemoryBytes = BASE_MEMORY_BYTES + a.totalRows * BYTES_PER_ROW;
  const writes = a.databaseImpact.customersToCreate + a.databaseImpact.customersToUpdate;
  return { durationMs, peakMemoryBytes, writes };
}

export async function buildCustomerMigrationPlan(filePath: string, fileName: string): Promise<CustomerMigrationAssistantReport> {
  const analysis = await analyzeWooCustomerSql(filePath, fileName);
  const risk = assessRisk(analysis);
  const recommendations = buildRecommendations(analysis);
  const estimate = estimateMigration(analysis);

  const plan: MigrationPhase[] = [
    { phase: 1, title: "Validate", description: "Every row checked for a usable email and parseable fields — nothing written yet.", expectedCount: analysis.totalRows, unit: "customer rows" },
    { phase: 2, title: "Create new customers", description: "Accounts with no existing match by email.", expectedCount: analysis.databaseImpact.customersToCreate, unit: "new customers" },
    { phase: 3, title: "Update existing customers", description: "Matched by email — profile/address fields merged in; role and password state are never touched on an existing admin or password-holding account.", expectedCount: analysis.databaseImpact.customersToUpdate, unit: "existing customers" },
    { phase: 4, title: "Verify", description: "Post-run reconciliation against these expected counts.", expectedCount: analysis.general.totalCustomers, unit: "total customers" },
  ];

  return { analysis, risk, recommendations, plan, estimate };
}
