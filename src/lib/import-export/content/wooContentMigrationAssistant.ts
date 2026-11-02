import { analyzeWooBlogSql, analyzeWooPageSql, type ContentAnalysisReport } from "./wooContentSqlAnalyzer";

// The unified Content & SEO Migration Assistant — composes the Blog and
// Pages Compatibility Analyzers (never re-implementing either) into one
// report spanning both, from a single uploaded file. Mirrors the MrRework
// (product) Migration Assistant's own pattern of composing multiple
// analytical facets from one file into one cohesive consultation — just
// extended here to compose across *two* underlying importers/analyzers
// instead of layering more analysis onto a single one. Still entirely
// read-only; nothing here writes anything, and nothing here can even be
// *run* as an import (the "content" registry entry has no importRow) — the
// real writes happen via the separate Blog Posts / Pages wizard runs.

export type RiskLevel = "Low Risk" | "Medium Risk" | "High Risk";
export interface RiskAssessment { level: RiskLevel; score: number; reasons: string[] }
export interface Recommendation { priority: "high" | "medium" | "low"; message: string }
export interface MigrationPhase { phase: number; title: string; description: string; expectedCount: number; unit: string }
export interface MigrationEstimate { durationMs: number; peakMemoryBytes: number; writes: number }

export interface SeoCoverage {
  totalItems: number;
  withSeoTitle: number;
  withSeoDescription: number;
  withOpenGraph: number;
  withTwitterCard: number;
  withSchema: number;
  withFocusKeyword: number;
  bySource: { source: string; count: number }[];
}

export interface RedirectSummary {
  totalRedirects: number;
  byType: { type: string; count: number }[];
  duplicates: number;
}

export interface MediaSummary {
  totalFeaturedImages: number;
  matched: number;
  broken: number;
  missing: number;
}

export interface ContentSummary {
  totalBlogPosts: number;
  totalPages: number;
  publishedBlogPosts: number;
  publishedPages: number;
  withCategories: number;
  withTags: number;
}

export interface ContentMigrationAssistantReport {
  fileName: string;
  analyzedAt: string;
  blog: ContentAnalysisReport;
  pages: ContentAnalysisReport;
  risk: RiskAssessment;
  recommendations: Recommendation[];
  seoCoverage: SeoCoverage;
  redirectSummary: RedirectSummary;
  mediaSummary: MediaSummary;
  contentSummary: ContentSummary;
  plan: MigrationPhase[];
  verificationPreview: { imported: number; updated: number; skipped: number; failed: number };
  estimate: MigrationEstimate;
  summary: { score: number; label: "Ready to Import" | "Needs Review" | "High Risk" };
}

