import { ProductModel } from "@/models/Product";
import { CategoryModel } from "@/models/Category";
import { variantKey } from "@/lib/utils";
import {
  TARGET_FIELDS,
  buildProductDoc,
  isRecognizedWooProductStatus,
  isRecognizedWooStockStatus,
  mapRow,
  resolvePrice,
  resolveVariablePricing,
  slugify,
  type WooMappedRow,
} from "./wooProductMapping";
import type { ImporterModule, ImportRunContext, RowResult, ValidationIssue } from "../types";

// The one real importer implementation in this phase. Everything here is
// deliberately WooCommerce/Product-specific — the generic engine (engine.ts)
// never imports ProductModel or CategoryModel directly; it only calls the
// three functions this module registers (mapRow/validateRow/importRow).

export { TARGET_FIELDS, buildProductDoc, mapRow };
export type { WooMappedRow } from "./wooProductMapping";

function isValidImageUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Cross-row scratch buffers this importer keeps in ctx.scratch, populated
// during validateRow and reconciled once in finalizeValidation (see below) —
// needed for checks that can't be decided from a single row in isolation,
// since a variation's parent (or a duplicate image) may appear earlier or
// later in the same file.
interface WooValidationScratch {
  variationRefs: { row: number; sku: string; parentSku: string }[];
  imageUrlRows: Map<string, { row: number; sku: string }[]>;
}

function getScratch(ctx: ImportRunContext): WooValidationScratch {
  if (!ctx.scratch.woo) {
    ctx.scratch.woo = { variationRefs: [], imageUrlRows: new Map() } as WooValidationScratch;
  }
  return ctx.scratch.woo as WooValidationScratch;
}

// Separate from WooValidationScratch above — this is run-time-only (a fresh
// ImportRunContext is built for validateImportJob and again for
// runImportJob, so there's no overlap), tracking which parent SKUs failed
// to import *during this same run* so a variation row that then can't find
// its parent can say why, instead of the same generic "not found" message
// used for a parent that's genuinely absent from the file altogether.
interface WooRunScratch {
  failedParentSkus: Set<string>;
}

function getRunScratch(ctx: ImportRunContext): WooRunScratch {
  if (!ctx.scratch.wooRun) {
    ctx.scratch.wooRun = { failedParentSkus: new Set() } as WooRunScratch;
  }
  return ctx.scratch.wooRun as WooRunScratch;
}

