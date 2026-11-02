import { PageModel } from "@/models/Page";
import { UserModel } from "@/models/User";
import { MediaModel } from "@/models/Media";
import { RedirectModel } from "@/models/Redirect";
import {
  TARGET_FIELDS,
  buildContentDoc,
  isProtectedContent,
  mapRow,
  resolveAuthorLink,
  resolveContentStatus,
  resolveParentLink,
  type WooMappedContent,
} from "./wooContentMapping";
import { streamPageRows, buildSlugPathIndex } from "./wooContentSqlSource";
import type { ImporterModule, ImportRunContext, RowResult, ValidationIssue } from "../types";

// The pages counterpart of wooBlogImporter.ts — same contract, same shared
// mapping module, same identity-by-sourceId pattern. The one genuinely
// different concern is hierarchy: a page's `parent` is another *page*
// (resolved by the parent's own WordPress post ID), never a blog post.

export { TARGET_FIELDS, buildContentDoc, mapRow };
export type { WooMappedContent } from "./wooContentMapping";

function validateRow(mapped: WooMappedContent, rowIndex: number, ctx: ImportRunContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!mapped.sourceId) issues.push({ row: rowIndex, field: "sourceId", message: "Missing page ID.", level: "error" });
  if (!mapped.title) issues.push({ row: rowIndex, field: "title", message: "Missing title.", level: "error" });
  if (!mapped.slug) {
    issues.push({ row: rowIndex, field: "slug", message: "Missing slug.", level: "error" });
  } else {
    const key = mapped.slug.toLowerCase();
    if (ctx.seenSlugs.has(key)) {
      issues.push({ row: rowIndex, field: "slug", message: `Duplicate slug "${mapped.slug}" within this file — if this is the same page ID re-appearing, the later row updates it; if it's a different page ID reusing the slug, the later row will fail (slugs must stay unique).`, level: "warning" });
    }
    ctx.seenSlugs.add(key);
  }
  if (!resolveContentStatus(mapped.wooStatus).recognized) {
    issues.push({ row: rowIndex, field: "wooStatus", message: `Unrecognized status "${mapped.wooStatus}" — will default to draft.`, level: "warning" });
  }

  return issues;
}

async function importRow(mapped: WooMappedContent, _rowIndex: number, ctx: ImportRunContext): Promise<RowResult> {
  if (!mapped.sourceId) return { outcome: "failed", message: "Missing page ID — cannot import a page without one." };
  if (!mapped.title || !mapped.slug) return { outcome: "failed", message: `Page ${mapped.sourceId}: missing title or slug.` };

  const [userBySourceId, media, existing, slugOwner, parentPage] = await Promise.all([
    mapped.authorId !== "0" ? UserModel.findOne({ sourceSystem: "woocommerce", sourceId: mapped.authorId }).select("_id").lean<{ _id: unknown } | null>() : Promise.resolve(null),
    mapped.featuredImageUrl ? MediaModel.findOne({ originalUrl: mapped.featuredImageUrl }).select("url").lean<{ url: string } | null>() : Promise.resolve(null),
    PageModel.findOne({ sourceSystem: "woocommerce", sourceId: mapped.sourceId }),
    PageModel.findOne({ slug: mapped.slug }).select("_id sourceId").lean<{ _id: unknown; sourceId?: string } | null>(),
    mapped.parentSourceId !== "0" ? PageModel.findOne({ sourceSystem: "woocommerce", sourceId: mapped.parentSourceId }).select("_id").lean<{ _id: unknown } | null>() : Promise.resolve(null),
  ]);

  if (slugOwner && String(slugOwner.sourceId ?? "") !== mapped.sourceId && !existing) {
    return { outcome: "failed", message: `Page ${mapped.sourceId}: slug "${mapped.slug}" is already used by a different page.` };
  }

  const authorLink = resolveAuthorLink(mapped.authorId, userBySourceId ? new Map([[mapped.authorId, String(userBySourceId._id)]]) : new Map());
  const parentLink = resolveParentLink(mapped.parentSourceId, parentPage ? new Map([[mapped.parentSourceId, String(parentPage._id)]]) : new Map());
  // Flat top-level routing (`/<slug>`) regardless of hierarchy depth — this
  // storefront has no nested-page routing yet; `parent` is still recorded
  // on the document for a future nested-path scheme. See ADMIN_CMS.md's
  // Remaining Limitations.
  const newPath = `/${mapped.slug}`;
  if (!ctx.scratch.contentPathBySlug && mapped.sourceFilePath) ctx.scratch.contentPathBySlug = await buildSlugPathIndex(mapped.sourceFilePath);
  const pathBySlug = (ctx.scratch.contentPathBySlug as Map<string, string> | undefined) ?? new Map();
  const { doc, redirects } = buildContentDoc(mapped, authorLink, parentLink, media ? new Map([[mapped.featuredImageUrl, media.url]]) : new Map(), newPath, pathBySlug);

  await Promise.all(
    redirects.map((r) =>
      RedirectModel.findOneAndUpdate(
        { fromPath: r.fromPath },
        { $set: { toPath: r.toPath, type: r.type, sourceSystem: "woocommerce", sourceId: r.sourceId } },
        { upsert: true }
      )
    )
  );

  if (existing) {
    ctx.skuToId.set(mapped.sourceId.toLowerCase(), String(existing._id));
    if (ctx.duplicateStrategy === "skip") return { outcome: "skipped", message: `Page "${mapped.sourceId}" already exists.` };

    const protectedContent = isProtectedContent(existing);
    const previousValues: Record<string, unknown> = {};
    const patch: Record<string, unknown> = { ...doc };
    if (protectedContent) delete patch.status;
    for (const key of Object.keys(patch)) previousValues[key] = (existing as any).get?.(key) ?? (existing as any)[key];

    Object.assign(existing, patch);
    await existing.save();
    return {
      outcome: "updated",
      message: protectedContent ? `Updated page data only — "${mapped.slug}" has a manually-overridden publish status, left untouched.` : undefined,
      snapshot: { identifier: mapped.sourceId, documentId: String(existing._id), previousValues },
    };
  }

  const created = await PageModel.create(doc);
  ctx.skuToId.set(mapped.sourceId.toLowerCase(), String(created._id));
  return { outcome: "imported" };
}

export const wooPageImporter: ImporterModule<WooMappedContent> = {
  key: "pages",
  label: "Pages",
  description: "Import static pages, SEO metadata, and redirects from a WordPress SQL export.",
  icon: "FileText",
  status: "available",
  acceptedExtensions: [".sql"],
  identifierField: "slug",
  targetFields: TARGET_FIELDS,
  streamRows: streamPageRows,
  mapRow,
  validateRow,
  importRow,
};
