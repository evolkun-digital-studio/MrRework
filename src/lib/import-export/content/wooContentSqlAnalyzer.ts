import { UserModel } from "@/models/User";
import { MediaModel } from "@/models/Media";
import { BlogPostModel } from "@/models/BlogPost";
import { PageModel } from "@/models/Page";
import { streamBlogRows, streamPageRows } from "./wooContentSqlSource";
import { mapRow, resolveContentStatus, resolveVisibility, isProtectedContent, TARGET_FIELDS, type WooMappedContent } from "./wooContentMapping";
import { extractSeo } from "./seoExtraction";
import { generatePostRedirects, detectPermalinkStructure } from "./redirectGeneration";

// A read-only "dry run" for a WordPress content SQL export — the shared
// analyzer for BOTH Blog Posts and Pages (they're the exact same source
// shape, wooContentMapping.ts already established one shared mapping
// module for the pair; this analyzer follows the same "don't duplicate
// logic" reasoning). Every Mongo call here is .find()/.lean(), never
// .create()/.save()/.updateOne(); nothing is ever persisted from this module.

export type ContentPostType = "post" | "page";

export interface ContentAnalysisIssue { row: number; sourceId: string; message: string; level: "error" | "warning" }

export interface ContentAnalysisReport {
  fileName: string;
  totalRows: number;
  analyzedAt: string;
  postType: ContentPostType;

  general: {
    totalItems: number;
    statusBreakdown: { wooStatus: string; status: string; count: number }[];
    visibilityBreakdown: { visibility: string; count: number }[];
    withFeaturedImage: number;
    withCategories: number;
    withTags: number;
    withOpenGraph: number;
    withTwitterCard: number;
    withSchema: number;
    withFocusKeyword: number;
    seoSourceBreakdown: { source: string; count: number }[];
    timeline: { period: string; count: number }[];
  };

  quality: {
    missingFeaturedImages: number;
    brokenMediaReferences: number;
    duplicateSlugsInFile: number;
    duplicateRedirectUrls: number;
    unsupportedSeoFields: number;
    unsupportedPageBuilders: number;
    shortcodeUsage: number;
    gutenbergBlocks: number;
    brokenInternalLinks: number;
    missingMetadata: number;
    brokenTaxonomy: number;
    unrecognizedStatus: number;
    issues: ContentAnalysisIssue[];
    issuesTruncated: boolean;
  };

  databaseImpact: {
    itemsToCreate: number;
    itemsToUpdate: number;
    protectedItemsMatched: number;
    matchedAuthors: number;
    missingAuthors: number;
    matchedFeaturedImages: number;
    redirectsToGenerate: number;
    redirectsByType: { type: string; count: number }[];
  };

  summary: { score: number; label: "Ready to Import" | "Needs Review" | "High Risk" };
}

const ISSUE_CAP = 300;
const SHORTCODE_PATTERN = /\[[a-zA-Z][a-zA-Z0-9_-]*(\s[^\]]*)?\]/;
const GUTENBERG_PATTERN = /<!--\s*wp:/;

