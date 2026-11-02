import "server-only";

// The pluggable-source contract — deliberately the same shape of idea as
// ImporterModule in src/lib/import-export/types.ts: a registry entry per
// data type, only some of them wired up to real logic, the rest sitting as
// "coming-soon" placeholders that need nothing but a new file + one
// registry line to activate later.

export interface MediaReference {
  sourceType: string; // "product" | "category" | "collection" | "blog" | "page" | "customer-avatar" | "review" | ...
  sourceId: string;
  field: string; // "images" | "hoverImage" | "image" | "avatar" | ...
  index?: number; // for array fields like Product.images[]
  url: string;
  altText?: string;
  title?: string;
}

export interface MediaSourceModule {
  key: string;
  label: string;
  description: string;
  status: "available" | "coming-soon";
  /** Read-only — yields every external-URL reference this source currently has. */
  collectReferences?: () => AsyncGenerator<MediaReference>;
  /** Writes the new local media URL back onto the one referencing document/field. */
  applyReference?: (ref: MediaReference, localUrl: string) => Promise<void>;
}

export type DownloadOutcome = "downloaded" | "reused" | "duplicate" | "skipped" | "failed";

export interface DownloadResult {
  outcome: DownloadOutcome;
  url: string;
  mediaId?: string;
  localUrl?: string;
  bytes?: number;
  message?: string;
  /** true for permanent failures (404, bad MIME, oversized, SSRF-blocked) — these never get retried. */
  permanent?: boolean;
}
