import "server-only";

// Fields searched across for both the instant dropdown (/api/search) and the
// dedicated results page (/api/products?q=) so the two stay consistent.
const SEARCHABLE_FIELDS = ["name", "collection", "category", "description", "sku", "tags"] as const;

export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildSearchFilter(q: string): Record<string, unknown> {
  const rx = new RegExp(escapeRegex(q.trim()), "i");
  return { $or: SEARCHABLE_FIELDS.map((field) => ({ [field]: rx })) };
}

// Gates storefront visibility now that the Admin CMS can save a product as a
// draft (see the `status` field on Product). Missing `status` — every
// product seeded before this field existed — counts as visible, so no
// backfill/migration is needed for existing data. Admin routes query
// ProductModel directly without this filter, since they need to see drafts
// (and archived products, which this excludes the same way).
export const STOREFRONT_VISIBLE: Record<string, unknown> = {
  $or: [{ status: "published" }, { status: { $exists: false } }],
  archived: { $ne: true },
};

// Test/demo products remain available in Admin but not storefront discovery.
export const STOREFRONT_EXCLUDE_TEST_PRODUCTS: Record<string, unknown> = {
  $nor: [{ name: /^Test Product/i }, { sku: /^TEST/i }],
};

// The isolation boundary between the Shop and Retail catalogs — every
// storefront-facing product query (listing, detail, related-products) goes
// through this rather than reading `productType` inline, so "what counts as
// Shop vs Retail" can never drift between call sites. "shop" matches both
// an explicit productType:"shop" AND a missing one (every product that
// existed before this field did), which is what makes adding Retail a
// zero-regression change for the existing Shop catalog.
export function productTypeFilter(type: "shop" | "retail"): Record<string, unknown> {
  return type === "retail" ? { productType: "retail" } : { productType: { $ne: "retail" } };
}

// Shared query-param -> Mongo filter/sort/pagination parsing for both
// /api/products (Shop) and /api/retail/products (Retail) — identical
// filtering capability for both, one definition instead of two copies that
// could quietly drift apart. Each route composes the result with its own
// STOREFRONT_VISIBLE + productTypeFilter(...) rather than baking catalog
// isolation in here, since that boundary is the one thing that must never
// be the same between the two callers.
const LISTING_SORT_MAP: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1, _id: -1 },
  "price-asc": { price: 1, _id: -1 },
  "price-desc": { price: -1, _id: -1 },
  popularity: { reviewCount: -1, rating: -1, _id: -1 },
  "best-selling": { salesCount: -1, _id: -1 },
};

export function buildProductListingQuery(sp: URLSearchParams) {
  const filter: Record<string, unknown> = {};
  // Navigation links, browser history and manually-edited URLs can all
  // contain whitespace, empty entries or repeated values. Normalising once
  // keeps those values from producing misleading zero-result queries.
  const csv = (k: string) => [...new Set(
    (sp.get(k) ?? "").split(",").map((value) => value.trim()).filter(Boolean)
  )];

  const categories = csv("category");
  if (categories.length) {
    const parentCategories = new Set(["men-s", "women-s", "unisex"]);
    filter.category = { $in: categories.flatMap((category) => parentCategories.has(category)
      ? [category, new RegExp(`^${escapeRegex(category)}-`)]
      : [category]) };
  }
  if (csv("collection").length) filter.collection = { $in: csv("collection") };
  if (csv("gender").length) filter.gender = { $in: csv("gender") };
  if (csv("color").length) filter.colors = { $in: csv("color") };
  if (csv("size").length) filter.sizes = { $in: csv("size") };
  if (csv("tags").length) filter.tags = { $in: csv("tags") };
  const brands = csv("brand");
  if (brands.length) {
    // Older Woo imports preserved brand values in tags before Product.brand
    // existed. Query both locations so those live products remain filterable
    // while all future imports use the dedicated indexed field.
    const brandMatchers = brands.map((brand) => new RegExp(`^${escapeRegex(brand)}$`, "i"));
    filter.$or = [{ brand: { $in: brandMatchers } }, { tags: { $in: brandMatchers } }];
  }
  if (sp.get("isNew") === "true") filter.isNew = true;
  if (sp.get("isBestSeller") === "true") filter.isBestSeller = true;
  if (sp.get("isTrending") === "true") filter.isTrending = true;
  if (sp.get("isLimited") === "true") filter.isLimited = true;
  if (sp.get("inStock") === "true") filter.inStock = true;

  const min = Number(sp.get("minPrice"));
  const max = Number(sp.get("maxPrice"));
  if (!Number.isNaN(min) && sp.get("minPrice")) filter.price = { ...(filter.price as object), $gte: min };
  if (!Number.isNaN(max) && sp.get("maxPrice")) filter.price = { ...(filter.price as object), $lte: max };

  const q = sp.get("q")?.trim();
  if (q) {
    const searchFilter = buildSearchFilter(q);
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, searchFilter];
      delete filter.$or;
    } else Object.assign(filter, searchFilter);
  }

  const sort = LISTING_SORT_MAP[sp.get("sort") ?? "newest"] ?? LISTING_SORT_MAP.newest;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(48, Number(sp.get("limit")) || 12);

  return { filter, sort, page, limit };
}
