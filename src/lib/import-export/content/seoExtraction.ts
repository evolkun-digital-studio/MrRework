// Pure SEO metadata extraction — no database access, no file I/O. Given the
// raw `_yoast_wpseo_*`/`rank_math_*`/`_aioseo_*` postmeta bag
// wooContentSqlSource.ts already collected for one post, decides which
// plugin's data to trust (first one that actually has any) and normalizes
// it onto one shared field vocabulary — the same `seoTitle`/`seoDescription`
// naming Product/Category/BlogPost already established, extended with the
// OpenGraph/Twitter/canonical/robots/focus-keyword/schema fields this phase
// needs. Every recognized-but-unmapped SEO-plugin key (including keys
// belonging to a plugin that wasn't chosen, e.g. mid-migration between two
// SEO plugins) is preserved verbatim in `unsupportedSeoMeta` — "store
// unsupported fields safely without data loss," not silently dropped.
//
// No `server-only` guard — reused as-is by the standalone repair script.

export interface ExtractedSeo {
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  robots: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
  focusKeyword: string;
  schema: Record<string, unknown> | null;
  unsupportedSeoMeta: Record<string, string>;
  seoSource: "yoast" | "rankmath" | "aioseo" | "none";
}

const YOAST = {
  title: "_yoast_wpseo_title", description: "_yoast_wpseo_metadesc", canonical: "_yoast_wpseo_canonical",
  robotsNoindex: "_yoast_wpseo_meta-robots-noindex", robotsNofollow: "_yoast_wpseo_meta-robots-nofollow",
  ogTitle: "_yoast_wpseo_opengraph-title", ogDescription: "_yoast_wpseo_opengraph-description", ogImage: "_yoast_wpseo_opengraph-image",
  twitterTitle: "_yoast_wpseo_twitter-title", twitterDescription: "_yoast_wpseo_twitter-description", twitterImage: "_yoast_wpseo_twitter-image",
  focusKeyword: "_yoast_wpseo_focuskw",
} as const;

const RANKMATH = {
  title: "rank_math_title", description: "rank_math_description", canonical: "rank_math_canonical_url", robots: "rank_math_robots",
  ogTitle: "rank_math_facebook_title", ogDescription: "rank_math_facebook_description", ogImage: "rank_math_facebook_image",
  twitterTitle: "rank_math_twitter_title", twitterDescription: "rank_math_twitter_description", twitterImage: "rank_math_twitter_image",
  focusKeyword: "rank_math_focus_keyword",
} as const;

// Best-effort legacy (pre-v4, postmeta-based) AIOSEO keys — modern AIOSEO
// (v4+) moved SEO data into its own `wp_aioseo_posts` table, outside this
// importer's required source tables; see ADMIN_CMS.md § SEO Extraction for
// why that's a documented limitation rather than something attempted here.
const AIOSEO = {
  title: "_aioseo_title", description: "_aioseo_description", canonical: "_aioseo_canonical_url",
  noindex: "_aioseo_noindex", nofollow: "_aioseo_nofollow",
  ogTitle: "_aioseo_og_title", ogDescription: "_aioseo_og_description", ogImage: "_aioseo_og_image",
  twitterTitle: "_aioseo_twitter_title", twitterDescription: "_aioseo_twitter_description", twitterImage: "_aioseo_twitter_image",
  focusKeyword: "_aioseo_focus_keyword",
} as const;

function truthy(v: string): boolean {
  const n = v.trim().toLowerCase();
  return n === "1" || n === "true" || n === "on" || n === "yes";
}

// Minimal, purpose-built extractor for exactly the shape a serialized PHP
// string-list looks like (`a:N:{i:0;s:L:"value";...}`) — not a general PHP
// unserializer, mirrors wooCustomerMapping.ts's decodeWpCapabilities. Only
// ever reads matched substrings, never executed as code.
function extractPhpArrayStrings(serialized: string): string[] {
  const values: string[] = [];
  const re = /s:\d+:"([^"]*)";/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(serialized)) !== null) values.push(match[1]);
  return values;
}

function combineRobots(noindex: boolean, nofollow: boolean): string {
  return `${noindex ? "noindex" : "index"},${nofollow ? "nofollow" : "follow"}`;
}

function hasAny(meta: Record<string, string>, keys: readonly string[]): boolean {
  return keys.some((k) => (meta[k] ?? "").trim() !== "");
}

