import { dbConnect } from "@/lib/mongodb";
import { ProductModel } from "@/models/Product";
import { CategoryModel } from "@/models/Category";
import { streamRows } from "../csv";
import { TARGET_FIELDS } from "./wooProductImporter";

// A read-only "dry run" analyzer for a WooCommerce Product CSV export.
// Deliberately separate from wooProductImporter.ts: that file only knows
// about the subset of columns our schema can actually receive, while this
// file's job is to describe the *whole* file — including WooCommerce
// concepts (virtual/downloadable products, Yoast SEO meta, tax/shipping
// classes) that have no home in our schema at all. Nothing in this module
// ever calls .create()/.save()/.updateOne() — every Mongo call here is a
// .find()/.lean() read, used only to report what an import *would* do.

const norm = (s: string) => s.trim().toLowerCase();

function slugify(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");
}

function splitList(v: string): string[] {
  return v.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
}

function truthy(v: string): boolean {
  const n = v.trim().toLowerCase();
  return n === "1" || n === "yes" || n === "true" || n === "y";
}

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

export interface AnalysisIssue { row: number; sku: string; message: string; level: "error" | "warning" }
export interface CategoryRow { name: string; count: number; existsInDb: boolean; nested: boolean }
export interface AttributeRow { name: string; valueCount: number; sampleValues: string[]; supported: boolean; mappingExists: boolean }
export interface ColumnRow { name: string; detectedType: string; mappedField: string | null; classification: "supported" | "ignored" | "manual-mapping-needed"; note?: string }
export interface RiskItem { severity: "critical" | "warning" | "info"; message: string; count: number }
export interface SeoFieldStatus { detected: boolean; columns: string[]; rowsPopulated: number }

export interface AnalysisReport {
  fileName: string;
  totalRows: number;
  analyzedAt: string;

  general: {
    totalProducts: number; simpleProducts: number; variableProducts: number;
    draftProducts: number; publishedProducts: number; privateProducts: number;
    featuredProducts: number; virtualProducts: number; downloadableProducts: number;
  };

  quality: {
    missingName: number; missingSku: number; duplicateSku: number; duplicateSlug: number;
    missingPrice: number; invalidPrice: number; missingCategories: number; withoutImages: number;
    missingStock: number; missingAttributes: number; missingVariations: number;
    emptyDescriptions: number; invalidStatus: number;
    issues: AnalysisIssue[]; issuesTruncated: boolean;
  };

  categories: { found: number; existing: number; toCreate: number; nested: number; duplicateGroups: string[][]; list: CategoryRow[] };

  attributes: AttributeRow[];

  variations: {
    variableProducts: number; variationRows: number; productsMissingParentColumn: number;
    orphanVariations: number; invalidAttributeCombinations: number; duplicateVariations: number;
  };

  images: {
    featuredImageCount: number; galleryImageCount: number; totalImageReferences: number;
    distinctImageUrls: number; brokenUrlCount: number; duplicateUrlCount: number; altTagsSupported: false;
  };

  seo: {
    metaTitle: SeoFieldStatus; metaDescription: SeoFieldStatus; focusKeyword: SeoFieldStatus;
    canonicalUrl: SeoFieldStatus; openGraph: SeoFieldStatus; schema: SeoFieldStatus;
  };

  columns: ColumnRow[];
  unsupported: { field: string; reason: string }[];

  databaseImpact: {
    productsToCreate: number; productsToUpdate: number; productsToSkip: number;
    categoriesToCreate: number; collectionsToCreate: number; imagesReferenced: number;
    estimatedImportTimeMs: number;
  };

  risks: RiskItem[];
  summary: { score: number; label: "Ready to Import" | "Needs Review" | "High Risk" };
}

// ---------------------------------------------------------------------------
// Known WooCommerce-specific column names with no equivalent in our schema.
// Only surfaced in the report when actually present in the analyzed file.
// ---------------------------------------------------------------------------

