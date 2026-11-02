import { applyMapping } from "../mapping";
import type { TargetField } from "../types";
import { extractSeo, type ExtractedSeo } from "./seoExtraction";
import { resolveFeaturedImage } from "./mediaLinking";
import { generatePostRedirects, detectPermalinkStructure, rewriteInternalLinks, type RedirectCandidate, type PermalinkStructure } from "./redirectGeneration";

// Pure content field mapping/normalization/linking-decision logic — no
// database access, no file I/O. Shared by BOTH the Blog and Pages
// importers (wooBlogImporter.ts / wooPageImporter.ts) since a WordPress
// post and a WordPress page are, structurally, the exact same source shape
// (both post_type rows in wp_posts) — one shared mapping module here is
// what "don't duplicate logic" actually means for this pair, the same way
// orders/wooOrderMapping.ts and reviews/wooReviewMapping.ts are each their
// own single source of truth for their one importer. No `server-only`
// guard — reused as-is by the standalone repair script.

export const TARGET_FIELDS: TargetField[] = [
  { key: "title", label: "Title", required: true, aliases: ["post_title"] },
  { key: "slug", label: "Slug", required: true, aliases: ["post_name"] },
  { key: "content", label: "Content", aliases: ["post_content"] },
  { key: "excerpt", label: "Excerpt", aliases: ["post_excerpt"] },
  { key: "wooStatus", label: "Status", aliases: ["post_status"] },
  { key: "hasPassword", label: "Password Protected", aliases: ["has_password"] },
  { key: "createdDate", label: "Publish Date", aliases: ["post_date"] },
  { key: "modifiedDate", label: "Modified Date", aliases: ["post_modified"] },
  { key: "authorId", label: "WordPress Author ID", aliases: ["post_author"] },
  { key: "authorName", label: "Author Name", aliases: ["author_name"] },
  { key: "parentSourceId", label: "Parent (WordPress post ID)", aliases: ["post_parent"], description: "Page hierarchy — not applicable to blog posts." },
  { key: "menuOrder", label: "Menu Order", aliases: ["menu_order"] },
];

export interface WooMappedContent {
  sourceId: string;
  postType: "post" | "page";
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  wooStatus: string;
  hasPassword: boolean;
  createdDate: string;
  modifiedDate: string;
  authorId: string;
  authorName: string;
  parentSourceId: string;
  menuOrder: string;
  featuredImageUrl: string;
  categories: string[];
  tags: string[];
  oldSlugs: string[];
  brokenTaxonomyCount: number;
  seoMeta: Record<string, string>;
  siteUrl: string;
  permalinkStructure: string;
  sourceFilePath: string;
}

