import { streamSqlTables } from "../sqlParser";

// Turns a WordPress SQL dump's post/taxonomy tables into a stream of flat,
// CSV-shaped rows — one per post or page — mirroring every other SQL source
// in this folder family (orders, reviews). `collectContentData()` does the
// one-time, multi-pass merge; `streamBlogRows`/`streamPageRows` are thin
// generators over the SAME collected data, filtered by `post_type`, so a
// file uploaded once for a blog import and once for a page import (the
// established one-upload-per-ImportJob pattern every importer in this app
// uses) each get their own independent, correct pass.
//
// Required tables (per the task): wp_posts, wp_postmeta, wp_terms,
// wp_term_taxonomy, wp_term_relationships, wp_comments (unused — nothing in
// the task's BLOG POSTS/PAGES field lists needs post comments, so this
// source legitimately never scans it, matching the task's own "only when
// needed" qualifier), wp_options (used narrowly, for `siteurl`/`home` —
// needed to normalize old absolute URLs into relative paths for redirect
// generation, not for general site settings).
//
// No `server-only` guard, same reasoning as every other SQL source here:
// reused as-is by the standalone repair script (scripts/migrateWpContent.ts).

const SEO_META_PATTERN = /^(_yoast_wpseo_|rank_math_|_aioseo_)/;
// Page-builder detection meta — not SEO data, but captured into the same
// generic per-post meta bag (already a "recognized special postmeta"
// collector, not a strictly-SEO-only one in practice) purely so the
// Compatibility Analyzer can flag Elementor-built content, one of its
// explicitly required detections.
const PAGE_BUILDER_META_PATTERN = /^_elementor_(data|edit_mode)$/;
const THUMBNAIL_META_KEY = "_thumbnail_id";
const CANONICAL_LEGACY_KEY = "_wp_old_slug"; // WordPress's own "this post's slug used to be X" trail, useful for redirect generation beyond just the plugin-specific canonical fields

export interface RawContentPost {
  id: string;
  postType: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  status: string;
  hasPassword: boolean;
  date: string;
  modified: string;
  authorId: string;
  authorName: string;
  parentId: string;
  menuOrder: string;
  meta: Record<string, string>; // every _yoast_wpseo_*/rank_math_*/_aioseo_* key, plus _thumbnail_id and _wp_old_slug
  featuredImageUrl: string; // resolved via the attachment index, "" if none/unresolved
  categories: string[];
  tags: string[];
  oldSlugs: string[]; // from _wp_old_slug — every prior slug this post has ever had, for extra redirect coverage
  brokenTaxonomyCount: number; // term_relationships that referenced a term_taxonomy_id this file's own wp_term_taxonomy/wp_terms couldn't resolve
}

interface CollectedContent {
  posts: Map<string, RawContentPost>;
  siteUrl: string;
  permalinkStructure: string;
}