const UNSUPPORTED_WOO_COLUMNS: { match: RegExp; field: string; reason: string }[] = [
  { match: /^id$/i, field: "ID", reason: "WordPress's internal post ID — SKU is the identity key used for matching instead." },
  { match: /^is virtual\??$/i, field: "Is virtual?", reason: "The Product schema has no digital/service product concept — every product is physical." },
  { match: /^is downloadable\??$/i, field: "Is downloadable?", reason: "No downloadable-file support exists on the Product schema." },
  { match: /^download limit$/i, field: "Download limit", reason: "Only relevant to downloadable products, which aren't supported." },
  { match: /^download expiry$/i, field: "Download expiry days", reason: "Only relevant to downloadable products, which aren't supported." },
  { match: /^tax status$/i, field: "Tax status", reason: "No tax-status field — see StoreSettings.taxRate for the store-wide rate instead." },
  { match: /^tax class$/i, field: "Tax class", reason: "No per-product tax class concept." },
  { match: /^shipping class$/i, field: "Shipping class", reason: "No per-product shipping class — shipping is a flat/express rate store-wide." },
  { match: /^upsells?$/i, field: "Upsells", reason: "No product-relationship/recommendation field exists yet." },
  { match: /^cross-sells?$/i, field: "Cross-sells", reason: "No product-relationship field exists yet." },
  { match: /^grouped products?$/i, field: "Grouped products", reason: "No product-grouping concept exists on the Product schema." },
  { match: /^purchase note$/i, field: "Purchase note", reason: "No post-purchase messaging field on Order or Product." },
  { match: /^position$|^menu order$/i, field: "Position / Menu order", reason: "Products aren't manually orderable — sort is driven by createdAt/salesCount/etc." },
  { match: /^visibility in catalog$/i, field: "Visibility in catalog", reason: "Only publish/draft (via Published) is supported — no separate catalog/search visibility toggle." },
  { match: /^is featured\??$/i, field: "Is featured?", reason: "No featured-product flag on the Product schema — use isBestSeller/isNew/isLimited tags instead, or promote via Collections." },
  { match: /^low stock amount$/i, field: "Low stock amount", reason: "No per-product low-stock threshold field." },
  { match: /^backorders allowed\??$/i, field: "Backorders allowed?", reason: "No backorder concept — a product is simply in or out of stock." },
  { match: /^sold individually\??$/i, field: "Sold individually?", reason: "No per-product max-quantity-per-order restriction exists." },
  { match: /^allow customer reviews\??$/i, field: "Allow customer reviews?", reason: "Reviews are controlled store-wide, not per product." },
  { match: /^date sale price (starts|ends)$/i, field: "Sale price schedule", reason: "Sale price has no start/end date — the Sale Price column applies immediately and indefinitely." },
  { match: /weight/i, field: "Weight", reason: "No weight field on the Product schema." },
  { match: /^(length|width|height)( \(cm\))?$/i, field: "Dimensions (L/W/H)", reason: "No dimensions field on the Product schema." },
  { match: /^external url$|^button text$/i, field: "External product fields", reason: "Affiliate/external product type isn't supported." },
  { match: /^attribute \d+ visible\??$/i, field: "Attribute N visible", reason: "Every mapped attribute value is always shown — there's no per-attribute visibility toggle." },
  { match: /^attribute \d+ global$/i, field: "Attribute N global", reason: "No distinction between global and custom product attributes — all are treated the same." },
];

const SEO_PATTERNS = {
  metaTitle: [/yoast_wpseo_title/i, /^seo title$/i, /^meta title$/i],
  metaDescription: [/yoast_wpseo_metadesc/i, /^seo description$/i, /^meta description$/i],
  focusKeyword: [/yoast_wpseo_focuskw/i, /^focus keyword$/i],
  canonicalUrl: [/yoast_wpseo_canonical/i, /^canonical url$/i],
} as const;

function detectColumnType(name: string): string {
  const n = name.toLowerCase();
  if (/^(regular |sale )?price$/.test(n) || (/stock/.test(n) && !/status/.test(n))) return "number";
  if (/\?$/.test(n) || /^(published|featured)$/.test(n)) return "boolean (1/0)";
  if (/image|url|permalink/.test(n)) return "url";
  if (/categories|tags|attribute.*value/.test(n)) return "list";
  if (/^meta:/.test(n)) return "meta";
  return "text";
}

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