function validateRow(mapped: WooMappedRow, rowIndex: number, ctx: ImportRunContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const isVariation = mapped.type === "variation";
  // A "variable" parent row is not a variation itself, but — like a
  // variation — legitimately has no SKU-required/price-required data of its
  // own by WooCommerce convention: SKU is often auto-generated per
  // variation only, and price lives entirely on the variation rows (see
  // resolveVariablePricing in wooProductMapping.ts). Treated the same as
  // isVariation for those two checks only, everywhere else a variable
  // parent is still a real product row (needs a name, categories, etc.).
  const isVariableParent = mapped.type === "variable";
  const scratch = getScratch(ctx);

  if (!mapped.name && !isVariation) {
    issues.push({ row: rowIndex, field: "name", message: "Missing product name.", level: "error" });
  }
  if (!mapped.sku) {
    // Variation rows legitimately have no SKU of their own in most
    // WooCommerce exports (only the variable parent, and sometimes not even
    // that, carries one) — only a non-variation row missing a SKU is
    // actually an error.
    if (!isVariation) issues.push({ row: rowIndex, field: "sku", message: "Missing SKU.", level: "error" });
  } else {
    const skuKey = mapped.sku.trim().toLowerCase();
    if (ctx.seenSkus.has(skuKey)) {
      issues.push({ row: rowIndex, field: "sku", message: `Duplicate SKU "${mapped.sku}" within this file.`, level: "warning" });
    }
    ctx.seenSkus.add(skuKey);
  }

  if (!isVariation) {
    const slug = slugify(mapped.slug || mapped.name);
    if (slug) {
      if (ctx.seenSlugs.has(slug)) {
        issues.push({ row: rowIndex, field: "slug", message: `Duplicate slug "${slug}" within this file — the second row will overwrite the first row's product on import.`, level: "warning" });
      }
      ctx.seenSlugs.add(slug);
    }
  }

  if (!isVariation && !isVariableParent) {
    const price = mapped.salePrice || mapped.regularPrice;
    if (!price) issues.push({ row: rowIndex, field: "price", message: "Missing price (Regular Price or Sale Price).", level: "error" });
    else if (Number.isNaN(Number(price)) || Number(price) < 0) issues.push({ row: rowIndex, field: "price", message: `Invalid price "${price}".`, level: "error" });
  }
  if (mapped.regularPrice && (Number.isNaN(Number(mapped.regularPrice)) || Number(mapped.regularPrice) < 0)) {
    issues.push({ row: rowIndex, field: "regularPrice", message: `Invalid regular price "${mapped.regularPrice}".`, level: "error" });
  }
  if (mapped.stock) {
    const n = Number(mapped.stock);
    if (Number.isNaN(n)) issues.push({ row: rowIndex, field: "stock", message: `Invalid stock quantity "${mapped.stock}".`, level: "warning" });
    else if (n < 0) issues.push({ row: rowIndex, field: "stock", message: `Negative stock quantity "${mapped.stock}" — will be treated as 0.`, level: "warning" });
  }
  if (!isVariation && mapped.status && !isRecognizedWooProductStatus(mapped.status)) {
    issues.push({ row: rowIndex, field: "status", message: `Unrecognized product status "${mapped.status}". It will import as draft.`, level: "warning" });
  }
  if (!isVariation && mapped.stockStatus && !isRecognizedWooStockStatus(mapped.stockStatus)) {
    issues.push({ row: rowIndex, field: "stockStatus", message: `Unrecognized stock status "${mapped.stockStatus}". Stock quantity will be used instead.`, level: "warning" });
  }
  if (!isVariation && mapped.categories.length === 0) {
    issues.push({ row: rowIndex, field: "categories", message: "No category specified.", level: "warning" });
  }
  if (!isVariation && mapped.images.length === 0) {
    issues.push({ row: rowIndex, field: "images", message: "No image URL specified — this product will also have no featured image, since the first Images URL doubles as the featured image.", level: "warning" });
  }
  for (const url of mapped.images) {
    if (!isValidImageUrl(url)) {
      issues.push({ row: rowIndex, field: "images", message: `Image URL does not look valid: "${url}".`, level: "warning" });
    } else if (mapped.sku) {
      const rows = scratch.imageUrlRows.get(url) ?? [];
      rows.push({ row: rowIndex, sku: mapped.sku });
      scratch.imageUrlRows.set(url, rows);
    }
  }
  const dupAttrs = mapped.attributeNames.filter((n, i) => mapped.attributeNames.indexOf(n) !== i);
  if (dupAttrs.length) {
    issues.push({ row: rowIndex, field: "attributes", message: `Duplicate attribute name "${[...new Set(dupAttrs)].join(", ")}" on this row — their values were merged.`, level: "warning" });
  }
  if (isVariation && !mapped.parentSku) {
    issues.push({ row: rowIndex, field: "parentSku", message: "Variation row is missing a Parent SKU.", level: "error" });
  }
  if (isVariation && mapped.parentSku) {
    scratch.variationRefs.push({ row: rowIndex, sku: mapped.sku, parentSku: mapped.parentSku.trim().toLowerCase() });
  }
  if (isVariation && Object.keys(mapped.attributes).length === 0) {
    issues.push({ row: rowIndex, field: "attributes", message: `Variation SKU "${mapped.sku}" has no attributes at all (Color, Size, or otherwise) — it may not be distinguishable from sibling variants.`, level: "warning" });
  }

  return issues;
}

// Runs once after every row has been through validateRow, when ctx.seenSkus
// holds every non-variation SKU in the file — so a variation's parent can
// finally be confirmed missing regardless of which order the rows appeared
// in, and an image URL reused across products can be reported with every
// SKU that shares it.
function finalizeValidation(ctx: ImportRunContext): ValidationIssue[] {
  const scratch = getScratch(ctx);
  const issues: ValidationIssue[] = [];

  for (const ref of scratch.variationRefs) {
    if (!ctx.seenSkus.has(ref.parentSku)) {
      issues.push({
        row: ref.row,
        field: "parentSku",
        message: `Variation SKU "${ref.sku}" references parent SKU "${ref.parentSku}", which does not appear anywhere in this file as a product row.`,
        level: "error",
      });
    }
  }

  for (const [url, rows] of scratch.imageUrlRows) {
    const distinctSkus = new Set(rows.map((r) => r.sku));
    if (distinctSkus.size > 1) {
      issues.push({
        row: rows[0].row,
        field: "images",
        message: `Image URL "${url}" is reused across ${distinctSkus.size} different SKUs (${[...distinctSkus].slice(0, 5).join(", ")}${distinctSkus.size > 5 ? ", …" : ""}).`,
        level: "warning",
      });
    }
  }

  return issues;
}

