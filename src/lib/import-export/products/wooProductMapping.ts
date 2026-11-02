import { applyMapping } from "../mapping";
import type { TargetField } from "../types";

export const TARGET_FIELDS: TargetField[] = [
  { key: "name", label: "Product Name", required: true, aliases: ["name", "product name", "title"] },
  { key: "slug", label: "Slug", aliases: ["slug", "permalink"], description: "Auto-generated from the name if left unmapped." },
  { key: "sku", label: "SKU", required: true, aliases: ["sku"] },
  { key: "description", label: "Description", aliases: ["description"] },
  { key: "shortDescription", label: "Short Description", aliases: ["short description"], description: "Merged into Description — the Product schema has no separate short-description field." },
  { key: "regularPrice", label: "Regular Price", required: true, aliases: ["regular price", "price"] },
  { key: "salePrice", label: "Sale Price", aliases: ["sale price"], description: "Becomes the product's price when lower than Regular Price; Regular Price becomes the compare-at price." },
  { key: "stock", label: "Stock Quantity", aliases: ["stock", "stock quantity", "quantity"] },
  { key: "stockStatus", label: "Stock Status", aliases: ["stock status", "in stock?"] },
  { key: "type", label: "Product Type", aliases: ["type", "product type"], description: "simple / variable / variation — drives how the row is processed, not stored directly." },
  { key: "status", label: "Status", aliases: ["published", "status"] },
  { key: "categories", label: "Categories", aliases: ["categories", "category"], description: "First category becomes the product's category; any additional ones are added as tags (the schema supports only one category per product)." },
  { key: "tags", label: "Tags", aliases: ["tags"] },
  { key: "images", label: "Images", aliases: ["images", "image"], description: "Comma/pipe-separated URLs. First = images[0], second = hoverImage." },
  { key: "attribute1Name", label: "Attribute 1 Name", aliases: ["attribute 1 name"] },
  { key: "attribute1Value", label: "Attribute 1 Value(s)", aliases: ["attribute 1 value(s)", "attribute 1 values", "attribute 1 value"] },
  { key: "attribute2Name", label: "Attribute 2 Name", aliases: ["attribute 2 name"] },
  { key: "attribute2Value", label: "Attribute 2 Value(s)", aliases: ["attribute 2 value(s)", "attribute 2 values", "attribute 2 value"] },
  { key: "attribute3Name", label: "Attribute 3 Name", aliases: ["attribute 3 name"] },
  { key: "attribute3Value", label: "Attribute 3 Value(s)", aliases: ["attribute 3 value(s)", "attribute 3 values", "attribute 3 value"] },
  { key: "parentSku", label: "Parent SKU", aliases: ["parent", "parent sku"], description: "For variation rows — links a variant to its parent product's variants[]." },
  { key: "seoTitle", label: "SEO Title", aliases: ["meta: _yoast_wpseo_title", "seo title"] },
  { key: "seoDescription", label: "SEO Description", aliases: ["meta: _yoast_wpseo_metadesc", "seo description"] },
  { key: "brand", label: "Brand", aliases: ["brand", "brands", "product brand"], description: "Added as a tag — the schema has no dedicated brand field." },
  { key: "weight", label: "Weight", aliases: ["weight"], unsupported: true },
  { key: "length", label: "Length", aliases: ["length (cm)", "length"], unsupported: true },
  { key: "width", label: "Width", aliases: ["width (cm)", "width"], unsupported: true },
  { key: "height", label: "Height", aliases: ["height (cm)", "height"], unsupported: true },
];

export interface WooMappedRow {
  name: string; slug: string; sku: string; description: string;
  regularPrice: string; salePrice: string; stock: string; stockStatus: string;
  type: string; status: string;
  categories: string[]; tags: string[]; brand: string; images: string[]; colors: string[]; sizes: string[];
  /** Lower-cased, trimmed attribute names found on this row (e.g. ["color", "color"]
   *  when two attribute slots both name "Color") — used to flag duplicate attributes. */
  attributeNames: string[];
  /**
   * Every WooCommerce attribute on this row, generic — not just Color/Size.
   * Key is the lower-cased trimmed attribute name ("quantity", "material",
   * "fit"...), value is the raw cell value as written in the CSV. Nothing
   * recognized by name is dropped, unlike colors[]/sizes[] which only
   * capture the two attribute names the rest of the app already renders
   * dedicated filter UI for.
   */
  attributes: Record<string, string>;
  parentSku: string; seoTitle: string; seoDescription: string;
}

