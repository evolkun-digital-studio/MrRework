import type { ImporterModule } from "./types";
import { wooProductImporter } from "./products/wooProductImporter";
import { wooCustomerImporter } from "./customers/wooCustomerImporter";
import { wooOrderImporter } from "./orders/wooOrderImporter";
import { wooReviewImporter } from "./reviews/wooReviewImporter";
import { wooBlogImporter } from "./content/wooBlogImporter";
import { wooPageImporter } from "./content/wooPageImporter";
import { streamBlogRows } from "./content/wooContentSqlSource";

// The single place a new importer gets plugged in. The dashboard cards, the
// wizard's "Choose Import Type" step, and GET /api/admin/import-export/registry
// all render from this array — adding a real importer later means adding one
// entry here (with mapRow/validateRow/importRow implemented) and flipping its
// status to "available"; no UI code needs to change.
// Each importer's mapRow can return its own specific shape (e.g. WooMappedRow)
// rather than the generic default — the registry array itself is intentionally
// loosely typed here since it holds a heterogeneous mix of real and stub modules.
export const IMPORTERS: ImporterModule<any>[] = [
  wooProductImporter,
  {
    key: "categories", label: "Categories", icon: "FolderTree", status: "coming-soon",
    description: "Import categories and subcategories in bulk.",
    targetFields: [],
  },
  wooCustomerImporter,
  wooOrderImporter,
  wooReviewImporter,
  wooBlogImporter,
  wooPageImporter,
  // Read-only — the unified Content Migration Assistant's own import type.
  // Deliberately has no mapRow/validateRow/importRow: it can be analyzed and
  // previewed (composing the real Blog + Pages analyzers/mappers above from
  // one uploaded file) but never actually *run* — engine.ts's runImportJob
  // already fails gracefully for any importer missing importRow, which is
  // exactly the "consult here, import via the real Blog/Pages wizard"
  // posture every other standalone Migration Assistant already has.
  {
    key: "content", label: "Content & SEO", icon: "FileSearch", status: "available",
    description: "A unified, read-only consultation across Blog Posts + Pages — SEO coverage, redirect summary, media summary. Nothing is imported here; run the Blog Posts / Pages importers to actually write data.",
    targetFields: [], acceptedExtensions: [".sql"],
    // `streamRows` only, deliberately — no mapRow/validateRow/importRow (see
    // above). Needed so the upload route's own preview-building step uses
    // the generic SQL-aware row builder instead of falling back to the CSV
    // parser (`parseHeaderAndPreview`) on a `.sql` file, which would either
    // throw or produce garbage. `job.preview` built from this is never
    // actually read by the Content Migration Assistant page — it calls
    // `/migration-plan` and `/preview-content` directly, each independently
    // re-reading the file — so which stream this points at doesn't matter
    // beyond "don't crash the upload."
    streamRows: streamBlogRows,
  },
  {
    key: "media", label: "Media", icon: "Image", status: "coming-soon",
    description: "Bulk-import media library assets.",
    targetFields: [],
  },
];

export function getImporter(key: string): ImporterModule | undefined {
  return IMPORTERS.find((m) => m.key === key);
}

/** Safe, client-shippable subset — never leaks server-only function references. */
export function serializeImporters() {
  return IMPORTERS.map(({ key, label, description, icon, status, targetFields, acceptedExtensions }) => ({
    key, label, description, icon, status,
    acceptedExtensions: acceptedExtensions ?? [".csv"],
    targetFields: targetFields.map(({ key, label, required, description, unsupported }) => ({ key, label, required, description, unsupported })),
  }));
}