async function collectContentData(filePath: string): Promise<CollectedContent> {
  // --- Pass 1: wp_posts + wp_postmeta (posts, pages, and attachments for
  // featured-image URL resolution, all in one linear scan). ---
  const postRows = new Map<string, { postType: string; title: string; slug: string; content: string; excerpt: string; status: string; hasPassword: boolean; date: string; modified: string; authorId: string; parentId: string; menuOrder: string }>();
  const attachmentUrlById = new Map<string, string>();
  const metaByPostId = new Map<string, Record<string, string>>();
  const oldSlugsByPostId = new Map<string, string[]>();
  const thumbnailIdByPostId = new Map<string, string>();
  // wp_users isn't one of this importer's required source tables — read
  // opportunistically, purely for a display-name fallback ("author" is an
  // explicitly required field; without this, an author whose account wasn't
  // separately imported by the Customer Migration System would have no name
  // at all). Same precedent Orders/Reviews already established for reading
  // one table beyond the literally-named required set to serve an
  // explicitly requested field — degrades silently to "no name" if absent.
  const authorNameById = new Map<string, string>();

  for await (const row of streamSqlTables(filePath, ["wp_posts", "wp_postmeta", "wp_users"])) {
    if (row.table === "wp_users") {
      const id = row.values["ID"];
      if (id) authorNameById.set(id, row.values["display_name"] || row.values["user_login"] || "");
      continue;
    }
    if (row.table === "wp_posts") {
      const id = row.values["ID"];
      if (!id) continue;
      const postType = row.values["post_type"] ?? "";
      if (postType === "attachment") {
        attachmentUrlById.set(id, row.values["guid"] ?? "");
        continue;
      }
      if (postType !== "post" && postType !== "page") continue;
      if (row.values["post_status"] === "trash") continue; // a WordPress-deleted record isn't a real one to migrate — same judgment call Orders makes for trashed posts
      postRows.set(id, {
        postType,
        title: row.values["post_title"] ?? "",
        slug: row.values["post_name"] ?? "",
        content: row.values["post_content"] ?? "",
        excerpt: row.values["post_excerpt"] ?? "",
        status: row.values["post_status"] ?? "",
        hasPassword: !!(row.values["post_password"] ?? "").trim(),
        date: row.values["post_date"] ?? "",
        modified: row.values["post_modified"] ?? "",
        authorId: row.values["post_author"] ?? "0",
        parentId: row.values["post_parent"] ?? "0",
        menuOrder: row.values["menu_order"] ?? "0",
      });
      continue;
    }

    if (row.table === "wp_postmeta") {
      const postId = row.values["post_id"];
      const key = row.values["meta_key"];
      const value = row.values["meta_value"] ?? "";
      if (!postId || !key) continue;
      if (key === THUMBNAIL_META_KEY) { thumbnailIdByPostId.set(postId, value); continue; }
      if (key === CANONICAL_LEGACY_KEY) {
        const list = oldSlugsByPostId.get(postId) ?? [];
        if (value) list.push(value);
        oldSlugsByPostId.set(postId, list);
        continue;
      }
      if (!SEO_META_PATTERN.test(key) && !PAGE_BUILDER_META_PATTERN.test(key)) continue;
      const bag = metaByPostId.get(postId) ?? {};
      bag[key] = value;
      metaByPostId.set(postId, bag);
    }
  }

  // --- Pass 2: wp_terms + wp_term_taxonomy + wp_term_relationships
  // (categories/tags), one combined scan. ---
  const termNameById = new Map<string, string>();
  const taxonomyByTtId = new Map<string, { termId: string; taxonomy: string }>();
  const ttIdsByPostId = new Map<string, string[]>();

  for await (const row of streamSqlTables(filePath, ["wp_terms", "wp_term_taxonomy", "wp_term_relationships"])) {
    if (row.table === "wp_terms") {
      const id = row.values["term_id"];
      if (id) termNameById.set(id, row.values["name"] ?? "");
      continue;
    }
    if (row.table === "wp_term_taxonomy") {
      // Captured for every taxonomy, not just category/post_tag — a real
      // dump's term_relationships also cover unrelated taxonomies (nav
      // menu placement, product categories, etc.); only a *fully dangling*
      // relationship (its term_taxonomy_id resolves to nothing at all) is
      // genuinely "broken," not merely "not a blog category/tag."
      const ttId = row.values["term_taxonomy_id"];
      if (ttId) taxonomyByTtId.set(ttId, { termId: row.values["term_id"] ?? "", taxonomy: row.values["taxonomy"] ?? "" });
      continue;
    }
    if (row.table === "wp_term_relationships") {
      const postId = row.values["object_id"];
      const ttId = row.values["term_taxonomy_id"];
      if (!postId || !ttId) continue;
      const list = ttIdsByPostId.get(postId) ?? [];
      list.push(ttId);
      ttIdsByPostId.set(postId, list);
    }
  }

  // --- Pass 3: wp_options, narrowly (siteurl/home/permalink_structure only). ---
  let siteUrl = "";
  let permalinkStructure = "";
  for await (const row of streamSqlTables(filePath, ["wp_options"])) {
    const name = row.values["option_name"];
    if (name === "siteurl") siteUrl = siteUrl || (row.values["option_value"] ?? "");
    else if (name === "home") siteUrl = row.values["option_value"] ?? siteUrl; // "home" wins when present — the more reliable of the two for redirect purposes
    else if (name === "permalink_structure") permalinkStructure = row.values["option_value"] ?? "";
  }

  // --- Merge everything into one RawContentPost per post/page. ---
  const posts = new Map<string, RawContentPost>();
  for (const [id, post] of postRows) {
    const categories: string[] = [];
    const tags: string[] = [];
    let brokenTaxonomyCount = 0;
    for (const ttId of ttIdsByPostId.get(id) ?? []) {
      const tt = taxonomyByTtId.get(ttId);
      if (!tt) { brokenTaxonomyCount++; continue; } // dangling — this ttId doesn't exist in the file's own wp_term_taxonomy at all
      if (tt.taxonomy !== "category" && tt.taxonomy !== "post_tag") continue; // a real, resolvable relationship — just not a category/tag (e.g. nav menu placement)
      const name = termNameById.get(tt.termId);
      if (!name) { brokenTaxonomyCount++; continue; } // term_taxonomy resolved, but its term_id doesn't exist in wp_terms — also dangling
      if (tt.taxonomy === "category") categories.push(name);
      else tags.push(name);
    }

    const thumbnailId = thumbnailIdByPostId.get(id);
    const featuredImageUrl = thumbnailId ? attachmentUrlById.get(thumbnailId) ?? "" : "";

    posts.set(id, {
      id,
      postType: post.postType,
      title: post.title,
      slug: post.slug,
      content: post.content,
      excerpt: post.excerpt,
      status: post.status,
      hasPassword: post.hasPassword,
      date: post.date,
      modified: post.modified,
      authorId: post.authorId,
      authorName: authorNameById.get(post.authorId) ?? "",
      parentId: post.parentId,
      menuOrder: post.menuOrder,
      meta: metaByPostId.get(id) ?? {},
      featuredImageUrl,
      categories,
      tags,
      oldSlugs: oldSlugsByPostId.get(id) ?? [],
      brokenTaxonomyCount,
    });
  }

  return { posts, siteUrl, permalinkStructure };
}

