import { memo } from "react";

// Single render surface for already-sanitized imported HTML (Product
// descriptions, Blog posts, CMS Pages — and, later, Collections/Brands/
// Categories if they ever grow a rich-text field). Callers are responsible
// for sanitizing (sanitizeContentHtml, untouched by this component) and any
// whitespace normalization before this ever sees the string; this component
// only applies the shared `.prose-content` typography (src/app/globals.css)
// consistently everywhere instead of each page repeating its own div.
//
// Memoized — `html` is a stable string computed once per server render, so
// this subtree shouldn't re-render/re-diff every time an unrelated client
// state change (e.g. ProductDetail's qty/color/size) re-renders its parent.
function RichContent({ html, className = "" }: { html: string; className?: string }) {
  return <div className={`prose-content ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default memo(RichContent);
