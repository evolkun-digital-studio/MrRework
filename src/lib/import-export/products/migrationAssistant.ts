import { dbConnect } from "@/lib/mongodb";
import { CategoryModel } from "@/models/Category";
import { streamRows } from "../csv";
import { analyzeWooCsv } from "./wooCsvAnalyzer";
import { mapRow, buildProductDoc, type WooMappedRow } from "./wooProductImporter";

function slugify(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");
}

// A read-only "migration consultant" built entirely on top of the existing,
// unmodified compatibility analyzer (wooCsvAnalyzer.ts) — every count that
// analyzer already computes is reused here, not recomputed. The only new
// work this file does is: one lightweight extra streaming pass for the
// handful of fields the analyzer never tracked (tags/brand distinct values,
// per-attribute product usage, negative stock, unrecognized product types),
// plugin-signature detection (pure pattern matching against column names
// the analyzer already listed), and deriving a migration plan / risk
// assessment / recommendations from all of the above. Nothing here writes
// to MongoDB, and nothing here is persisted anywhere — the report is
// returned once and lives only in the browser's memory for that session.

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

export interface StoreProfile {
  wooCommerceVersion: { detected: boolean; value: string | null; note: string };
  exportDate: { detected: boolean; value: string; note: string };
  totalProducts: number; simpleProducts: number; variableProducts: number;
  categories: number; tags: number; brands: number; attributes: number; images: number;
  averageVariantsPerProduct: number;
  productsWithoutImages: number; productsWithoutCategories: number;
  productsWithoutSku: number; productsWithoutStock: number;
  draftProducts: number; publishedProducts: number;
}

export type PluginStatus = "fully-supported" | "partially-supported" | "not-supported";
export interface PluginDetection { name: string; status: PluginStatus; detected: boolean; matchedColumns: string[]; explanation: string }

export type Confidence = "high" | "medium" | "low";
export interface FieldMappingRow { column: string; mappedField: string | null; importStatus: "supported" | "ignored" | "manual-mapping-needed"; confidence: Confidence }

export interface DataQualityReport {
  duplicateSkus: number; duplicateSlugs: number; duplicateCategories: number;
  brokenImageUrls: number; missingImages: number; missingAltTags: "all — no schema field";
  missingPrice: number; invalidPrices: number; negativeStock: number;
  missingCategories: number; missingAttributes: number; orphanVariations: number;
  unknownProductTypes: number; unknownStatusValues: number;
}

export interface SeoReportField { label: string; detected: boolean; rowsPopulated: number; willImport: boolean; note: string }

export interface AttributeReportRow { name: string; values: string[]; valueCount: number; productsUsing: number; supported: boolean; requiresManualMapping: boolean }

export interface MigrationPhase { phase: number; title: string; description: string; expectedCount: number; unit: string }

export type RiskLevel = "Low Risk" | "Medium Risk" | "High Risk";
export interface RiskAssessment { level: RiskLevel; score: number; reasons: string[] }

export interface Recommendation { priority: "high" | "medium" | "low"; message: string }

export interface MigrationAssistantReport {
  fileName: string;
  analyzedAt: string;
  storeProfile: StoreProfile;
  plugins: PluginDetection[];
  fieldMapping: FieldMappingRow[];
  dataQuality: DataQualityReport;
  seo: SeoReportField[];
  attributes: AttributeReportRow[];
  migrationPlan: MigrationPhase[];
  risk: RiskAssessment;
  recommendations: Recommendation[];
}

export interface ProductPreview {
  sku: string;
  found: boolean;
  raw: Record<string, string>;
  mapped: WooMappedRow;
  document: Record<string, unknown>;
  categoryActions: { name: string; action: "reuse" | "create" }[];
}

// ---------------------------------------------------------------------------
// Plugin signatures — pure pattern matching against detected column names.
// ---------------------------------------------------------------------------