function splitList(v: string): string[] {
  return v.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
}

const PLACEHOLDER_VALUES = new Set(["null", "n/a", "#n/a", "none", "-", "undefined"]);
// Fields where a stray currency symbol or thousands separator is common in
// older/hand-edited WooCommerce exports (WooCommerce's own exporter never
// includes them, but plenty of source data in the wild does).
const CURRENCY_STRIP_FIELDS = new Set(["regularPrice", "salePrice", "stock"]);

/**
 * WooCommerce compatibility layer — cleans up value-level quirks seen across
 * real-world WooCommerce exports (placeholder text left by other tools,
 * stray currency formatting, incidental whitespace) before the rest of
 * mapRow() parses anything. Runs on the already-mapped
 * { targetFieldKey: value } shape (applyMapping's output), not the raw CSV
 * row — column-level problems (unknown columns, two columns silently
 * claiming the same field) are handled earlier and separately, by
 * autoMatchColumns/applyMapping/the Mapping step UI, not here.
 *
 * Deliberately does NOT sanitize `description`/`shortDescription` HTML —
 * that belongs at the render boundary (see sanitizeContentHtml(), used the
 * same way by the content/blog importer), not at import time, so the
 * original export data stays intact for re-processing/audit and only what
 * actually reaches a browser is cleaned.
 */
export function normalizeWooCommerceRow(mapped: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(mapped)) {
    let value = (rawValue ?? "").trim();
    if (PLACEHOLDER_VALUES.has(value.toLowerCase())) value = "";
    else if (CURRENCY_STRIP_FIELDS.has(key) && value) value = value.replace(/[£$€,\s]/g, "");
    out[key] = value;
  }
  return out;
}

export function slugify(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");
}

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

export function resolveWooProductStatus(input: string): "draft" | "published" {
  const n = normalize(input);
  if (!n) return "published";
  if (["1", "yes", "true", "y", "publish", "published"].includes(n)) return "published";
  if (["0", "no", "false", "n", "-1", "draft", "pending", "private"].includes(n)) return "draft";
  return "draft";
}

export function isRecognizedWooProductStatus(input: string): boolean {
  const n = normalize(input);
  return !n || ["1", "yes", "true", "y", "publish", "published", "0", "no", "false", "n", "-1", "draft", "pending", "private"].includes(n);
}

function parseWooStockStatus(input: string): boolean | null {
  const n = normalize(input).replace(/[\s_-]+/g, "");
  if (!n) return null;
  if (["1", "yes", "true", "y", "instock"].includes(n)) return true;
  if (["0", "no", "false", "n", "outofstock", "onbackorder"].includes(n)) return false;
  return null;
}

export function isRecognizedWooStockStatus(input: string): boolean {
  return !normalize(input) || parseWooStockStatus(input) !== null;
}

export function resolveWooInStock(stockStatus: string, stock: string): boolean {
  const parsedStatus = parseWooStockStatus(stockStatus);
  if (parsedStatus !== null) return parsedStatus;

  const stockValue = stock.trim();
  if (stockValue) {
    const n = Number(stockValue);
    if (!Number.isNaN(n)) return n > 0;
  }

  return true;
}