function combineSeoCoverage(blog: ContentAnalysisReport, pages: ContentAnalysisReport): SeoCoverage {
  const totalItems = blog.general.totalItems + pages.general.totalItems;
  const missingMetadata = blog.quality.missingMetadata + pages.quality.missingMetadata;
  const bySourceMap = new Map<string, number>();
  for (const r of [...blog.general.seoSourceBreakdown, ...pages.general.seoSourceBreakdown]) {
    bySourceMap.set(r.source, (bySourceMap.get(r.source) ?? 0) + r.count);
  }
  return {
    totalItems,
    // missingMetadata means "no title AND no description" — items with at
    // least one of the two count as having coverage for this rollup.
    withSeoTitle: totalItems - missingMetadata,
    withSeoDescription: totalItems - missingMetadata,
    withOpenGraph: blog.general.withOpenGraph + pages.general.withOpenGraph,
    withTwitterCard: blog.general.withTwitterCard + pages.general.withTwitterCard,
    withSchema: blog.general.withSchema + pages.general.withSchema,
    withFocusKeyword: blog.general.withFocusKeyword + pages.general.withFocusKeyword,
    bySource: [...bySourceMap.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
  };
}

function combineRedirectSummary(blog: ContentAnalysisReport, pages: ContentAnalysisReport): RedirectSummary {
  const total = blog.databaseImpact.redirectsToGenerate + pages.databaseImpact.redirectsToGenerate;
  const duplicates = blog.quality.duplicateRedirectUrls + pages.quality.duplicateRedirectUrls;
  const byTypeMap = new Map<string, number>();
  for (const r of [...blog.databaseImpact.redirectsByType, ...pages.databaseImpact.redirectsByType]) {
    byTypeMap.set(r.type, (byTypeMap.get(r.type) ?? 0) + r.count);
  }
  return {
    totalRedirects: total,
    byType: [...byTypeMap.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    duplicates,
  };
}

function combineMediaSummary(blog: ContentAnalysisReport, pages: ContentAnalysisReport): MediaSummary {
  return {
    totalFeaturedImages: blog.general.withFeaturedImage + pages.general.withFeaturedImage,
    matched: blog.databaseImpact.matchedFeaturedImages + pages.databaseImpact.matchedFeaturedImages,
    broken: blog.quality.brokenMediaReferences + pages.quality.brokenMediaReferences,
    missing: blog.quality.missingFeaturedImages + pages.quality.missingFeaturedImages,
  };
}

function combineContentSummary(blog: ContentAnalysisReport, pages: ContentAnalysisReport): ContentSummary {
  const publishedBlogPosts = blog.general.statusBreakdown.filter((s) => s.status === "published").reduce((sum, s) => sum + s.count, 0);
  const publishedPages = pages.general.statusBreakdown.filter((s) => s.status === "published").reduce((sum, s) => sum + s.count, 0);
  return {
    totalBlogPosts: blog.general.totalItems,
    totalPages: pages.general.totalItems,
    publishedBlogPosts, publishedPages,
    withCategories: blog.general.withCategories,
    withTags: blog.general.withTags,
  };
}

function assessRisk(blog: ContentAnalysisReport, pages: ContentAnalysisReport): RiskAssessment {
  const reasons: string[] = [];
  const score = Math.round((blog.summary.score + pages.summary.score) / 2);

  const dupSlugs = blog.quality.duplicateSlugsInFile + pages.quality.duplicateSlugsInFile;
  if (dupSlugs > 0) reasons.push(`${dupSlugs} duplicate slug(s) across the file(s) — the later row wins for each.`);
  const brokenMedia = blog.quality.brokenMediaReferences + pages.quality.brokenMediaReferences;
  if (brokenMedia > 0) reasons.push(`${brokenMedia} featured image reference(s) don't match any already-imported Media document — run the Media Migration Manager first to raise this.`);
  const missingMeta = blog.quality.missingMetadata + pages.quality.missingMetadata;
  if (missingMeta > 0) reasons.push(`${missingMeta} item(s) have no SEO title or description from any recognized plugin (Yoast/RankMath/AIOSEO).`);
  const builders = blog.quality.unsupportedPageBuilders + pages.quality.unsupportedPageBuilders;
  if (builders > 0) reasons.push(`${builders} item(s) were built with Elementor — layout data isn't imported, only the raw post content.`);
  const brokenLinks = blog.quality.brokenInternalLinks + pages.quality.brokenInternalLinks;
  if (brokenLinks > 0) reasons.push(`${brokenLinks} internal link(s) in the content point to something not found in this export.`);
  const dupRedirects = blog.quality.duplicateRedirectUrls + pages.quality.duplicateRedirectUrls;
  if (dupRedirects > 0) reasons.push(`${dupRedirects} redirect URL(s) would be generated more than once — safely deduplicated, not an error.`);
  if (!reasons.length) reasons.push("No significant issues detected in this file.");

  const level: RiskLevel = score >= 90 ? "Low Risk" : score >= 70 ? "Medium Risk" : "High Risk";
  return { level, score, reasons };
}

function buildRecommendations(blog: ContentAnalysisReport, pages: ContentAnalysisReport): Recommendation[] {
  const recs: Recommendation[] = [];
  const brokenMedia = blog.quality.brokenMediaReferences + pages.quality.brokenMediaReferences;
  if (brokenMedia > 0) recs.push({ priority: "high", message: "Run the Media Migration Manager before importing content, so more featured images resolve to a local copy instead of an external URL." });
  const missingAuthors = blog.databaseImpact.missingAuthors + pages.databaseImpact.missingAuthors;
  if (missingAuthors > 0) recs.push({ priority: "medium", message: "Run the Customer Migration System first if authors aren't already imported as User accounts — bylines still import as plain text either way." });
  const unsupportedSeo = blog.quality.unsupportedSeoFields + pages.quality.unsupportedSeoFields;
  if (unsupportedSeo > 0) recs.push({ priority: "low", message: "Some SEO plugin metadata isn't explicitly mapped — preserved in unsupportedSeoMeta, review whether any of it needs a dedicated field." });
  if (!recs.length) recs.push({ priority: "low", message: "This file looks ready to import as-is." });
  return recs;
}

const ESTIMATED_ROWS_PER_SEC = 200;
const BASE_MEMORY_BYTES = 60 * 1024 * 1024;
const BYTES_PER_ROW = 6 * 1024; // content bodies are larger than a review/order row

function estimateMigration(blog: ContentAnalysisReport, pages: ContentAnalysisReport): MigrationEstimate {
  const totalRows = blog.totalRows + pages.totalRows;
  const durationMs = Math.max(50, Math.round((totalRows / ESTIMATED_ROWS_PER_SEC) * 1000));
  const peakMemoryBytes = BASE_MEMORY_BYTES + totalRows * BYTES_PER_ROW;
  const writes = blog.databaseImpact.itemsToCreate + blog.databaseImpact.itemsToUpdate + pages.databaseImpact.itemsToCreate + pages.databaseImpact.itemsToUpdate;
  return { durationMs, peakMemoryBytes, writes };
}

export async function buildContentMigrationPlan(filePath: string, fileName: string): Promise<ContentMigrationAssistantReport> {
  const [blog, pages] = await Promise.all([analyzeWooBlogSql(filePath, fileName), analyzeWooPageSql(filePath, fileName)]);

  const risk = assessRisk(blog, pages);
  const recommendations = buildRecommendations(blog, pages);
  const seoCoverage = combineSeoCoverage(blog, pages);
  const redirectSummary = combineRedirectSummary(blog, pages);
  const mediaSummary = combineMediaSummary(blog, pages);
  const contentSummary = combineContentSummary(blog, pages);
  const estimate = estimateMigration(blog, pages);

  const plan: MigrationPhase[] = [
    { phase: 1, title: "Validate", description: "Every blog post and page checked for a usable slug and parseable fields — nothing written yet.", expectedCount: blog.totalRows + pages.totalRows, unit: "content rows" },
    { phase: 2, title: "Import Blog Posts", description: "Run the Blog Posts importer to actually write this data — this Assistant never does.", expectedCount: blog.databaseImpact.itemsToCreate + blog.databaseImpact.itemsToUpdate, unit: "blog posts" },
    { phase: 3, title: "Import Pages", description: "Run the Pages importer to actually write this data.", expectedCount: pages.databaseImpact.itemsToCreate + pages.databaseImpact.itemsToUpdate, unit: "pages" },
    { phase: 4, title: "Verify", description: "Post-run reconciliation against these expected counts, redirects, and SEO/media coverage.", expectedCount: blog.general.totalItems + pages.general.totalItems, unit: "total items" },
  ];

  const verificationPreview = {
    imported: blog.databaseImpact.itemsToCreate + pages.databaseImpact.itemsToCreate,
    updated: blog.databaseImpact.itemsToUpdate + pages.databaseImpact.itemsToUpdate,
    skipped: 0,
    failed: blog.quality.issues.filter((i) => i.level === "error").length + pages.quality.issues.filter((i) => i.level === "error").length,
  };

  const summary = { score: risk.score, label: risk.score >= 90 ? ("Ready to Import" as const) : risk.score >= 70 ? ("Needs Review" as const) : ("High Risk" as const) };

  return { fileName, analyzedAt: new Date().toISOString(), blog, pages, risk, recommendations, seoCoverage, redirectSummary, mediaSummary, contentSummary, plan, verificationPreview, estimate, summary };
}
