import { dbConnect } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { MediaModel } from "@/models/Media";
import { BlogPostModel } from "@/models/BlogPost";
import { PageModel } from "@/models/Page";
import { streamBlogRows, streamPageRows, buildSlugPathIndex } from "./wooContentSqlSource";
import {
  buildContentDoc,
  isProtectedContent,
  mapRow,
  resolveAuthorLink,
  resolveParentLink,
  type WooMappedContent,
} from "./wooContentMapping";
import type { ContentPostType } from "./wooContentSqlAnalyzer";
import { TARGET_FIELDS } from "./wooContentMapping";

// The content counterpart of reviews/wooReviewPreview.ts — "source row ->
// mapped fields -> the exact document a real import would create," entirely
// read-only. Calls the exact same mapRow()/resolveAuthorLink()/
// resolveParentLink()/buildContentDoc()/isProtectedContent() the live
// importers use — no re-implementation of any mapping, linking, or merge
// logic. Shared between Blog Posts and Pages the same way the mapping
// module and analyzer already are; parameterized by `postType`.

const PREVIEW_CAP = 300;

export interface ContentPreviewSide {
  sourceId: string;
  title: string;
  slug: string;
  status: string;
  wooStatus: string;
  visibility: string;
  author: string;
  categories: string[];
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  seoSource: string;
  featuredImage: string;
  featuredImageMatched: boolean;
  redirectCount: number;
  createdAt: string | null;
}

export interface ContentPreviewRow {
  row: number;
  sourceId: string;
  isDuplicateInFile: boolean;
  existsInDb: boolean;
  isProtected: boolean;
  before: ContentPreviewSide | null;
  after: ContentPreviewSide;
  warnings: string[];
}

export interface ContentPreviewResult {
  rows: ContentPreviewRow[];
  totalRows: number;
  truncated: boolean;
  postType: ContentPostType;
}

function existingToSide(existing: any): ContentPreviewSide {
  return {
    sourceId: existing.sourceId ?? "",
    title: existing.title ?? "",
    slug: existing.slug ?? "",
    status: existing.status ?? "",
    wooStatus: existing.wooStatus ?? "",
    visibility: existing.visibility ?? "public",
    author: existing.authorName ?? "",
    categories: existing.categories ?? [],
    tags: existing.tags ?? [],
    seoTitle: existing.seoTitle ?? "",
    seoDescription: existing.seoDescription ?? "",
    seoSource: existing.seoSource ?? "none",
    featuredImage: existing.featuredImage ?? "",
    featuredImageMatched: true, // whatever is already stored is, by definition, already resolved
    redirectCount: 0, // redirects aren't stored on the content document itself — see the Redirect Summary section instead
    createdAt: existing.createdAt ? new Date(existing.createdAt).toISOString() : null,
  };
}