export function mapRow(raw: Record<string, string>, mapping: Record<string, string>): WooMappedRow {
  const m = normalizeWooCommerceRow(applyMapping(raw, mapping));

  const description = [m.shortDescription, m.description].filter(Boolean).join("\n\n");
  const categories = splitList(m.categories ?? "");
  const tags = splitList(m.tags ?? "");
  if (m.brand?.trim()) tags.push(m.brand.trim());
  // De-duplicated, order preserved — images[0]/[1] (featured/hover) stay
  // exactly what they'd have been without the dedup unless a duplicate
  // occupied one of those two slots itself (e.g. the same URL listed twice
  // in one row's Images cell, seen in real WooCommerce exports).
  const images = [...new Set(splitList(m.images ?? ""))];

  const colors = new Set<string>();
  const sizes = new Set<string>();
  const attributeNames: string[] = [];
  const attributes: Record<string, string> = {};
  const collectAttr = (name?: string, value?: string) => {
    if (!name || !value) return;
    const n = name.trim().toLowerCase();
    attributeNames.push(n);
    const values = splitList(value);
    if (/colou?r/.test(n)) values.forEach((v) => colors.add(v));
    else if (/size/.test(n)) values.forEach((v) => sizes.add(v));
    // Every attribute — including color/size — also lands here, generically.
    // A row with the same attribute name twice keeps the first value (the
    // duplicate-attribute-name check in validateRow already warns about this).
    if (!(n in attributes)) attributes[n] = values.join(", ");
  };
  collectAttr(m.attribute1Name, m.attribute1Value);
  collectAttr(m.attribute2Name, m.attribute2Value);
  collectAttr(m.attribute3Name, m.attribute3Value);
  // Dynamic fallback: catches "Attribute 4 name" / "Attribute 5 name" etc.
  // even though only three fixed slots are offered in the mapping UI.
  for (const key of Object.keys(raw)) {
    const nameMatch = key.match(/^attribute\s*(\d+)\s*name$/i);
    if (!nameMatch) continue;
    const n = nameMatch[1];
    if (["1", "2", "3"].includes(n)) continue; // already handled above via the mapped fields
    const valueKey = Object.keys(raw).find((k) => new RegExp(`^attribute\\s*${n}\\s*value`, "i").test(k));
    if (valueKey) collectAttr(raw[key], raw[valueKey]);
  }

  return {
    name: m.name ?? "",
    slug: m.slug ?? "",
    sku: m.sku ?? "",
    description,
    regularPrice: m.regularPrice ?? "",
    salePrice: m.salePrice ?? "",
    stock: m.stock ?? "",
    stockStatus: m.stockStatus ?? "",
    type: (m.type ?? "simple").trim().toLowerCase() || "simple",
    status: (m.status ?? "").trim().toLowerCase(),
    categories,
    tags: [...new Set(tags)],
    brand: m.brand?.trim() ?? "",
    images,
    colors: [...colors],
    sizes: [...sizes],
    attributeNames,
    attributes,
    parentSku: m.parentSku ?? "",
    seoTitle: m.seoTitle ?? "",
    seoDescription: m.seoDescription ?? "",
  };
}

export interface ResolvedPrice {
  regularPrice?: number;
  salePrice?: number;
  /** What this actually sells for right now — salePrice when it's a genuine
   *  discount (lower than regularPrice), otherwise regularPrice, otherwise 0. */
  effectivePrice: number;
  /** Set only when there's a real discount to show (a strikethrough price). */
  compareAtPrice?: number;
}

// Single source of truth for "Regular Price"/"Sale Price" cell values -> a
// resolved price — used for a simple product's own price AND for every
// individual variation's price, so the two can never disagree about what
// counts as a genuine sale. Blank/non-numeric cells resolve to `undefined`,
// never to 0 — 0 is reserved for "every price we have is genuinely 0",
// which resolveVariablePricing below also honors.
export function resolvePrice(regularPriceRaw: string, salePriceRaw: string): ResolvedPrice {
  const regularParsed = regularPriceRaw ? Number(regularPriceRaw) : undefined;
  const salePriceParsed = salePriceRaw ? Number(salePriceRaw) : undefined;
  const regularPrice = regularParsed !== undefined && !Number.isNaN(regularParsed) ? regularParsed : undefined;
  const salePrice = salePriceParsed !== undefined && !Number.isNaN(salePriceParsed) ? salePriceParsed : undefined;

  if (salePrice !== undefined && (regularPrice === undefined || salePrice < regularPrice)) {
    return { regularPrice, salePrice, effectivePrice: salePrice, compareAtPrice: regularPrice };
  }
  return { regularPrice, salePrice, effectivePrice: regularPrice ?? salePrice ?? 0 };
}