function periodKey(dateStr: string): string | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Every internal-looking href/src in post content, as bare paths (stripped of the old site's own base URL when known). */
function extractInternalLinkPaths(content: string, siteUrl: string): string[] {
  const paths: string[] = [];
  const re = /(?:href|src)=["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  const trimmedSite = siteUrl.replace(/\/$/, "");
  while ((m = re.exec(content)) !== null) {
    const url = m[1];
    if (trimmedSite && url.startsWith(trimmedSite)) {
      paths.push(url.slice(trimmedSite.length) || "/");
    } else if (url.startsWith("/") && !url.startsWith("//")) {
      paths.push(url);
    }
    // Absolute URLs to a different domain are external, not "internal" —
    // deliberately not flagged as broken.
  }
  return paths;
}

export async function analyzeWooContentSql(filePath: string, fileName: string, postType: ContentPostType): Promise<ContentAnalysisReport> {
  const mapping: Record<string, string> = {};
  for (const f of TARGET_FIELDS) mapping[f.aliases[0]] = f.key;

  const streamRows = postType === "post" ? streamBlogRows : streamPageRows;
  const Model = postType === "post" ? BlogPostModel : PageModel;

  let totalItems = 0, withFeaturedImage = 0, withCategories = 0, withTags = 0;
  let withOpenGraph = 0, withTwitterCard = 0, withSchema = 0, withFocusKeyword = 0;
  const statusCounts = new Map<string, number>();
  const visibilityCounts = new Map<string, number>();
  const seoSourceCounts = new Map<string, number>();
  const timelineByPeriod = new Map<string, number>();

  let missingFeaturedImages = 0, duplicateSlugsInFile = 0, unsupportedSeoFields = 0, unsupportedPageBuilders = 0;
  let shortcodeUsage = 0, gutenbergBlocks = 0, missingMetadata = 0, brokenTaxonomy = 0, unrecognizedStatus = 0;
  const seenSlugs = new Set<string>();
  const issues: ContentAnalysisIssue[] = [];
  const addIssue = (row: number, sourceId: string, message: string, level: "error" | "warning") => {
    if (issues.length < ISSUE_CAP) issues.push({ row, sourceId, message, level });
  };

  const allSlugs = new Set<string>();
  const authorIds = new Set<string>();
  const featuredImageUrls = new Set<string>();
  const redirectFromPaths = new Set<string>();
  const duplicateRedirectPaths = new Set<string>();
  const redirectTypeCounts = new Map<string, number>();

  interface PendingItem { mapped: WooMappedContent; internalLinkPaths: string[] }
  const pending: PendingItem[] = [];

  for await (const raw of streamRows(filePath)) {
    totalItems++;
    const mapped = mapRow(raw, mapping);
    const label = mapped.sourceId || `row ${totalItems}`;

    if (mapped.slug) allSlugs.add(mapped.slug.toLowerCase());
    if (mapped.authorId !== "0") authorIds.add(mapped.authorId);
    if (mapped.featuredImageUrl) featuredImageUrls.add(mapped.featuredImageUrl);

    if (!mapped.slug) {
      addIssue(totalItems, label, "Missing slug.", "error");
    } else {
      const key = mapped.slug.toLowerCase();
      if (seenSlugs.has(key)) { duplicateSlugsInFile++; addIssue(totalItems, label, `Duplicate slug "${mapped.slug}" within this file.`, "warning"); }
      seenSlugs.add(key);
    }

    const status = resolveContentStatus(mapped.wooStatus);
    if (!status.recognized) { unrecognizedStatus++; addIssue(totalItems, label, `Unrecognized status "${mapped.wooStatus}".`, "warning"); }
    const statusKey = mapped.wooStatus || "(none)";
    statusCounts.set(statusKey, (statusCounts.get(statusKey) ?? 0) + 1);

    const visibility = resolveVisibility(mapped.wooStatus, mapped.hasPassword);
    visibilityCounts.set(visibility, (visibilityCounts.get(visibility) ?? 0) + 1);

    if (!mapped.featuredImageUrl) { missingFeaturedImages++; addIssue(totalItems, label, "No featured image.", "warning"); }
    else withFeaturedImage++;
    if (mapped.categories.length) withCategories++;
    if (mapped.tags.length) withTags++;

    const seo = extractSeo(mapped.seoMeta);
    seoSourceCounts.set(seo.seoSource, (seoSourceCounts.get(seo.seoSource) ?? 0) + 1);
    if (Object.keys(seo.unsupportedSeoMeta).length) unsupportedSeoFields++;
    if (!seo.seoTitle && !seo.seoDescription) { missingMetadata++; addIssue(totalItems, label, "No SEO title or description found from any recognized plugin.", "warning"); }
    if (seo.ogTitle || seo.ogDescription || seo.ogImage) withOpenGraph++;
    if (seo.twitterTitle || seo.twitterDescription || seo.twitterImage) withTwitterCard++;
    if (seo.schema) withSchema++;
    if (seo.focusKeyword) withFocusKeyword++;

    if (mapped.seoMeta["_elementor_data"] || mapped.seoMeta["_elementor_edit_mode"]) { unsupportedPageBuilders++; addIssue(totalItems, label, "Built with Elementor — page-builder layout data isn't imported, only the raw post content.", "warning"); }
    if (SHORTCODE_PATTERN.test(mapped.content)) { shortcodeUsage++; addIssue(totalItems, label, "Contains WordPress shortcodes — imported as literal text, not rendered.", "warning"); }
    if (GUTENBERG_PATTERN.test(mapped.content)) gutenbergBlocks++;

    if (mapped.brokenTaxonomyCount > 0) { brokenTaxonomy += mapped.brokenTaxonomyCount; addIssue(totalItems, label, `${mapped.brokenTaxonomyCount} category/tag reference(s) couldn't be resolved in this file's own taxonomy tables.`, "warning"); }

    const period = periodKey(mapped.createdDate);
    if (period) timelineByPeriod.set(period, (timelineByPeriod.get(period) ?? 0) + 1);

    const permalinkStructure = detectPermalinkStructure(mapped.permalinkStructure);
    const newPath = postType === "post" ? `/blog/${mapped.slug}` : `/${mapped.slug}`;
    const redirects = mapped.slug ? generatePostRedirects({ id: mapped.sourceId, slug: mapped.slug, date: mapped.createdDate, oldSlugs: mapped.oldSlugs }, newPath, permalinkStructure) : [];
    for (const r of redirects) {
      if (redirectFromPaths.has(r.fromPath)) { duplicateRedirectPaths.add(r.fromPath); continue; } // count each distinct fromPath's type once, matching redirectsToGenerate's own dedup semantics
      redirectFromPaths.add(r.fromPath);
      redirectTypeCounts.set(r.type, (redirectTypeCounts.get(r.type) ?? 0) + 1);
    }

    const internalLinkPaths = extractInternalLinkPaths(mapped.content, mapped.siteUrl);
    pending.push({ mapped, internalLinkPaths });
  }

  // Second pass: broken internal links — a path that isn't any known slug
  // (as a bare path or `/slug/`) in this same file.
  let brokenInternalLinks = 0;
  for (const { internalLinkPaths } of pending) {
    for (const path of internalLinkPaths) {
      const bare = path.replace(/^\/|\/$/g, "").split("/").pop() ?? "";
      if (bare && !allSlugs.has(bare.toLowerCase())) brokenInternalLinks++;
    }
  }

  // Read-only DB lookups — batched once for the whole file.
  const [existingAuthors, existingMedia, existingItems] = await Promise.all([
    authorIds.size ? UserModel.find({ sourceSystem: "woocommerce", sourceId: { $in: [...authorIds] } }).select("sourceId").lean<{ sourceId: string }[]>() : Promise.resolve([]),
    featuredImageUrls.size ? MediaModel.find({ originalUrl: { $in: [...featuredImageUrls] } }).select("originalUrl").lean<{ originalUrl: string }[]>() : Promise.resolve([]),
    allSlugs.size ? Model.find({ sourceSystem: "woocommerce", sourceId: { $in: pending.map((p) => p.mapped.sourceId).filter(Boolean) } }).select("sourceId status wooStatus").lean<any[]>() : Promise.resolve([]),
  ]);

  const authorIdSet = new Set(existingAuthors.map((u) => u.sourceId));
  const mediaUrlSet = new Set(existingMedia.map((m) => m.originalUrl));
  const existingBySourceId = new Map(existingItems.map((i: any) => [String(i.sourceId), i]));

  let itemsToCreate = 0, itemsToUpdate = 0, protectedItemsMatched = 0, matchedAuthors = 0, missingAuthors = 0, matchedFeaturedImages = 0, brokenMediaReferences = 0;
  for (const { mapped } of pending) {
    const existing = existingBySourceId.get(mapped.sourceId);
    if (existing) {
      itemsToUpdate++;
      if (isProtectedContent(existing)) protectedItemsMatched++;
    } else if (mapped.sourceId) {
      itemsToCreate++;
    }
    if (mapped.authorId !== "0") { if (authorIdSet.has(mapped.authorId)) matchedAuthors++; else missingAuthors++; }
    if (mapped.featuredImageUrl) { if (mediaUrlSet.has(mapped.featuredImageUrl)) matchedFeaturedImages++; else brokenMediaReferences++; }
  }

  let score = 100;
  score -= Math.min(30, duplicateSlugsInFile * 2);
  score -= Math.min(20, brokenMediaReferences * 0.5);
  score -= Math.min(15, missingFeaturedImages * 0.2);
  score -= Math.min(15, missingMetadata * 0.3);
  score -= Math.min(10, unrecognizedStatus * 0.5);
  score -= Math.min(10, brokenTaxonomy * 0.5);
  score = Math.max(0, Math.round(score));
  const label = score >= 90 ? "Ready to Import" : score >= 70 ? "Needs Review" : "High Risk";

  return {
    fileName,
    totalRows: totalItems,
    analyzedAt: new Date().toISOString(),
    postType,
    general: {
      totalItems, withFeaturedImage, withCategories, withTags,
      withOpenGraph, withTwitterCard, withSchema, withFocusKeyword,
      statusBreakdown: [...statusCounts.entries()].map(([wooStatus, count]) => ({ wooStatus, status: resolveContentStatus(wooStatus).status, count })).sort((a, b) => b.count - a.count),
      visibilityBreakdown: [...visibilityCounts.entries()].map(([visibility, count]) => ({ visibility, count })).sort((a, b) => b.count - a.count),
      seoSourceBreakdown: [...seoSourceCounts.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
      timeline: [...timelineByPeriod.entries()].map(([period, count]) => ({ period, count })).sort((a, b) => a.period.localeCompare(b.period)),
    },
    quality: {
      missingFeaturedImages, brokenMediaReferences, duplicateSlugsInFile,
      duplicateRedirectUrls: duplicateRedirectPaths.size,
      unsupportedSeoFields, unsupportedPageBuilders, shortcodeUsage, gutenbergBlocks,
      brokenInternalLinks, missingMetadata, brokenTaxonomy, unrecognizedStatus,
      issues: issues.slice(0, ISSUE_CAP), issuesTruncated: issues.length >= ISSUE_CAP,
    },
    databaseImpact: {
      itemsToCreate, itemsToUpdate, protectedItemsMatched,
      matchedAuthors, missingAuthors, matchedFeaturedImages,
      redirectsToGenerate: redirectFromPaths.size,
      redirectsByType: [...redirectTypeCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    },
    summary: { score, label },
  };
}

export async function analyzeWooBlogSql(filePath: string, fileName: string): Promise<ContentAnalysisReport> {
  return analyzeWooContentSql(filePath, fileName, "post");
}

export async function analyzeWooPageSql(filePath: string, fileName: string): Promise<ContentAnalysisReport> {
  return analyzeWooContentSql(filePath, fileName, "page");
}