const PLUGIN_SIGNATURES: { name: string; patterns: RegExp[]; status: PluginStatus; explanation: string }[] = [
  { name: "Yoast SEO", patterns: [/yoast_wpseo/i], status: "partially-supported",
    explanation: "Meta Title and Meta Description import into seoTitle/seoDescription. Focus Keyword, OpenGraph, and Schema columns are detected but not imported — no matching schema field exists for them." },
  { name: "RankMath", patterns: [/rank_math/i], status: "not-supported",
    explanation: "RankMath's column names aren't in the importer's alias table yet (only Yoast's are) — every RankMath column requires manual mapping today, and only Title/Description have anywhere to map to even then." },
  { name: "WooCommerce Brands", patterns: [/^brands?$/i, /product_brand/i], status: "partially-supported",
    explanation: "Brand values are preserved as a tag — there is no dedicated brand field on the Product schema, so brand-specific filtering/display won't work without further schema work." },
  { name: "Product Add-ons", patterns: [/product.?add.?ons?/i, /_product_addons/i], status: "not-supported",
    explanation: "No add-on/extra-option concept exists on the Product schema — add-on configuration is dropped entirely." },
  { name: "Composite Products", patterns: [/composite.?products?/i, /_composite_/i], status: "not-supported",
    explanation: "No bundle/composite product type exists — a composite product would import as an ordinary simple product with its component-item data dropped." },
  { name: "WooCommerce Subscriptions", patterns: [/subscription/i], status: "not-supported",
    explanation: "No recurring-billing concept exists — subscription products import as one-time-purchase simple products; billing interval, trial period, and sign-up fee data are dropped." },
  { name: "WooCommerce Bookings", patterns: [/booking/i], status: "not-supported",
    explanation: "No booking/appointment/date-range concept exists on the Product schema." },
  { name: "Custom Product Tabs", patterns: [/product.?tabs?/i, /_tab_/i], status: "not-supported",
    explanation: "No per-product custom-tab content field exists — tab content is dropped." },
  { name: "Advanced Custom Fields (ACF)", patterns: [/^field_[a-f0-9]{6,}/i], status: "not-supported",
    explanation: "ACF-exported columns use opaque generated keys with no reliable automatic mapping — each needs manual review to understand what it holds." },
];

const KNOWN_PRODUCT_TYPES = new Set(["simple", "variable", "variation", "grouped", "external"]);

// ---------------------------------------------------------------------------
// The one extra streaming pass — only for fields analyzeWooCsv() doesn't track.
// ---------------------------------------------------------------------------

async function collectExtras(filePath: string) {
  const tags = new Set<string>();
  const brands = new Set<string>();
  const attributeProductUsage = new Map<string, Set<string>>(); // attrName -> set of SKUs using it
  let unknownProductTypes = 0;
  let negativeStock = 0;
  let headerIndex: Map<string, string> | null = null;

  const norm = (s: string) => s.trim().toLowerCase();
  const splitList = (v: string) => v.split(/[|,]/).map((s) => s.trim()).filter(Boolean);

  for await (const raw of streamRows(filePath)) {
    if (!headerIndex) {
      headerIndex = new Map();
      for (const key of Object.keys(raw)) headerIndex.set(norm(key), key);
    }
    const getCol = (...candidates: string[]) => {
      for (const c of candidates) {
        const real = headerIndex!.get(norm(c));
        if (real !== undefined) return raw[real] ?? "";
      }
      return "";
    };

    const type = (getCol("type", "product type") || "simple").trim().toLowerCase();
    if (type && !KNOWN_PRODUCT_TYPES.has(type)) unknownProductTypes++;

    if (type !== "variation") {
      splitList(getCol("tags")).forEach((t) => tags.add(t));
      splitList(getCol("brand", "brands", "product brand")).forEach((b) => brands.add(b));

      const stock = getCol("stock", "stock quantity", "quantity").trim();
      if (stock && !Number.isNaN(Number(stock)) && Number(stock) < 0) negativeStock++;

      const sku = getCol("sku").trim();
      for (const key of Object.keys(raw)) {
        const m = key.match(/^attribute\s*(\d+)\s*name$/i);
        if (!m) continue;
        const attrName = raw[key]?.trim();
        if (!attrName) continue;
        if (!attributeProductUsage.has(attrName)) attributeProductUsage.set(attrName, new Set());
        if (sku) attributeProductUsage.get(attrName)!.add(sku);
      }
    }
  }

  return { tags, brands, attributeProductUsage, unknownProductTypes, negativeStock };
}

