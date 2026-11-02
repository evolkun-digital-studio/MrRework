import sanitizeHtml from "sanitize-html";

// Blog post / page `content` is imported verbatim from a WordPress SQL
// export (see src/lib/import-export/content/) — untrusted HTML from an
// external system, rendered to every storefront visitor via
// dangerouslySetInnerHTML. Sanitized here, at the render boundary, rather
// than at import time, so the original export data stays intact for
// re-processing/audit and only what actually reaches a browser is cleaned.
export function sanitizeContentHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "mark", "small", "sub", "sup",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "blockquote", "pre", "code",
      "a", "img", "figure", "figcaption",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td",
      "div", "span",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "width", "height", "loading"],
      "*": ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
    },
  });
}