// Supports WooCommerce's "Parent > Child" category path convention (e.g.
// "WOMEN'S > TOP") by walking each segment and creating/reusing one
// Category per level, linked via the existing CategoryModel.parent field —
// a plain "WOMEN'S" (no ">") still works exactly as before, single level.
//
// The leaf level's slug is deliberately derived from the FULL original
// path (slugify("WOMEN'S > TOP") -> "women-s-top"), not just its own name —
// identical to what this function produced before nesting existed, so
// products already imported under a flat "WOMEN'S > TOP" category keep
// resolving to the same slug (buildProductDoc computes it the same way).
// Only intermediate/root levels are new; their slugs are scoped to their
// own path-so-far (e.g. root "WOMEN'S" -> "womens") so two different
// parents that both have a "TOP" child (e.g. "WOMEN'S > TOP" and
// "MEN'S > TOP") don't collide on CategoryModel's globally-unique slug.
async function ensureCategory(path: string): Promise<void> {
  const segments = path.split(">").map((s) => s.trim()).filter(Boolean);
  if (!segments.length) return;

  let parentId: string | null = null;
  for (let i = 0; i < segments.length; i++) {
    const isLeaf = i === segments.length - 1;
    const slug = isLeaf ? slugify(path) : slugify(segments.slice(0, i + 1).join(" "));
    if (!slug) continue;
    let category = await CategoryModel.findOne({ slug });
    if (!category) category = await CategoryModel.create({ name: segments[i], slug, parent: parentId });
    parentId = String(category._id);
  }
}

async function importVariationRow(mapped: WooMappedRow, ctx: ImportRunContext): Promise<RowResult> {
  const parentKey = mapped.parentSku.trim().toLowerCase();
  let parentId = ctx.skuToId.get(parentKey);
  let parent = parentId ? await ProductModel.findById(parentId) : null;
  if (!parent) parent = await ProductModel.findOne({ sku: mapped.parentSku.trim() });
  if (!parent) {
    // Distinguishes "this parent SKU never appears anywhere in the file"
    // from "the parent row was in this file but failed to import in this
    // same run" — the latter is exactly what happened to ~1,000 variation
    // rows in the mapping-corruption incident (their parents all failed on
    // a missing name, so every variation attached to them then failed too,
    // with the old generic "not found" message giving no hint why).
    const parentFailedThisRun = getRunScratch(ctx).failedParentSkus.has(parentKey);
    const message = parentFailedThisRun
      ? `Variation skipped because parent SKU "${mapped.parentSku}" failed to import.`
      : `Variation SKU "${mapped.sku}" references parent SKU "${mapped.parentSku}", which was not found.`;
    return {
      outcome: "failed",
      message,
      identifier: mapped.sku || mapped.parentSku,
      label: mapped.name,
      reasonCode: parentFailedThisRun ? "parent_import_failed" : "parent_not_found",
    };
  }

  const size = mapped.sizes[0] ?? "";
  const color = mapped.colors[0] ?? "";
  const stock = mapped.stock ? Math.max(0, Number(mapped.stock)) : 0;
  const resolved = resolvePrice(mapped.regularPrice, mapped.salePrice);
  const key = variantKey(mapped.attributes, size, color);

  const existingVariant = parent.variants.find((v: any) => variantKey(v.attributes, v.size ?? "", v.color ?? "") === key);
  const variantDoc = {
    size, color, stock, sku: mapped.sku,
    regularPrice: resolved.regularPrice, salePrice: resolved.salePrice, effectivePrice: resolved.effectivePrice,
    attributes: Object.keys(mapped.attributes).length ? mapped.attributes : undefined,
  };
  if (existingVariant) {
    Object.assign(existingVariant, variantDoc);
  } else {
    parent.variants.push(variantDoc);
  }
  parent.inStock = parent.variants.some((v: any) => v.stock > 0) || parent.inStock;

  // Re-derive the parent's own price/compareAtPrice/priceMax from every
  // variant now on it — not just this one — so the result is correct
  // regardless of what order the variation rows appear in the file, and
  // stays correct as later rows attach. Only overwrites what the parent
  // doesn't already have a real (non-zero) price for from its own row, so a
  // simple product that happens to also carry variants for stock-tracking
  // (see the admin Product Form) never has its manually-set price touched —
  // this path only ever runs for CSV rows explicitly typed "variation".
  const pricing = resolveVariablePricing(parent.variants.map((v: any) => ({ effectivePrice: v.effectivePrice, regularPrice: v.regularPrice })));
  if (pricing.price > 0 || parent.price === 0) {
    parent.price = pricing.price;
    parent.compareAtPrice = pricing.compareAtPrice;
    parent.priceMax = pricing.priceMax;
  }

  await parent.save();
  ctx.skuToId.set(parentKey, String(parent._id));
  return { outcome: "updated", message: `Attached variation "${mapped.sku}" to parent "${mapped.parentSku}".` };
}

