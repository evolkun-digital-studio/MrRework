// Some WooCommerce/CSV exports (confirmed directly in the MrRework
// product CSV — see storage/imports/*/original.csv) contain literal escaped
// whitespace as plain text characters rather than real control characters:
// e.g. the two characters "\" + "n" (and, in this dataset, a stray real
// carriage-return byte immediately before it — CR + literal "\n") instead
// of an actual line break. Left alone, these render as visible "\n" text in
// the browser once HTML is rendered correctly (see the earlier HTML-escaping
// fix in ProductDetail.tsx) — HTML has nothing that interprets a literal
// backslash + letter as a line break, so the glyphs render as-is.
//
// This is a distinct concern from HTML sanitization (src/lib/sanitizeContent.ts,
// intentionally untouched) — it runs BEFORE that sanitizer, normalizing text
// so real line breaks become visible <br> tags the sanitizer's own allowlist
// already permits, without altering any of the sanitizer's HTML-safety rules.
export function normalizeEscapedWhitespace(html: string): string {
  let out = html
    // Real CR immediately followed by literal "\n" text — the exact pattern
    // found in the source data (a real 0x0D byte, then backslash + "n").
    // Handled first so it collapses to one <br>, not two.
    .replace(/\r\\n/g, "<br>")
    // Fully-literal "\r\n" (both escaped as text, no real control byte).
    .replace(/\\r\\n/g, "<br>")
    // Remaining standalone literal "\n" / "\r" (2 characters each).
    .replace(/\\n/g, "<br>")
    .replace(/\\r/g, "<br>")
    // Any real newlines left — either ones the source already had, or the
    // real "\n\n" the product mapping joins short + long description with
    // (src/lib/import-export/products/wooProductMapping.ts) — otherwise
    // invisible once rendered as HTML (browsers collapse raw whitespace).
    .replace(/\r\n|\r|\n/g, "<br>")
    // Literal "\t" (2 characters) — a real tab.
    .replace(/\\t/g, "\t");

  // The conversions above are purely line-oriented and don't know about HTML
  // structure. Real WooCommerce exports are pretty-printed — a real newline
  // sits between almost every tag purely for source readability (confirmed
  // directly: some products nest 8-9 empty wrapper <div>s, each pair
  // separated by exactly one such newline), on top of newlines that are
  // genuinely meaningful line breaks within plain-text stretches.
  //
  // A <br> with nothing but whitespace between it and a tag on BOTH sides
  // (right after a `>`, right before a `<`) is exactly that: pretty-print
  // formatting, not a break the content relies on — the tags around it
  // already get their own spacing from .prose-content's CSS. Strip those
  // entirely, first, before touching anything else.
  out = out.replace(/>(?:\s*<br\s*\/?>\s*)+(?=<)/gi, ">");

  // Any remaining run of 2+ consecutive <br> (sitting in actual plain-text
  // content, not between tags) collapses to exactly 2 — enough to keep a
  // deliberate blank-line paragraph gap, never a taller stack.
  out = out.replace(/(?:<br\s*\/?>\s*){2,}/gi, "<br><br>");

  return out;
}