export function extractSeo(meta: Record<string, string>): ExtractedSeo {
  const yoastKeys = Object.values(YOAST);
  const rankMathKeys = Object.values(RANKMATH);
  const aioseoKeys = Object.values(AIOSEO);

  let seoSource: ExtractedSeo["seoSource"] = "none";
  let usedKeys: readonly string[] = [];
  let seoTitle = "", seoDescription = "", canonicalUrl = "", robots = "index,follow";
  let ogTitle = "", ogDescription = "", ogImage = "";
  let twitterTitle = "", twitterDescription = "", twitterImage = "", focusKeyword = "";

  if (hasAny(meta, yoastKeys)) {
    seoSource = "yoast"; usedKeys = yoastKeys;
    seoTitle = meta[YOAST.title] ?? ""; seoDescription = meta[YOAST.description] ?? ""; canonicalUrl = meta[YOAST.canonical] ?? "";
    robots = combineRobots(truthy(meta[YOAST.robotsNoindex] ?? ""), truthy(meta[YOAST.robotsNofollow] ?? ""));
    ogTitle = meta[YOAST.ogTitle] ?? ""; ogDescription = meta[YOAST.ogDescription] ?? ""; ogImage = meta[YOAST.ogImage] ?? "";
    twitterTitle = meta[YOAST.twitterTitle] ?? ""; twitterDescription = meta[YOAST.twitterDescription] ?? ""; twitterImage = meta[YOAST.twitterImage] ?? "";
    focusKeyword = meta[YOAST.focusKeyword] ?? "";
  } else if (hasAny(meta, rankMathKeys)) {
    seoSource = "rankmath"; usedKeys = rankMathKeys;
    seoTitle = meta[RANKMATH.title] ?? ""; seoDescription = meta[RANKMATH.description] ?? ""; canonicalUrl = meta[RANKMATH.canonical] ?? "";
    const rawRobots = meta[RANKMATH.robots] ?? "";
    if (rawRobots) {
      const flags = extractPhpArrayStrings(rawRobots).map((f) => f.toLowerCase());
      robots = combineRobots(flags.includes("noindex"), flags.includes("nofollow"));
    }
    ogTitle = meta[RANKMATH.ogTitle] ?? ""; ogDescription = meta[RANKMATH.ogDescription] ?? ""; ogImage = meta[RANKMATH.ogImage] ?? "";
    twitterTitle = meta[RANKMATH.twitterTitle] ?? ""; twitterDescription = meta[RANKMATH.twitterDescription] ?? ""; twitterImage = meta[RANKMATH.twitterImage] ?? "";
    focusKeyword = meta[RANKMATH.focusKeyword] ?? "";
  } else if (hasAny(meta, aioseoKeys)) {
    seoSource = "aioseo"; usedKeys = aioseoKeys;
    seoTitle = meta[AIOSEO.title] ?? ""; seoDescription = meta[AIOSEO.description] ?? ""; canonicalUrl = meta[AIOSEO.canonical] ?? "";
    robots = combineRobots(truthy(meta[AIOSEO.noindex] ?? ""), truthy(meta[AIOSEO.nofollow] ?? ""));
    ogTitle = meta[AIOSEO.ogTitle] ?? ""; ogDescription = meta[AIOSEO.ogDescription] ?? ""; ogImage = meta[AIOSEO.ogImage] ?? "";
    twitterTitle = meta[AIOSEO.twitterTitle] ?? ""; twitterDescription = meta[AIOSEO.twitterDescription] ?? ""; twitterImage = meta[AIOSEO.twitterImage] ?? "";
    focusKeyword = meta[AIOSEO.focusKeyword] ?? "";
  }

  const usedKeySet = new Set(usedKeys);
  const unsupportedSeoMeta: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!usedKeySet.has(key) && value) unsupportedSeoMeta[key] = value;
  }

  // Raw schema.org/JSON-LD blobs some plugins export as JSON-encoded
  // postmeta — parsed opportunistically (never assumed present), stored
  // verbatim, never re-derived.
  let schema: Record<string, unknown> | null = null;
  const schemaKey = Object.keys(meta).find((k) => /schema/i.test(k) && meta[k]);
  if (schemaKey) {
    try {
      const parsed = JSON.parse(meta[schemaKey]);
      if (parsed && typeof parsed === "object") schema = parsed;
    } catch {
      // Not JSON (some plugins store schema as serialized PHP instead) —
      // preserved as-is via unsupportedSeoMeta above rather than lost.
    }
  }

  return {
    seoTitle, seoDescription, canonicalUrl, robots,
    ogTitle, ogDescription, ogImage,
    twitterTitle, twitterDescription, twitterImage, focusKeyword,
    schema,
    unsupportedSeoMeta,
    seoSource,
  };
}