async function importRow(mapped: WooMappedRow, _rowIndex: number, ctx: ImportRunContext): Promise<RowResult> {
  if (mapped.type === "variation") return importVariationRow(mapped, ctx);

  for (const c of mapped.categories) await ensureCategory(c);
  const doc = buildProductDoc(mapped);
  const slug = doc.slug as string;

  // Duplicate detection: SKU first, then slug — never create a second
  // Product for data that already exists under either identifier. Looks up
  // by doc.sku (already trimmed by buildProductDoc), not the raw mapped.sku,
  // so this can never search for a different value than the one about to be
  // written.
  let existing = await ProductModel.findOne({ sku: doc.sku as string });
  if (!existing && slug) existing = await ProductModel.findOne({ slug });

  if (existing) {
    ctx.skuToId.set(mapped.sku.trim().toLowerCase(), String(existing._id));
    if (ctx.duplicateStrategy === "skip") {
      return { outcome: "skipped", message: `Product with SKU "${mapped.sku}" already exists.` };
    }
    // Rollback-prep: capture exactly the fields this write is about to
    // overwrite, before overwriting them — see RowResult.snapshot.
    const previousValues: Record<string, unknown> = {};
    for (const key of Object.keys(doc)) previousValues[key] = (existing as any)[key];
    Object.assign(existing, doc);
    try {
      await existing.save();
    } catch (err) {
      return productWriteFailure(mapped, ctx, err);
    }
    return { outcome: "updated", snapshot: { identifier: mapped.sku, documentId: String(existing._id), previousValues } };
  }

  try {
    const created = await ProductModel.create(doc);
    ctx.skuToId.set(mapped.sku.trim().toLowerCase(), String(created._id));
    return { outcome: "imported" };
  } catch (err) {
    return productWriteFailure(mapped, ctx, err);
  }
}

// Caught here (rather than left to the engine's generic per-row try/catch)
// specifically so a failed parent/simple row can be recorded before any of
// its own variation rows are processed later in the same run — that's what
// lets importVariationRow's "parent failed to import" message (above)
// distinguish a parent that failed just now from one that's genuinely
// absent from the file. This is exactly the failure mode from the
// mapping-corruption incident: ~308 parent rows failing Mongoose's
// name/slug `required` check, which cascaded into ~1,000 variation rows all
// reporting a generic, unhelpful "not found".
function productWriteFailure(mapped: WooMappedRow, ctx: ImportRunContext, err: unknown): RowResult {
  const key = mapped.sku.trim().toLowerCase();
  if (key) getRunScratch(ctx).failedParentSkus.add(key);
  return {
    outcome: "failed",
    message: err instanceof Error ? err.message : "Unknown error.",
    identifier: mapped.sku,
    label: mapped.name,
    reasonCode: "product_write_failed",
  };
}

export const wooProductImporter: ImporterModule<WooMappedRow> = {
  key: "products",
  label: "Products",
  description: "Import products from a WooCommerce Product CSV export — simple and variable products, attributes, and variations.",
  icon: "Package",
  status: "available",
  targetFields: TARGET_FIELDS,
  mapRow,
  validateRow,
  finalizeValidation,
  importRow,
};
