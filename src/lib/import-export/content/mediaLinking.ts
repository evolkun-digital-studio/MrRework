// Pure media-reconnection decision logic — no database access. "Reconnect
// imported pages/posts to the Media collection. Never duplicate existing
// media": this module never downloads or creates a Media document (that's
// the Media Migration Manager's job, already built, deliberately not
// duplicated here) — it only decides, given an already-fetched
// `originalUrl -> local url` lookup (built by the caller via
// `Media.find({ originalUrl: { $in: [...] } })`, the exact dedup key the
// Media Migration Manager established), whether a post's featured image
// already has a local copy to point at.

export interface MediaLinkResult {
  url: string;
  matched: boolean;
}

export function resolveFeaturedImage(originalUrl: string, mediaUrlByOriginalUrl: Map<string, string>): MediaLinkResult {
  if (!originalUrl) return { url: "", matched: false };
  const hit = mediaUrlByOriginalUrl.get(originalUrl);
  if (hit) return { url: hit, matched: true };
  // No local copy exists yet — the original external URL is preserved
  // as-is (better than an empty field) and reported as unmatched by the
  // caller (see "missing featured images" / "broken media references" in
  // the Compatibility Analyzer), never silently dropped.
  return { url: originalUrl, matched: false };
}