// ---------------------------------------------------------------------------
// Report assembly
// ---------------------------------------------------------------------------

export async function buildMigrationPlan(filePath: string, fileName: string, uploadedAt: Date): Promise<MigrationAssistantReport> {
  const base = await analyzeWooCsv(filePath, fileName);
  const extras = await collectExtras(filePath);

  const wooVersionColumn = base.columns.find((c) => /wc.?version|woocommerce.?version/i.test(c.name));
  const storeProfile: StoreProfile = {
    wooCommerceVersion: { detected: false, value: null, note: wooVersionColumn ? `A "${wooVersionColumn.name}" column exists but isn't a recognized version marker.` : "Not detectable — the standard WooCommerce product CSV export has no version column." },
    exportDate: { detected: false, value: uploadedAt.toISOString(), note: "WooCommerce's CSV export doesn't embed the export date — showing when this file was uploaded here instead." },
    totalProducts: base.general.totalProducts, simpleProducts: base.general.simpleProducts, variableProducts: base.general.variableProducts,
    categories: base.categories.found, tags: extras.tags.size, brands: extras.brands.size, attributes: base.attributes.length,
    images: base.images.totalImageReferences,
    averageVariantsPerProduct: base.variations.variableProducts > 0 ? Math.round((base.variations.variationRows / base.variations.variableProducts) * 10) / 10 : 0,
    productsWithoutImages: base.quality.withoutImages, productsWithoutCategories: base.quality.missingCategories,
    productsWithoutSku: base.quality.missingSku, productsWithoutStock: base.quality.missingStock,
    draftProducts: base.general.draftProducts, publishedProducts: base.general.publishedProducts,
  };

  const columnNames = base.columns.map((c) => c.name);
  const matchedByAnyPlugin = new Set<string>();
  const plugins: PluginDetection[] = PLUGIN_SIGNATURES.map((sig) => {
    const matched = columnNames.filter((name) => sig.patterns.some((p) => p.test(name)));
    matched.forEach((m) => matchedByAnyPlugin.add(m));
    return { name: sig.name, status: sig.status, detected: matched.length > 0, matchedColumns: matched, explanation: sig.explanation };
  }).filter((p) => p.detected);

  const unclaimedMeta = base.columns.filter((c) => /^meta:/i.test(c.name) && !matchedByAnyPlugin.has(c.name) && c.classification !== "supported").map((c) => c.name);
  if (unclaimedMeta.length > 0) {
    plugins.push({ name: "Unrecognized custom meta fields", status: "not-supported", detected: true, matchedColumns: unclaimedMeta, explanation: "These look like plugin- or theme-specific meta fields, but don't match a known plugin signature — likely a custom field (possibly Advanced Custom Fields or a bespoke integration). Each would need manual review." });
  }

  const fieldMapping: FieldMappingRow[] = base.columns.map((c) => ({
    column: c.name, mappedField: c.mappedField, importStatus: c.classification,
    confidence: c.classification === "supported" ? "high" : c.classification === "ignored" ? "medium" : "low",
  }));

  const dataQuality: DataQualityReport = {
    duplicateSkus: base.quality.duplicateSku, duplicateSlugs: base.quality.duplicateSlug,
    duplicateCategories: base.categories.duplicateGroups.length,
    brokenImageUrls: base.images.brokenUrlCount, missingImages: base.quality.withoutImages,
    missingAltTags: "all — no schema field",
    missingPrice: base.quality.missingPrice, invalidPrices: base.quality.invalidPrice, negativeStock: extras.negativeStock,
    missingCategories: base.quality.missingCategories, missingAttributes: base.quality.missingAttributes,
    orphanVariations: base.variations.orphanVariations,
    unknownProductTypes: extras.unknownProductTypes, unknownStatusValues: base.quality.invalidStatus,
  };

  const seo: SeoReportField[] = [
    { label: "Meta Title", detected: base.seo.metaTitle.detected, rowsPopulated: base.seo.metaTitle.rowsPopulated, willImport: true, note: "Imports into Product.seoTitle." },
    { label: "Meta Description", detected: base.seo.metaDescription.detected, rowsPopulated: base.seo.metaDescription.rowsPopulated, willImport: true, note: "Imports into Product.seoDescription." },
    { label: "Focus Keyword", detected: base.seo.focusKeyword.detected, rowsPopulated: base.seo.focusKeyword.rowsPopulated, willImport: false, note: "Detected but not imported — no matching field." },
    { label: "Canonical URL", detected: base.seo.canonicalUrl.detected, rowsPopulated: base.seo.canonicalUrl.rowsPopulated, willImport: false, note: "Detected but not imported — no matching field." },
    { label: "OpenGraph fields", detected: base.seo.openGraph.detected, rowsPopulated: base.seo.openGraph.rowsPopulated, willImport: false, note: "Detected but not imported — no matching field." },
  ];

  const attributes: AttributeReportRow[] = base.attributes.map((a) => ({
    name: a.name, values: a.sampleValues, valueCount: a.valueCount,
    productsUsing: extras.attributeProductUsage.get(a.name)?.size ?? 0,
    supported: a.supported, requiresManualMapping: !a.supported,
  }));

  const seoRowsWithAnyData = Math.max(base.seo.metaTitle.rowsPopulated, base.seo.metaDescription.rowsPopulated);
  const migrationPlan: MigrationPhase[] = [
    { phase: 1, title: "Import Categories", description: "Reuse existing categories by slug; create any that don't exist yet.", expectedCount: base.categories.found, unit: "categories" },
    { phase: 2, title: "Import Products", description: "Create new products and update existing ones (matched by SKU, then slug).", expectedCount: base.databaseImpact.productsToCreate + base.databaseImpact.productsToUpdate, unit: "products" },
    { phase: 3, title: "Verify Images", description: "Image URLs are stored as-is and not downloaded in this phase — spot-check that they resolve.", expectedCount: base.images.totalImageReferences, unit: "image references" },
    { phase: 4, title: "Verify Variations", description: "Confirm variation rows attached correctly to their parent's variants[].", expectedCount: base.variations.variationRows, unit: "variation rows" },
    { phase: 5, title: "SEO Verification", description: "Spot-check imported Meta Title/Description against the source.", expectedCount: seoRowsWithAnyData, unit: "products with SEO data" },
  ];

  const reasons: string[] = [];
  if (dataQuality.duplicateSkus > 0) reasons.push(`${dataQuality.duplicateSkus} duplicate SKU(s) within the file may cause rows to silently overwrite each other.`);
  if (dataQuality.missingPrice + dataQuality.invalidPrices > 0) reasons.push(`${dataQuality.missingPrice + dataQuality.invalidPrices} product(s) have a missing or invalid price and will fail to import.`);
  if (base.quality.missingSku > 0) reasons.push(`${base.quality.missingSku} product(s) have no SKU and will fail to import.`);
  if (dataQuality.orphanVariations > 0) reasons.push(`${dataQuality.orphanVariations} variation(s) reference a parent SKU that isn't in this file.`);
  if (base.variations.invalidAttributeCombinations > 0) reasons.push(`${base.variations.invalidAttributeCombinations} variation(s) have an attribute value outside their parent's declared set.`);
  if (dataQuality.negativeStock > 0) reasons.push(`${dataQuality.negativeStock} product(s) report negative stock.`);
  if (dataQuality.unknownProductTypes > 0) reasons.push(`${dataQuality.unknownProductTypes} row(s) use a product type this importer doesn't recognize.`);
  if (plugins.some((p) => p.status === "not-supported")) reasons.push(`Plugin-specific data was detected (${plugins.filter((p) => p.status === "not-supported").map((p) => p.name).join(", ")}) that this importer can't bring across.`);
  if (reasons.length === 0) reasons.push("No significant issues detected in this file.");

  const level: RiskLevel = base.summary.score >= 90 ? "Low Risk" : base.summary.score >= 70 ? "Medium Risk" : "High Risk";

  const recommendations: Recommendation[] = [];
  const rec = (priority: Recommendation["priority"], message: string) => recommendations.push({ priority, message });
  if (dataQuality.duplicateSkus > 0) rec("high", `Fix ${dataQuality.duplicateSkus} duplicate SKU${dataQuality.duplicateSkus === 1 ? "" : "s"} before importing.`);
  if (base.categories.duplicateGroups.length > 0) rec("medium", `Rename ${base.categories.duplicateGroups.length} categor${base.categories.duplicateGroups.length === 1 ? "y" : "ies"} with inconsistent casing/spacing.`);
  if (dataQuality.invalidPrices > 0) rec("high", `Correct ${dataQuality.invalidPrices} invalid price${dataQuality.invalidPrices === 1 ? "" : "s"}.`);
  if (dataQuality.orphanVariations > 0) rec("high", `Remove or fix ${dataQuality.orphanVariations} orphan variation${dataQuality.orphanVariations === 1 ? "" : "s"} (Parent SKU not found in file).`);
  if (base.quality.missingSku > 0) rec("high", `Add a SKU to ${base.quality.missingSku} product${base.quality.missingSku === 1 ? "" : "s"} — rows without one can't be imported.`);
  if (base.quality.missingVariations > 0) rec("medium", `Add variation rows for ${base.quality.missingVariations} variable product${base.quality.missingVariations === 1 ? "" : "s"} that currently have none.`);
  if (dataQuality.missingCategories > 0) rec("low", `Add a category to ${dataQuality.missingCategories} product${dataQuality.missingCategories === 1 ? "" : "s"} currently without one.`);
  if (dataQuality.missingImages > 0) rec("low", `Add at least one image to ${dataQuality.missingImages} product${dataQuality.missingImages === 1 ? "" : "s"} currently without one.`);
  if (base.images.brokenUrlCount > 0) rec("medium", `Review ${base.images.brokenUrlCount} image URL${base.images.brokenUrlCount === 1 ? "" : "s"} that don't look valid.`);
  if (plugins.some((p) => p.status === "not-supported")) rec("low", "Review the Plugin Detection section — some data from detected plugins will not carry over.");

  return {
    fileName, analyzedAt: new Date().toISOString(),
    storeProfile, plugins, fieldMapping, dataQuality, seo, attributes,
    migrationPlan, risk: { level, score: base.summary.score, reasons }, recommendations,
  };
}

export async function previewProduct(filePath: string, columnMapping: Record<string, string>, wantedSku?: string): Promise<ProductPreview> {
  for await (const raw of streamRows(filePath)) {
    const mapped = mapRow(raw, columnMapping);
    if (mapped.type === "variation") continue; // preview shows a top-level product, not a variant row
    if (wantedSku ? mapped.sku.trim().toLowerCase() === wantedSku.trim().toLowerCase() : !!mapped.sku) {
      const document = buildProductDoc(mapped);

      // Real read-only check — not a guess — of whether each of this
      // product's categories already exists, mirroring exactly what
      // ensureCategory() in wooProductImporter.ts would do (find by slug),
      // just without the "create if missing" write.
      await dbConnect();
      const categoryActions: { name: string; action: "reuse" | "create" }[] = [];
      for (const name of mapped.categories) {
        const slug = slugify(name);
        const exists = slug ? await CategoryModel.exists({ slug }) : null;
        categoryActions.push({ name, action: exists ? "reuse" : "create" });
      }

      return { sku: mapped.sku, found: true, raw, mapped, document, categoryActions };
    }
  }
  return { sku: wantedSku ?? "", found: false, raw: {}, mapped: {} as WooMappedRow, document: {}, categoryActions: [] };
}