const ISSUE_CAP = 300;

export async function analyzeWooCsv(filePath: string, fileName: string): Promise<AnalysisReport> {
  let headerIndex: Map<string, string> | null = null;
  const getCol = (row: Record<string, string>, ...candidates: string[]): string => {
    if (!headerIndex) return "";
    for (const c of candidates) {
      const real = headerIndex.get(norm(c));
      if (real !== undefined) return row[real] ?? "";
    }
    return "";
  };

  // Accumulators — all bounded by distinct-value cardinality (SKUs, category
  // names, attribute names, image URLs), never by row count directly, and
  // never holding full row objects.
  let totalRows = 0;
  let nonVariationRowCount = 0;
  let simpleProducts = 0, variableProducts = 0;
  let draftProducts = 0, publishedProducts = 0, privateProducts = 0;
  let featuredProducts = 0, virtualProducts = 0, downloadableProducts = 0;

  let missingName = 0, missingSku = 0, missingPrice = 0, invalidPrice = 0;
  let blockingIssueRows = 0; // rows that can't be created OR updated, regardless of duplicateStrategy
  let missingCategories = 0, withoutImages = 0, missingStock = 0, missingAttributes = 0;
  let emptyDescriptions = 0, invalidStatus = 0;
  const issues: AnalysisIssue[] = [];
  const addIssue = (row: number, sku: string, message: string, level: "error" | "warning") => {
    if (issues.length < ISSUE_CAP) issues.push({ row, sku, message, level });
  };

  const skuCounts = new Map<string, number>();
  const slugGroups = new Map<string, Set<string>>(); // slug -> distinct raw names mapping to it
  const nonVariationSkus = new Set<string>();
  const blockedSkus = new Set<string>(); // SKUs with at least one blocking issue (missing/invalid price) — excluded from create/update estimates
  const variableProductSkus = new Set<string>();

  const categoryTokenCounts = new Map<string, number>();
  const categoryNormToRaw = new Map<string, Set<string>>();

  const attributeValues = new Map<string, Set<string>>();
  const parentDeclaredAttrs = new Map<string, Map<string, Set<string>>>(); // parentSkuLower -> attrName -> values

  interface VariationRecord { row: number; sku: string; parentSku: string; size: string; color: string }
  const variationRecords: VariationRecord[] = [];
  const variationDedupeKeys = new Set<string>();
  let duplicateVariations = 0;

  let featuredImageCount = 0, galleryImageCount = 0, totalImageReferences = 0;
  const imageUrlCounts = new Map<string, number>();
  let brokenUrlCount = 0;

  let seoMetaTitleCol: string | undefined, seoMetaDescCol: string | undefined, seoFocusKwCol: string | undefined, seoCanonicalCol: string | undefined;
  let seoMetaTitleRows = 0, seoMetaDescRows = 0, seoFocusKwRows = 0, seoCanonicalRows = 0;
  const openGraphCols = new Set<string>();
  const schemaCols = new Set<string>();
  let openGraphRows = 0, schemaRows = 0;

  for await (const raw of streamRows(filePath)) {
    totalRows++;

    if (!headerIndex) {
      headerIndex = new Map();
      for (const key of Object.keys(raw)) headerIndex.set(norm(key), key);

      // One-time SEO/OpenGraph/Schema column detection, based on the header row.
      for (const key of Object.keys(raw)) {
        if (SEO_PATTERNS.metaTitle.some((p) => p.test(key))) seoMetaTitleCol = key;
        if (SEO_PATTERNS.metaDescription.some((p) => p.test(key))) seoMetaDescCol = key;
        if (SEO_PATTERNS.focusKeyword.some((p) => p.test(key))) seoFocusKwCol = key;
        if (SEO_PATTERNS.canonicalUrl.some((p) => p.test(key))) seoCanonicalCol = key;
        if (/opengraph|^og:/i.test(key)) openGraphCols.add(key);
        if (/schema/i.test(key)) schemaCols.add(key);
      }

      // Core WooCommerce product-export columns present in every version
      // this app has been tested against. Missing most of them suggests a
      // non-standard export (a different plugin, a heavily customized
      // WooCommerce version, or a file that isn't a product export at all)
      // — worth a heads-up before the admin invests time in mapping it.
      const CORE_WOO_COLUMNS = ["sku", "name", "type", "published", "regular price"];
      const foundCore = CORE_WOO_COLUMNS.filter((c) => headerIndex!.has(c));
      if (foundCore.length <= 2) {
        addIssue(
          0,
          "",
          `Only recognized ${foundCore.length} of ${CORE_WOO_COLUMNS.length} standard WooCommerce product-export columns (${CORE_WOO_COLUMNS.join(", ")}). This may not be a standard WooCommerce product CSV, or it's from a version/plugin with different column names — double-check the column mapping carefully.`,
          "warning"
        );
      }
    }

    const type = (getCol(raw, "type", "product type") || "simple").trim().toLowerCase();
    const isVariation = type === "variation";
    const sku = getCol(raw, "sku").trim();
    const name = getCol(raw, "name", "product name", "title").trim();
    const rowLabel = sku || name || `row ${totalRows}`;

    if (seoMetaTitleCol && raw[seoMetaTitleCol]?.trim()) seoMetaTitleRows++;
    if (seoMetaDescCol && raw[seoMetaDescCol]?.trim()) seoMetaDescRows++;
    if (seoFocusKwCol && raw[seoFocusKwCol]?.trim()) seoFocusKwRows++;
    if (seoCanonicalCol && raw[seoCanonicalCol]?.trim()) seoCanonicalRows++;
    for (const c of openGraphCols) if (raw[c]?.trim()) { openGraphRows++; break; }
    for (const c of schemaCols) if (raw[c]?.trim()) { schemaRows++; break; }

    // --- Attributes (collected for every row type — parents AND variations) ---
    const rowAttrs: { name: string; values: string[] }[] = [];
    for (const key of Object.keys(raw)) {
      const m = key.match(/^attribute\s*(\d+)\s*name$/i);
      if (!m) continue;
      const valueKey = Object.keys(raw).find((k) => new RegExp(`^attribute\\s*${m[1]}\\s*value`, "i").test(k));
      const attrName = raw[key]?.trim();
      const attrValueRaw = valueKey ? raw[valueKey] : "";
      if (!attrName) continue;
      const values = splitList(attrValueRaw);
      rowAttrs.push({ name: attrName, values });
      if (!attributeValues.has(attrName)) attributeValues.set(attrName, new Set());
      values.forEach((v) => attributeValues.get(attrName)!.add(v));
    }

    if (isVariation) {
      const parentSku = getCol(raw, "parent", "parent sku").trim();
      const color = rowAttrs.find((a) => /colou?r/i.test(a.name))?.values[0] ?? "";
      const size = rowAttrs.find((a) => /size/i.test(a.name))?.values[0] ?? "";
      variationRecords.push({ row: totalRows, sku, parentSku, size, color });

      const dedupeKey = `${parentSku.toLowerCase()}|${size}|${color}`;
      if (variationDedupeKeys.has(dedupeKey) && parentSku) duplicateVariations++;
      else variationDedupeKeys.add(dedupeKey);
    } else {
      // Every check below (quality, categories, images, SEO row-counts,
      // status/featured/virtual flags) only applies to actual product rows —
      // a "variation" row isn't a product in its own right, it's a child of
      // one already counted above.
      nonVariationRowCount++;
      nonVariationSkus.add(sku.toLowerCase());
      if (type === "simple") simpleProducts++;
      else if (type === "variable") { variableProducts++; variableProductSkus.add(sku.toLowerCase()); }

      let rowBlocksImport = false;
      if (!name) { missingName++; addIssue(totalRows, rowLabel, "Missing product name.", "error"); }
      if (!sku) { missingSku++; rowBlocksImport = true; addIssue(totalRows, rowLabel, "Missing SKU.", "error"); }
      else {
        skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
        if (skuCounts.get(sku) === 2) addIssue(totalRows, rowLabel, `Duplicate SKU "${sku}" within this file.`, "warning");
      }

      const slugSource = getCol(raw, "slug", "permalink").trim() || name;
      if (slugSource) {
        const slug = slugify(slugSource);
        if (!slugGroups.has(slug)) slugGroups.set(slug, new Set());
        slugGroups.get(slug)!.add(slugSource);
      }

      const regular = getCol(raw, "regular price", "price").trim();
      const sale = getCol(raw, "sale price").trim();
      const price = sale || regular;
      if (!price) { missingPrice++; rowBlocksImport = true; addIssue(totalRows, rowLabel, "Missing price (Regular Price or Sale Price).", "error"); }
      else if (Number.isNaN(Number(price)) || Number(price) < 0) { invalidPrice++; rowBlocksImport = true; addIssue(totalRows, rowLabel, `Invalid price "${price}".`, "error"); }
      if (regular && (Number.isNaN(Number(regular)) || Number(regular) < 0)) { invalidPrice++; rowBlocksImport = true; addIssue(totalRows, rowLabel, `Invalid regular price "${regular}".`, "error"); }
      if (rowBlocksImport) { blockingIssueRows++; if (sku) blockedSkus.add(sku.toLowerCase()); }

      const categoriesCell = getCol(raw, "categories", "category").trim();
      if (!categoriesCell) { missingCategories++; addIssue(totalRows, rowLabel, "No category specified.", "warning"); }
      else {
        for (const token of splitList(categoriesCell)) {
          categoryTokenCounts.set(token, (categoryTokenCounts.get(token) ?? 0) + 1);
          const key = norm(token);
          if (!categoryNormToRaw.has(key)) categoryNormToRaw.set(key, new Set());
          categoryNormToRaw.get(key)!.add(token);
        }
      }

      const imagesCell = getCol(raw, "images", "image").trim();
      const imageUrls = splitList(imagesCell);
      if (imageUrls.length === 0) { withoutImages++; addIssue(totalRows, rowLabel, "No image URL specified.", "warning"); }
      else {
        featuredImageCount++;
        galleryImageCount += Math.max(0, imageUrls.length - 1);
        totalImageReferences += imageUrls.length;
        for (const url of imageUrls) {
          imageUrlCounts.set(url, (imageUrlCounts.get(url) ?? 0) + 1);
          if (!/^https?:\/\//i.test(url)) { brokenUrlCount++; addIssue(totalRows, rowLabel, `Image URL does not look valid: "${url}".`, "warning"); }
        }
      }

      const stockCell = getCol(raw, "stock", "stock quantity", "quantity").trim();
      const stockStatusCell = getCol(raw, "stock status", "in stock?").trim();
      if (!stockCell && !stockStatusCell) { missingStock++; addIssue(totalRows, rowLabel, "No stock quantity or stock status specified.", "warning"); }

      if (type === "variable" && rowAttrs.length === 0) { missingAttributes++; addIssue(totalRows, rowLabel, "Variable product has no attribute columns populated.", "warning"); }
      if (type === "variable") {
        const declared = new Map<string, Set<string>>();
        for (const a of rowAttrs) declared.set(norm(a.name), new Set(a.values));
        parentDeclaredAttrs.set(sku.toLowerCase(), declared);
      }

      const description = getCol(raw, "description").trim();
      const shortDescription = getCol(raw, "short description").trim();
      if (!description && !shortDescription) { emptyDescriptions++; addIssue(totalRows, rowLabel, "Both Description and Short description are empty.", "warning"); }

      const publishedRaw = getCol(raw, "published").trim();
      const publishedNorm = publishedRaw.toLowerCase();
      const statusRaw = getCol(raw, "status").trim().toLowerCase();
      let resolvedStatus: "draft" | "published" | "private" | "unknown" = "unknown";
      // The real importer's resolveWooProductStatus() recognizes both the
      // numeric WooCommerce convention (1/0/-1) and text values ("publish",
      // "yes", etc.) in whichever single column ("Published" or "Status")
      // the row actually has — this must recognize the exact same text
      // values here, or the analyzer flags legitimate rows as "unrecognized"
      // that the real importer would import without a warning.
      if (publishedRaw === "1" || ["publish", "published", "yes", "true", "y"].includes(publishedNorm)) resolvedStatus = "published";
      else if (publishedRaw === "0" || ["no", "false", "n"].includes(publishedNorm)) resolvedStatus = "draft";
      else if (publishedRaw === "-1") resolvedStatus = "private";
      else if (["publish", "published"].includes(statusRaw)) resolvedStatus = "published";
      else if (["draft", "pending"].includes(statusRaw)) resolvedStatus = "draft";
      else if (statusRaw === "private") resolvedStatus = "private";
      else if (!publishedRaw && !statusRaw) resolvedStatus = "published"; // Woo/our own default
      if (resolvedStatus === "unknown") { invalidStatus++; addIssue(totalRows, rowLabel, `Unrecognized status value ("${publishedRaw || statusRaw}").`, "warning"); }
      if (resolvedStatus === "published") publishedProducts++;
      else if (resolvedStatus === "draft") draftProducts++;
      else if (resolvedStatus === "private") privateProducts++;

      if (truthy(getCol(raw, "is featured?", "featured"))) featuredProducts++;
      if (truthy(getCol(raw, "is virtual?"))) virtualProducts++;
      if (truthy(getCol(raw, "is downloadable?"))) downloadableProducts++;
    }
  }

  // --- Reconciliation over accumulated (not re-streamed) data ---
  let productsMissingParentColumn = 0, orphanVariations = 0, invalidAttributeCombinations = 0;
  for (const v of variationRecords) {
    if (!v.parentSku) { productsMissingParentColumn++; continue; }
    const parentKey = v.parentSku.toLowerCase();
    if (!nonVariationSkus.has(parentKey)) { orphanVariations++; continue; }
    const declared = parentDeclaredAttrs.get(parentKey);
    if (declared) {
      if (v.color && declared.get("color") && !declared.get("color")!.has(v.color) && !declared.get("colour")?.has(v.color)) invalidAttributeCombinations++;
      else if (v.size && declared.get("size") && !declared.get("size")!.has(v.size)) invalidAttributeCombinations++;
    }
  }
  const variationParentSkusReferenced = new Set(variationRecords.filter((v) => v.parentSku).map((v) => v.parentSku.toLowerCase()));
  let missingVariations = 0;
  for (const parentSku of variableProductSkus) if (!variationParentSkusReferenced.has(parentSku)) missingVariations++;

  const duplicateSku = [...skuCounts.values()].filter((n) => n > 1).length;
  const duplicateSlugGroups = [...slugGroups.values()].filter((names) => names.size > 1).map((names) => [...names]);
  const duplicateSlug = duplicateSlugGroups.length;

  const duplicateCategoryGroups = [...categoryNormToRaw.values()].filter((names) => names.size > 1).map((names) => [...names]);
  const duplicateUrlCount = [...imageUrlCounts.values()].filter((n) => n > 1).length;

  // --- Database reads (read-only — no writes anywhere in this function) ---
  await dbConnect();
  const skuList = [...nonVariationSkus].filter(Boolean);
  const slugList = [...slugGroups.keys()];
  const [existingProducts, existingCategories] = await Promise.all([
    skuList.length || slugList.length
      ? ProductModel.find({ $or: [{ sku: { $in: skuList } }, { slug: { $in: slugList } }] }).select("sku slug").lean<{ sku: string; slug: string }[]>()
      : Promise.resolve([]),
    categoryTokenCounts.size
      ? CategoryModel.find({ slug: { $in: [...categoryTokenCounts.keys()].map(slugify) } }).select("slug").lean<{ slug: string }[]>()
      : Promise.resolve([]),
  ]);
  // Matches wooProductImporter's own duplicate-detection order (SKU first,
  // then slug) — but this is a file-level estimate, not a row-by-row replay,
  // so it can't perfectly account for a SKU that differs from an existing
  // product's SKU while still matching by slug. Good enough for a readiness
  // estimate; the real per-row check happens in the actual import.
  const existingSkuSet = new Set(existingProducts.map((p) => (p.sku ?? "").toLowerCase()));
  const existingCategorySlugSet = new Set(existingCategories.map((c) => c.slug));

  let productsToUpdate = 0, productsToCreate = 0;
  for (const sku of skuList) {
    if (blockedSkus.has(sku.toLowerCase())) continue; // counted in productsToSkip instead
    if (existingSkuSet.has(sku.toLowerCase())) productsToUpdate++;
    else productsToCreate++;
  }
  const productsToSkip = blockingIssueRows;

  let categoriesExisting = 0;
  for (const token of categoryTokenCounts.keys()) if (existingCategorySlugSet.has(slugify(token))) categoriesExisting++;
  const categoriesToCreate = categoryTokenCounts.size - categoriesExisting;

  // --- Columns inventory ---
  const columns: ColumnRow[] = [];
  const unsupported: { field: string; reason: string }[] = [];
  if (headerIndex) {
    for (const [, original] of headerIndex) {
      const aliasMatch = TARGET_FIELDS.find((f) => f.aliases.some((a) => a.toLowerCase() === norm(original)));
      let classification: ColumnRow["classification"] = "manual-mapping-needed";
      let mappedField: string | null = null;
      let note: string | undefined;

      if (aliasMatch) {
        mappedField = aliasMatch.key;
        classification = aliasMatch.unsupported ? "ignored" : "supported";
        if (aliasMatch.unsupported) note = `Recognized but ${aliasMatch.label} has no matching Product field.`;
      } else {
        const wooKnown = UNSUPPORTED_WOO_COLUMNS.find((u) => u.match.test(original));
        if (wooKnown) {
          classification = "ignored";
          note = wooKnown.reason;
          unsupported.push({ field: original, reason: wooKnown.reason });
        } else if (/opengraph|^og:/i.test(original) || /schema/i.test(original) || /focuskw|focus keyword/i.test(original) || /canonical/i.test(original)) {
          classification = "ignored";
          note = "SEO metadata recognized but has no matching schema field beyond seoTitle/seoDescription.";
          unsupported.push({ field: original, reason: note });
        }
      }

      columns.push({ name: original, detectedType: detectColumnType(original), mappedField, classification, note });
    }
  }

  // --- Attribute rows ---
  // Every attribute is now imported onto each variation's variants[].attributes
  // (see wooProductMapping.ts's generic collectAttr) — nothing is dropped, so
  // mappingExists is always true. `supported` is a narrower, separate signal:
  // only Color/Size additionally populate Product.colors[]/sizes[], the
  // fields the shop's colour/size filter UI actually reads.
  const attributes: AttributeRow[] = [...attributeValues.entries()].map(([name, values]) => ({
    name, valueCount: values.size, sampleValues: [...values].slice(0, 20),
    supported: /colou?r|size/i.test(name), mappingExists: true,
  }));

  // --- Category rows ---
  const categoryList: CategoryRow[] = [...categoryTokenCounts.entries()].map(([name, count]) => ({
    name, count, existsInDb: existingCategorySlugSet.has(slugify(name)), nested: name.includes(">"),
  }));
  const nestedCategoryCount = categoryList.filter((c) => c.nested).length;

  // --- Risks ---
  const risks: RiskItem[] = [];
  const pushRisk = (severity: RiskItem["severity"], message: string, count: number) => { if (count > 0) risks.push({ severity, message, count }); };
  pushRisk("critical", "Duplicate SKUs within the file", duplicateSku);
  pushRisk("warning", "Duplicate slugs within the file", duplicateSlug);
  pushRisk("critical", "Products missing a price", missingPrice);
  pushRisk("critical", "Products with an invalid price", invalidPrice);
  pushRisk("critical", "Products missing a SKU", missingSku);
  pushRisk("warning", "Products without a category", missingCategories);
  pushRisk("warning", "Products without an image", withoutImages);
  pushRisk("warning", "Broken/malformed image URLs", brokenUrlCount);
  pushRisk("warning", "Variable products with no matching variation rows", missingVariations);
  pushRisk("warning", "Orphan variations (Parent SKU not found in file)", orphanVariations);
  pushRisk("warning", "Variations with an attribute value outside the parent's declared set", invalidAttributeCombinations);
  pushRisk("info", "Products flagged virtual (unsupported — will import as a normal physical product)", virtualProducts);
  pushRisk("info", "Products flagged downloadable (unsupported — download data will be dropped)", downloadableProducts);
  pushRisk("info", "Products with empty descriptions", emptyDescriptions);

  // --- Score (documented rubric — not a black box) ---
  const base = Math.max(totalRows, 1);
  const frac = (n: number) => Math.min(1, n / base);
  let score = 100;
  score -= frac(missingSku) * 20;
  score -= frac(duplicateSku) * 15;
  score -= frac(missingPrice + invalidPrice) * 25;
  score -= frac(missingName) * 15;
  score -= frac(orphanVariations + invalidAttributeCombinations) * 10;
  score -= frac(missingCategories + withoutImages) * 5;
  score -= frac(brokenUrlCount) * 5;
  score = Math.max(0, Math.round(score));
  const label: AnalysisReport["summary"]["label"] = score >= 90 ? "Ready to Import" : score >= 70 ? "Needs Review" : "High Risk";

  return {
    fileName, totalRows, analyzedAt: new Date().toISOString(),
    general: {
      totalProducts: nonVariationRowCount,
      simpleProducts, variableProducts, draftProducts, publishedProducts, privateProducts,
      featuredProducts, virtualProducts, downloadableProducts,
    },
    quality: {
      missingName, missingSku, duplicateSku, duplicateSlug, missingPrice, invalidPrice,
      missingCategories, withoutImages, missingStock, missingAttributes, missingVariations,
      emptyDescriptions, invalidStatus, issues, issuesTruncated: issues.length >= ISSUE_CAP,
    },
    categories: {
      found: categoryTokenCounts.size, existing: categoriesExisting, toCreate: categoriesToCreate,
      nested: nestedCategoryCount, duplicateGroups: duplicateCategoryGroups, list: categoryList,
    },
    attributes,
    variations: {
      variableProducts, variationRows: variationRecords.length, productsMissingParentColumn,
      orphanVariations, invalidAttributeCombinations, duplicateVariations,
    },
    images: {
      featuredImageCount, galleryImageCount, totalImageReferences,
      distinctImageUrls: imageUrlCounts.size, brokenUrlCount, duplicateUrlCount, altTagsSupported: false,
    },
    seo: {
      metaTitle: { detected: !!seoMetaTitleCol, columns: seoMetaTitleCol ? [seoMetaTitleCol] : [], rowsPopulated: seoMetaTitleRows },
      metaDescription: { detected: !!seoMetaDescCol, columns: seoMetaDescCol ? [seoMetaDescCol] : [], rowsPopulated: seoMetaDescRows },
      focusKeyword: { detected: !!seoFocusKwCol, columns: seoFocusKwCol ? [seoFocusKwCol] : [], rowsPopulated: seoFocusKwRows },
      canonicalUrl: { detected: !!seoCanonicalCol, columns: seoCanonicalCol ? [seoCanonicalCol] : [], rowsPopulated: seoCanonicalRows },
      openGraph: { detected: openGraphCols.size > 0, columns: [...openGraphCols], rowsPopulated: openGraphRows },
      schema: { detected: schemaCols.size > 0, columns: [...schemaCols], rowsPopulated: schemaRows },
    },
    columns,
    unsupported,
    databaseImpact: {
      productsToCreate, productsToUpdate, productsToSkip,
      categoriesToCreate, collectionsToCreate: 0, imagesReferenced: imageUrlCounts.size,
      estimatedImportTimeMs: totalRows * 20,
    },
    risks,
    summary: { score, label },
  };
}
