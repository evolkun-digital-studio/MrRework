// Pure redirect-mapping generation — no database access, no file I/O.
// "Automatically generate redirect mappings... for future 301 redirects":
// this module only ever *computes* `RedirectCandidate` objects; the caller
// (importer/analyzer/preview/repair script) decides whether/how to persist
// them as `Redirect` documents. Deduplication (the same `fromPath` produced
// by more than one post, e.g. two posts sharing a category) is the caller's
// job too — every generator here is a pure function over one input, so the
// same fromPath naturally recurs when the same input recurs; collapsing
// that is a Set operation at the call site, not something this module needs
// to know about.

export type RedirectType = "permalink" | "query-id" | "product" | "category" | "tag" | "author" | "custom";

export interface RedirectCandidate {
  fromPath: string;
  toPath: string;
  type: RedirectType;
  sourceId: string;
}

/** Normalizes any absolute old-site URL (or bare path) into a site-relative path, stripping the old site's own base URL when known. */
export function toRelativePath(url: string, siteUrl: string): string {
  if (!url) return "";
  const trimmedSite = siteUrl.replace(/\/$/, "");
  if (trimmedSite && url.startsWith(trimmedSite)) {
    const rest = url.slice(trimmedSite.length);
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return url.startsWith("/") ? url : `/${url}`;
  }
}

function buildDatePermalink(dateStr: string, slug: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return `/${slug}/`;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `/${y}/${m}/${slug}/`;
}

export type PermalinkStructure = "postname" | "date-postname";

/**
 * Detects the old site's permalink structure from `wp_options.permalink_structure`
 * — the two most common real-world patterns. Anything else (numeric,
 * custom) falls back to plain postname, the safer of the two guesses since
 * it's WordPress's own single most common default.
 */
export function detectPermalinkStructure(rawStructure: string): PermalinkStructure {
  if (/%year%.*%monthnum%.*%postname%/.test(rawStructure)) return "date-postname";
  return "postname";
}

/**
 * Every redirect a single imported post/page should produce: the numeric
 * `?p=<ID>` link (always present, always reliable — WordPress accepts this
 * regardless of permalink settings), the derived old permalink (only
 * emitted when it actually differs from the new path — no point redirecting
 * a URL to itself), and one more per historical slug the post has ever had
 * (`_wp_old_slug`), covering "old permalink" beyond just the post's current slug.
 */
export function generatePostRedirects(
  post: { id: string; slug: string; date: string; oldSlugs: string[] },
  newPath: string,
  permalinkStructure: PermalinkStructure
): RedirectCandidate[] {
  const candidates: RedirectCandidate[] = [{ fromPath: `/?p=${post.id}`, toPath: newPath, type: "query-id", sourceId: post.id }];

  const slugs = [post.slug, ...post.oldSlugs].filter(Boolean);
  for (const slug of new Set(slugs)) {
    const oldPath = permalinkStructure === "date-postname" && post.date ? buildDatePermalink(post.date, slug) : `/${slug}/`;
    if (oldPath !== newPath) candidates.push({ fromPath: oldPath, toPath: newPath, type: "permalink", sourceId: post.id });
  }

  return candidates;
}

// Category/tag/author *archive* pages (a listing of every post in one
// category/tag/author) don't exist on this storefront — only a single
// unfiltered blog index (/blog) and per-post pages do — so these redirect
// to a sensible fallback (the homepage by default) rather than a page that
// doesn't exist, honestly documented rather than fabricating a destination.
const NO_ARCHIVE_FALLBACK = "/";

export function generateCategoryRedirect(slug: string, fallbackPath: string = NO_ARCHIVE_FALLBACK): RedirectCandidate {
  return { fromPath: `/category/${slug}/`, toPath: fallbackPath, type: "category", sourceId: slug };
}

export function generateTagRedirect(slug: string, fallbackPath: string = NO_ARCHIVE_FALLBACK): RedirectCandidate {
  return { fromPath: `/tag/${slug}/`, toPath: fallbackPath, type: "tag", sourceId: slug };
}

export function generateAuthorRedirect(usernameOrId: string, fallbackPath: string = NO_ARCHIVE_FALLBACK): RedirectCandidate {
  return { fromPath: `/author/${usernameOrId}/`, toPath: fallbackPath, type: "author", sourceId: usernameOrId };
}

/**
 * "Internal links preserved where possible" — rewrites an internal-looking
 * href/src (either an absolute URL under the old site's own siteUrl, or
 * already a root-relative path — same internal/external test
 * wooContentSqlAnalyzer.ts's extractInternalLinkPaths() uses for broken-link
 * detection) to the new local path, when the linked slug is known within
 * this same import (pathBySlug, from buildSlugPathIndex()). Everything else
 * — external domains, unrecognized slugs, inline image URLs (which won't
 * match any post/page slug) — is left exactly as imported, not guaranteed,
 * per the task's own "where possible" wording.
 */
export function rewriteInternalLinks(content: string, siteUrl: string, pathBySlug: Map<string, string>): string {
  if (!content || !pathBySlug.size) return content;
  const trimmedSite = siteUrl.replace(/\/$/, "");
  return content.replace(/(href|src)=(["'])([^"']+)\2/g, (match, attr, quote, url) => {
    let internalPath: string | null = null;
    if (trimmedSite && url.startsWith(trimmedSite)) internalPath = url.slice(trimmedSite.length) || "/";
    else if (url.startsWith("/") && !url.startsWith("//")) internalPath = url;
    if (!internalPath) return match; // external domain — untouched

    const bareSlug = internalPath.replace(/^\/|\/$/g, "").split("/").pop() ?? "";
    const newPath = bareSlug ? pathBySlug.get(bareSlug) : undefined;
    return newPath ? `${attr}=${quote}${newPath}${quote}` : match;
  });
}

/**
 * WooCommerce product URL redirects — part of this module's supported
 * redirect-type vocabulary (per the task's explicit "Support: ... WooCommerce
 * URLs" requirement), but never called by the blog/page importers
 * themselves, which have no product source data to drive it from. Exists
 * for reuse by a future pass over Product data (see ADMIN_CMS.md's
 * Remaining Limitations) — kept here, tested, and exported rather than
 * built speculatively into an importer that has nothing to feed it.
 */
export function generateProductRedirect(oldSlug: string, newSlug: string): RedirectCandidate {
  return { fromPath: `/product/${oldSlug}/`, toPath: `/product/${newSlug}`, type: "product", sourceId: oldSlug };
}
