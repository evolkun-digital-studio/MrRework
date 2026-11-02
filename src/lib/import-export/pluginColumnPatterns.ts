// Deliberately dependency-free (no fs, no other import-export modules) so
// it's safe to import from a "use client" component (MappingStep.tsx)
// *and* from server code (mapping.ts) — unlike mapping.ts itself, which
// pulls in sqlParser.ts's `fs` import and would break a client bundle.
//
// Recognizes CSV columns that are almost always page-builder/theme/SEO
// plugin metadata (Woodmart, Elementor, Rank Math, generic postmeta dumps)
// rather than real product data — the kind of column a WooCommerce export
// carries dozens of, and that should never be auto-matched onto a real
// product field, and should be flagged if an admin maps one manually.

const PLUGIN_METADATA_PATTERNS: RegExp[] = [
  /^meta:\s*/i,
  /^_?attribute:\s*/i,
  /rank_math/i,
  /_elementor/i,
  /woodmart/i,
];

export function isPluginMetadataColumn(column: string): boolean {
  return PLUGIN_METADATA_PATTERNS.some((pattern) => pattern.test(column));
}
