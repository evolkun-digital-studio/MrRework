
// Shared contract every future importer (categories, customers, orders,
// reviews, blog, pages, media) plugs into. Nothing in this file — or in
// registry.ts / csv.ts / engine.ts — knows anything about Products,
// SKUs, or any other data-type specifics. That knowledge lives entirely
// inside each importer module (see products/wooProductImporter.ts).

export interface TargetField {
  key: string;
  label: string;
  required?: boolean;
  /** Lower-cased column-name aliases used for automatic mapping (Step 4). */
  aliases: string[];
  description?: string;
  /**
   * Present when the importer recognizes the source data but the current
   * database schema has nowhere to put it (e.g. WooCommerce "Weight" against
   * a Product schema with no weight field). Shown to the admin as
   * "Not supported by current schema" rather than silently dropped.
   */
  unsupported?: boolean;
}

export type RowOutcome = "imported" | "updated" | "skipped" | "failed";

export interface RowResult {
  outcome: RowOutcome;
  message?: string;
  /**
   * Optional, generic failure context an importer can attach so a stored
   * error is more than a row number — the engine has no idea what a "SKU"
   * or "product name" is, so it never derives these itself; it just carries
   * whatever the importer hands back straight into job.report.errors.
   */
  identifier?: string;
  label?: string;
  /**
   * A stable, importer-defined bucket key (e.g. "missing_required_field",
   * "parent_not_found") used to group failures in the report — deliberately
   * separate from `message`, which stays free text and can change wording
   * without breaking grouping. Absent falls back to grouping by raw message.
   */
  reasonCode?: string;
  /**
   * Rollback-prep only, optional: for an "updated" row, the fields about to
   * be overwritten, captured immediately before the write — so a future
   * rollback feature can restore them. Not read by anything today; the
   * generic engine only stores it (bounded, like `errors`), never acts on it.
   */
  snapshot?: { identifier: string; documentId: string; previousValues: Record<string, unknown> };
}

export type IssueLevel = "error" | "warning";

export interface ValidationIssue {
  row: number;
  field?: string;
  message: string;
  level: IssueLevel;
}

/** Cross-row state the engine maintains for one run and hands to every row. */
export interface ImportRunContext {
  adminUserId: string;
  duplicateStrategy: "update" | "skip";
  /** SKUs already seen earlier in this same file — for duplicate-within-file detection. */
  seenSkus: Set<string>;
  seenSlugs: Set<string>;
  /** sku -> created/updated document id, so later rows (e.g. WooCommerce
   *  variation rows) can attach themselves to an earlier row's parent. */
  skuToId: Map<string, string>;
  /**
   * Free-form scratch space for an importer's own cross-row bookkeeping
   * during validation (e.g. collecting variation->parent references or
   * image-URL counts to reconcile once the whole file has been streamed).
   * Opaque to the generic engine — only the importer that wrote to it reads
   * it back, in its own `finalizeValidation`.
   */
  scratch: Record<string, unknown>;
}

export interface ImporterModule<TMapped = Record<string, unknown>> {
  key: string;
  label: string;
  description: string;
  /** lucide-react icon name, resolved client-side from a small lookup table. */
  icon: string;
  status: "available" | "coming-soon";
  targetFields: TargetField[];
  /**
   * File extensions this importer accepts, e.g. [".csv"] or [".sql"] —
   * checked both client-side (UploadStep) and server-side (the upload
   * route). Defaults to [".csv"] when omitted, so every importer that
   * predates this field keeps working unchanged.
   */
  acceptedExtensions?: string[];
  /**
   * Optional: how this importer turns its source file into a stream of flat
   * "rows" (column name -> string value), one per logical record — the same
   * shape a CSV row already has. Defaults to the generic CSV streamer when
   * omitted. A SQL-sourced importer (e.g. customers, parsing a WordPress
   * mysqldump) provides its own: it parses + joins the relevant tables and
   * yields one flattened, CSV-shaped row per record, so everything
   * downstream — mapRow, column mapping, validateRow, importRow, the
   * engine's run loop — is completely unaware the source was ever SQL.
   */
  streamRows?: (filePath: string) => AsyncGenerator<Record<string, string>>;
  /**
   * The field on this importer's mapped row shape that uniquely identifies
   * a record — "sku" for products, "email" for customers. Used generically
   * by the upload route's best-effort within-file duplicate heads-up, which
   * otherwise has no way to know which mapped field means "identity" for an
   * arbitrary importer. Defaults to "sku".
   */
  identifierField?: string;
  /** Raw CSV row (column name -> string value) + the resolved mapping -> a normalized shape. */
  mapRow?: (raw: Record<string, string>, mapping: Record<string, string>) => TMapped;
  /** Pure validation — must not touch the database. */
  validateRow?: (mapped: TMapped, rowIndex: number, ctx: ImportRunContext) => ValidationIssue[];
  /**
   * Optional: called once after every row has already been through
   * validateRow, for checks that need the complete file — e.g. a variation
   * row whose Parent SKU only appears later on, or an image URL reused
   * across many different SKUs. Pure — no DB writes, same as validateRow.
   */
  finalizeValidation?: (ctx: ImportRunContext) => ValidationIssue[];
  /** The only place that touches the database for this row. */
  importRow?: (mapped: TMapped, rowIndex: number, ctx: ImportRunContext) => Promise<RowResult>;
}

export interface CsvPreview {
  totalRows: number;
  columns: string[];
  rows: Record<string, string>[];
  warnings: string[];
  /**
   * Capped, best-effort within-file duplicate count computed right after
   * upload using the auto-detected mapping's identity field ("sku" for
   * products, "email" for customers, etc.) — a quick heads-up, not
   * authoritative. The real duplicate check (against the database too)
   * happens in the Validation step.
   */
  duplicateCount?: number;
}