export interface VariablePricingResult {
  price: number;
  compareAtPrice?: number;
  /** Highest effectivePrice among the variants — only set when it differs
   *  from `price`, i.e. there's an actual range to show ("From £X"). */
  priceMax?: number;
}

// Derives a variable product's own price/compareAtPrice/priceMax from its
// variations — the lowest effective price wins (matching how WooCommerce
// itself displays a variable product's storefront price), with that same
// variant's regular price carried over as compareAtPrice if it's genuinely
// on sale. Called after every variation attaches, over the full current
// variant list, so the result is always consistent regardless of row order
// or how many variations have been processed so far.
export function resolveVariablePricing(variants: { effectivePrice?: number; regularPrice?: number }[]): VariablePricingResult {
  const priced = variants.filter(
    (v): v is { effectivePrice: number; regularPrice?: number } => typeof v.effectivePrice === "number" && !Number.isNaN(v.effectivePrice)
  );
  if (!priced.length) return { price: 0 };

  const cheapest = priced.reduce((a, b) => (b.effectivePrice < a.effectivePrice ? b : a));
  const highest = Math.max(...priced.map((v) => v.effectivePrice));
  const compareAtPrice = cheapest.regularPrice !== undefined && cheapest.regularPrice > cheapest.effectivePrice ? cheapest.regularPrice : undefined;
  const priceMax = highest > cheapest.effectivePrice ? highest : undefined;

  return { price: cheapest.effectivePrice, compareAtPrice, priceMax };
}

// The pure part of turning a mapped row into a Product document — no
// database access, no side effects. Used by the importer, preview, and
// explicit repair scripts so they all agree on product shape.
export function buildProductDoc(mapped: WooMappedRow): Record<string, unknown> {
  const primaryCategory = mapped.categories[0] ?? "";
  const category = primaryCategory ? slugify(primaryCategory) || primaryCategory.trim() : "";
  const overflowCategories = mapped.categories.slice(1);
  const tags = [...new Set([...mapped.tags, ...overflowCategories])];

  // For a "variable" parent row, Regular/Sale Price are legitimately blank
  // by WooCommerce convention — the real price lives on its variation rows
  // instead, and importVariationRow() (wooProductImporter.ts) recomputes
  // price/compareAtPrice/priceMax from them as each one attaches. This
  // still resolves to 0 here as the pre-variation placeholder, same as
  // before — it just no longer stays 0 once variations arrive.
  const resolved = resolvePrice(mapped.regularPrice, mapped.salePrice);
  const price = resolved.effectivePrice;
  const compareAtPrice = resolved.compareAtPrice;

  const slug = slugify(mapped.slug || mapped.name);

  const doc: Record<string, unknown> = {
    name: mapped.name,
    slug,
    // Trimmed so this is the exact same value validateRow's duplicate-SKU
    // check compares against (mapped.sku.trim().toLowerCase()) and what
    // importRow looks the product up by — a CSV with stray whitespace in
    // the SKU column can't silently create a second product for a row
    // validation already flagged as a duplicate.
    sku: mapped.sku.trim(),
    description: mapped.description,
    category,
    price,
    images: mapped.images,
    colors: mapped.colors,
    sizes: mapped.sizes,
    tags,
    brand: mapped.brand,
    inStock: resolveWooInStock(mapped.stockStatus, mapped.stock),
    status: resolveWooProductStatus(mapped.status),
  };
  if (compareAtPrice !== undefined) doc.compareAtPrice = compareAtPrice;
  if (mapped.images[1]) doc.hoverImage = mapped.images[1];
  if (mapped.seoTitle) doc.seoTitle = mapped.seoTitle;
  if (mapped.seoDescription) doc.seoDescription = mapped.seoDescription;
  return doc;
}