export async function previewContent(filePath: string, columnMapping: Record<string, string>, postType: ContentPostType): Promise<ContentPreviewResult> {
  await dbConnect();

  const streamRows = postType === "post" ? streamBlogRows : streamPageRows;
  const Model = postType === "post" ? BlogPostModel : PageModel;

  const mapped_rows: { rowIndex: number; mapped: WooMappedContent }[] = [];
  let totalRows = 0;
  const seenSlugs = new Set<string>();

  const authorIds = new Set<string>();
  const featuredImageUrls = new Set<string>();
  const sourceIds = new Set<string>();
  const parentSourceIds = new Set<string>();

  for await (const raw of streamRows(filePath)) {
    totalRows++;
    if (mapped_rows.length >= PREVIEW_CAP) continue;
    const mapped = mapRow(raw, columnMapping);
    mapped_rows.push({ rowIndex: totalRows, mapped });

    if (mapped.authorId !== "0") authorIds.add(mapped.authorId);
    if (mapped.featuredImageUrl) featuredImageUrls.add(mapped.featuredImageUrl);
    if (mapped.sourceId) sourceIds.add(mapped.sourceId);
    if (mapped.parentSourceId !== "0") parentSourceIds.add(mapped.parentSourceId);
  }

  const pathBySlug = await buildSlugPathIndex(filePath);

  const [users, media, existingItems, parentItems] = await Promise.all([
    authorIds.size ? UserModel.find({ sourceSystem: "woocommerce", sourceId: { $in: [...authorIds] } }).select("sourceId").lean<{ sourceId: string }[]>() : Promise.resolve([]),
    featuredImageUrls.size ? MediaModel.find({ originalUrl: { $in: [...featuredImageUrls] } }).select("originalUrl url").lean<{ originalUrl: string; url: string }[]>() : Promise.resolve([]),
    sourceIds.size ? Model.find({ sourceSystem: "woocommerce", sourceId: { $in: [...sourceIds] } }).lean<any[]>() : Promise.resolve([]),
    postType === "page" && parentSourceIds.size ? PageModel.find({ sourceSystem: "woocommerce", sourceId: { $in: [...parentSourceIds] } }).select("sourceId").lean<{ sourceId: string }[]>() : Promise.resolve([]),
  ]);

  const userIdBySourceId = new Map(users.map((u) => [u.sourceId, u.sourceId])); // presence-only map; resolveAuthorLink only needs to know "does this sourceId exist"
  const mediaUrlByOriginalUrl = new Map(media.map((m) => [m.originalUrl, m.url]));
  const existingBySourceId = new Map(existingItems.map((i: any) => [String(i.sourceId), i]));
  const parentIdBySourceId = new Map(parentItems.map((p) => [p.sourceId, p.sourceId]));

  const rows: ContentPreviewRow[] = mapped_rows.map(({ rowIndex, mapped }) => {
    const warnings: string[] = [];
    const key = mapped.slug.toLowerCase();

    if (!mapped.sourceId) warnings.push("Missing post ID — this row cannot be imported.");
    if (!mapped.slug) warnings.push("Missing slug — this row cannot be imported.");
    const isDuplicateInFile = !!mapped.slug && seenSlugs.has(key);
    if (mapped.slug) seenSlugs.add(key);
    if (isDuplicateInFile) warnings.push("Duplicate slug within this file — if this is the same post/page ID re-appearing this row updates it, otherwise it will fail as a slug conflict.");

    const existing = existingBySourceId.get(mapped.sourceId);
    const protectedContent = isProtectedContent(existing);
    if (protectedContent) warnings.push("Matches an existing item with a manually-overridden publish status — only content/SEO/media/redirects will be updated.");

    const authorLink = resolveAuthorLink(mapped.authorId, userIdBySourceId);
    const parentLink = postType === "page" ? resolveParentLink(mapped.parentSourceId, parentIdBySourceId) : null;
    if (mapped.authorId !== "0" && !authorLink.matched) warnings.push("Author couldn't be matched to an imported User account — byline preserved as plain text.");
    if (mapped.featuredImageUrl && !mediaUrlByOriginalUrl.has(mapped.featuredImageUrl)) warnings.push("Featured image doesn't match any already-imported Media document.");
    if (!mapped.featuredImageUrl) warnings.push("No featured image.");

    const newPath = postType === "post" ? `/blog/${mapped.slug}` : `/${mapped.slug}`;
    const { doc, redirects, featuredImageMatched } = buildContentDoc(mapped, authorLink, parentLink, mediaUrlByOriginalUrl, newPath, pathBySlug);

    const after: ContentPreviewSide = {
      sourceId: String(doc.sourceId ?? ""),
      title: String(doc.title ?? ""),
      slug: String(doc.slug ?? ""),
      status: protectedContent ? (existing?.status ?? "") : String(doc.status ?? ""),
      wooStatus: String(doc.wooStatus ?? ""),
      visibility: String(doc.visibility ?? "public"),
      author: mapped.authorName || "",
      categories: (doc.categories as string[] | undefined) ?? [],
      tags: (doc.tags as string[] | undefined) ?? [],
      seoTitle: String(doc.seoTitle ?? ""),
      seoDescription: String(doc.seoDescription ?? ""),
      seoSource: String(doc.seoSource ?? "none"),
      featuredImage: String(doc.featuredImage ?? ""),
      featuredImageMatched,
      redirectCount: redirects.length,
      createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : null,
    };

    return {
      row: rowIndex,
      sourceId: mapped.sourceId,
      isDuplicateInFile,
      existsInDb: !!existing,
      isProtected: protectedContent,
      before: existing ? existingToSide(existing) : null,
      after,
      warnings,
    };
  });

  return { rows, totalRows, truncated: totalRows > PREVIEW_CAP, postType };
}

/**
 * Both Blog Posts and Pages previews from one uploaded file, for the
 * unified Content Migration Assistant page. No saved `job.columnMapping`
 * applies here (the "content" registry entry has no column-mapping UI of
 * its own) — the default alias-based mapping is always correct and
 * sufficient, since wooContentSqlSource.ts's emitted column names already
 * match TARGET_FIELDS' aliases 1:1 by design.
 */
export async function previewUnifiedContent(filePath: string): Promise<{ blog: ContentPreviewResult; pages: ContentPreviewResult }> {
  const defaultMapping: Record<string, string> = {};
  for (const f of TARGET_FIELDS) defaultMapping[f.aliases[0]] = f.key;

  const [blog, pages] = await Promise.all([
    previewContent(filePath, defaultMapping, "post"),
    previewContent(filePath, defaultMapping, "page"),
  ]);
  return { blog, pages };
}