function parseJsonArray<T>(json: string | undefined): T[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(json: string | undefined): Record<string, string> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// Structural fields (featured image URL, categories/tags, old slugs, SEO
// meta, site URL) are already fully resolved by wooContentSqlSource.ts —
// read straight off `raw`, never through the column-mapping UI, same
// reasoning as every other SQL-sourced importer's JSON-embedded columns.
export function mapRow(raw: Record<string, string>, mapping: Record<string, string>): WooMappedContent {
  const m = applyMapping(raw, mapping);
  return {
    sourceId: (raw["ID"] ?? "").trim(),
    postType: raw["post_type"] === "page" ? "page" : "post",
    title: (m.title ?? "").trim(),
    slug: (m.slug ?? "").trim(),
    content: m.content ?? "",
    excerpt: m.excerpt ?? "",
    wooStatus: (m.wooStatus ?? "").trim(),
    hasPassword: (m.hasPassword ?? "0").trim() === "1",
    createdDate: (m.createdDate ?? "").trim(),
    modifiedDate: (m.modifiedDate ?? "").trim(),
    authorId: (m.authorId ?? "0").trim(),
    authorName: (m.authorName ?? "").trim(),
    parentSourceId: (m.parentSourceId ?? "0").trim(),
    menuOrder: (m.menuOrder ?? "0").trim(),
    featuredImageUrl: (raw["featured_image_url"] ?? "").trim(),
    categories: parseJsonArray<string>(raw["categories_json"]),
    tags: parseJsonArray<string>(raw["tags_json"]),
    oldSlugs: parseJsonArray<string>(raw["old_slugs_json"]),
    brokenTaxonomyCount: Number(raw["broken_taxonomy_count"]) || 0,
    seoMeta: parseJsonObject(raw["seo_meta_json"]),
    siteUrl: (raw["site_url"] ?? "").trim(),
    permalinkStructure: (raw["permalink_structure"] ?? "").trim(),
    sourceFilePath: raw["source_file_path"] ?? "",
  };
}

// ---------------------------------------------------------------------------
// Status Mapping — WordPress post_status -> the existing draft/scheduled/
// published enum (shared, pre-existing on BlogPost; newly declared the same
// way on Page). `visibility` is a separate concern (see below) — a
// "published" post can still be private or password-protected.
// ---------------------------------------------------------------------------

export type ContentStatus = "draft" | "scheduled" | "published";
const STATUS_MAP: Record<string, ContentStatus> = {
  publish: "published",
  private: "published", // published, just restricted — see resolveVisibility
  future: "scheduled",
  draft: "draft",
  pending: "draft", // "pending review" has no dedicated bucket in this app's 3-value enum; draft is the safe default (never silently public)
};

export function resolveContentStatus(wooStatus: string): { status: ContentStatus; recognized: boolean } {
  const key = wooStatus.trim().toLowerCase();
  const status = STATUS_MAP[key];
  return status ? { status, recognized: true } : { status: "draft", recognized: false };
}

export type ContentVisibility = "public" | "private" | "password-protected";
export function resolveVisibility(wooStatus: string, hasPassword: boolean): ContentVisibility {
  if (hasPassword) return "password-protected";
  if (wooStatus.trim().toLowerCase() === "private") return "private";
  return "public";
}

// ---------------------------------------------------------------------------
// Author Linking — WordPress author ID -> User (by sourceId, the same
// identity the Customer Migration System stamps onto every account it
// creates). No "guest" concept here (every WordPress post has a real
// author) — just matched-or-not; `authorName` is always preserved from the
// source regardless, so a byline is never lost even when the account link fails.
// ---------------------------------------------------------------------------

export interface AuthorLinkResult { userId: string | null; matched: boolean }

export function resolveAuthorLink(authorId: string, userIdBySourceId: Map<string, string>): AuthorLinkResult {
  if (!authorId || authorId === "0") return { userId: null, matched: false };
  const hit = userIdBySourceId.get(authorId);
  return hit ? { userId: hit, matched: true } : { userId: null, matched: false };
}

// ---------------------------------------------------------------------------
// Page Hierarchy — parent WordPress post ID -> already-imported Page (by
// sourceId). Blog posts never have a parent (WordPress doesn't support
// post hierarchy for the "post" type) — callers simply never invoke this
// for blog rows.
// ---------------------------------------------------------------------------

export interface ParentLinkResult { parentId: string | null; matched: boolean }

export function resolveParentLink(parentSourceId: string, pageIdBySourceId: Map<string, string>): ParentLinkResult {
  if (!parentSourceId || parentSourceId === "0") return { parentId: null, matched: false };
  const hit = pageIdBySourceId.get(parentSourceId);
  return hit ? { parentId: hit, matched: true } : { parentId: null, matched: false };
}

// ---------------------------------------------------------------------------
// Content Migration Security — never let a re-import (or the repair
// script) silently flip a deliberate publish/unpublish decision. Mirrors
// isProtectedReview's third condition exactly: protected only when the
// existing `status` disagrees with what its own stored `wooStatus` would
// freshly derive (an admin manually overrode it through the CMS) — content
// body/SEO/media/redirects stay eligible for correction either way, since
// pulling fresh correct data is the whole point of a repair run.
// ---------------------------------------------------------------------------

export function isProtectedContent(existing: { status?: string; wooStatus?: string } | null | undefined): boolean {
  if (!existing) return false;
  if (!existing.wooStatus) return false;
  const derived = resolveContentStatus(existing.wooStatus).status;
  return !!existing.status && existing.status !== derived;
}

// ---------------------------------------------------------------------------
// Document assembly — pure, no database access, no side effects. Produces
// both the Mongo document AND the full list of redirect candidates this
// one post/page should generate, so the importer/preview/analyzer/repair
// script never independently re-derive either.
// ---------------------------------------------------------------------------

export interface ContentBuildResult {
  doc: Record<string, unknown>;
  redirects: RedirectCandidate[];
  seo: ExtractedSeo;
  featuredImageMatched: boolean;
}

export function buildContentDoc(
  mapped: WooMappedContent,
  authorLink: AuthorLinkResult,
  parentLink: ParentLinkResult | null,
  mediaUrlByOriginalUrl: Map<string, string>,
  newPath: string,
  pathBySlug: Map<string, string> = new Map()
): ContentBuildResult {
  const status = resolveContentStatus(mapped.wooStatus);
  const visibility = resolveVisibility(mapped.wooStatus, mapped.hasPassword);
  const seo = extractSeo(mapped.seoMeta);
  const media = resolveFeaturedImage(mapped.featuredImageUrl, mediaUrlByOriginalUrl);
  const content = rewriteInternalLinks(mapped.content, mapped.siteUrl, pathBySlug);

  const createdAt = mapped.createdDate ? new Date(mapped.createdDate) : undefined;
  const validCreatedAt = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : undefined;
  const publishedAt = status.status === "published" || status.status === "scheduled" ? validCreatedAt : undefined;

  const doc: Record<string, unknown> = {
    title: mapped.title,
    slug: mapped.slug,
    content,
    excerpt: mapped.excerpt,
    featuredImage: media.url,
    authorName: mapped.authorName || undefined,
    status: status.status,
    wooStatus: mapped.wooStatus,
    visibility,
    seoTitle: seo.seoTitle, seoDescription: seo.seoDescription,
    canonicalUrl: seo.canonicalUrl || undefined, robots: seo.robots,
    ogTitle: seo.ogTitle || undefined, ogDescription: seo.ogDescription || undefined, ogImage: seo.ogImage || undefined,
    twitterTitle: seo.twitterTitle || undefined, twitterDescription: seo.twitterDescription || undefined, twitterImage: seo.twitterImage || undefined,
    focusKeyword: seo.focusKeyword || undefined,
    schemaData: seo.schema || undefined, // Mongoose field is `schemaData`, not `schema` — see BlogPost.ts/Page.ts
    unsupportedSeoMeta: Object.keys(seo.unsupportedSeoMeta).length ? seo.unsupportedSeoMeta : undefined,
    seoSource: seo.seoSource,
    sourceSystem: "woocommerce",
    sourceId: mapped.sourceId,
  };
  if (mapped.postType === "post") {
    doc.categories = mapped.categories;
    doc.tags = mapped.tags;
  } else {
    doc.order = Number(mapped.menuOrder) || 0;
    if (parentLink?.parentId) doc.parent = parentLink.parentId;
  }
  if (authorLink.userId) doc.author = authorLink.userId;
  if (validCreatedAt) doc.createdAt = validCreatedAt;
  if (publishedAt) doc.publishedAt = publishedAt;

  const permalinkStructure: PermalinkStructure = detectPermalinkStructure(mapped.permalinkStructure);
  const redirects = generatePostRedirects(
    { id: mapped.sourceId, slug: mapped.slug, date: mapped.createdDate, oldSlugs: mapped.oldSlugs },
    newPath,
    permalinkStructure
  );

  return { doc, redirects, seo, featuredImageMatched: media.matched };
}