function toFlatRow(post: RawContentPost, siteUrl: string, permalinkStructure: string, filePath: string): Record<string, string> {
  return {
    // Duplicated onto every row, same as site_url/permalink_structure above
    // — lets the blog/pages importers (which only see one row at a time via
    // engine.ts's per-row importRow(mapped, rowIndex, ctx) contract, with no
    // direct filePath of their own) lazily build+cache buildSlugPathIndex()
    // in ctx.scratch without engine.ts needing to know anything about it.
    source_file_path: filePath,
    ID: post.id,
    post_type: post.postType,
    post_title: post.title,
    post_name: post.slug,
    post_content: post.content,
    post_excerpt: post.excerpt,
    post_status: post.status,
    has_password: post.hasPassword ? "1" : "0",
    post_date: post.date,
    post_modified: post.modified,
    post_author: post.authorId,
    author_name: post.authorName,
    post_parent: post.parentId,
    menu_order: post.menuOrder,
    featured_image_url: post.featuredImageUrl,
    categories_json: JSON.stringify(post.categories),
    tags_json: JSON.stringify(post.tags),
    old_slugs_json: JSON.stringify(post.oldSlugs),
    broken_taxonomy_count: String(post.brokenTaxonomyCount),
    seo_meta_json: JSON.stringify(post.meta),
    site_url: siteUrl,
    permalink_structure: permalinkStructure,
  };
}

export async function* streamBlogRows(filePath: string): AsyncGenerator<Record<string, string>> {
  const { posts, siteUrl, permalinkStructure } = await collectContentData(filePath);
  for (const post of posts.values()) {
    if (post.postType !== "post") continue;
    yield toFlatRow(post, siteUrl, permalinkStructure, filePath);
  }
}

export async function* streamPageRows(filePath: string): AsyncGenerator<Record<string, string>> {
  const { posts, siteUrl, permalinkStructure } = await collectContentData(filePath);
  for (const post of posts.values()) {
    if (post.postType !== "page") continue;
    yield toFlatRow(post, siteUrl, permalinkStructure, filePath);
  }
}

/** Both post types at once, for the unified Content Migration Assistant — one pass instead of two. */
export async function* streamAllContentRows(filePath: string): AsyncGenerator<{ postType: "post" | "page"; row: Record<string, string> }> {
  const { posts, siteUrl, permalinkStructure } = await collectContentData(filePath);
  for (const post of posts.values()) {
    yield { postType: post.postType as "post" | "page", row: toFlatRow(post, siteUrl, permalinkStructure, filePath) };
  }
}

/**
 * slug -> new local path, across BOTH post types in this same file (a page
 * can link to a post and vice versa) — feeds redirectGeneration.ts's
 * rewriteInternalLinks() so an importer can resolve a link's *destination*
 * path, not just detect that the link exists. One more full pass over the
 * file (same cost as streamBlogRows/streamPageRows each already re-scanning
 * independently); callers build this once per import run and cache it (see
 * ctx.scratch in wooBlogImporter.ts/wooPageImporter.ts), not once per row.
 */
export async function buildSlugPathIndex(filePath: string): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  for await (const { postType, row } of streamAllContentRows(filePath)) {
    const slug = row.post_name;
    if (!slug) continue;
    index.set(slug, postType === "post" ? `/blog/${slug}` : `/${slug}`);
  }
  return index;
}
