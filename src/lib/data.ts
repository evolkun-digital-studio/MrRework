import "server-only";
import { dbConnect } from "./mongodb";
import { ProductModel } from "@/models/Product";
import { CategoryModel } from "@/models/Category";
import { OrderModel } from "@/models/Order";
import { BlogPostModel } from "@/models/BlogPost";
import { PageModel } from "@/models/Page";
import { RetailSettingsModel } from "@/models/RetailSettings";
import { PromoBannerModel } from "@/models/PromoBanner";
import { PromoMediaItemModel } from "@/models/PromoMediaItem";
import { ReviewModel } from "@/models/Review";
import { ShopTheLookModel } from "@/models/ShopTheLook";
import { ShopByCategorySectionModel } from "@/models/ShopByCategorySection";
import { LuxuryPromoSectionModel } from "@/models/LuxuryPromoSection";
import { HomepageCollectionsModel } from "@/models/HomepageCollections";
import { STOREFRONT_VISIBLE, STOREFRONT_EXCLUDE_TEST_PRODUCTS, productTypeFilter } from "./search";
import type { Product, Category, Order, BlogPost, Page, PromoBanner, PromoMediaItem, FeaturedReview, ShopTheLook, ShopByCategorySection, ShopByCategoryCard, LuxuryPromoSectionData, HomepageCollectionsData, HomepageCollectionSettings } from "./types";

// Published + publicly visible — the same "safe default" reasoning as
// STOREFRONT_VISIBLE: private/password-protected content and anything not
// yet published never appears on public listing/detail routes, even via a
// guessed slug.
const CONTENT_VISIBLE = { status: "published", visibility: "public" };

// Direct DB access for React Server Components (no internal HTTP round-trip).
function ser<T>(d: unknown): T {
  return JSON.parse(JSON.stringify(d)) as T;
}

export async function getFeatured(limit = 5): Promise<Product[]> {
  await dbConnect();
  // Excludes "collection-04" rather than requiring some other flag —
  // that tag is exclusively the handful of legacy dev-seed products whose
  // images are placeholder gradients (not real photography), and no
  // isBestSeller/isNew/createdAt signal reliably distinguishes "real
  // catalog" products from that seed data (isBestSeller/isNew are unset on
  // every real product, and createdAt is unset from the bulk import) —
  // this exclusion is the one filter that's actually reliable. Sorting by
  // _id (its embedded timestamp) approximates "newest first" for the real
  // catalog in place of the missing createdAt field.
  const docs = await ProductModel.find({
    collection: { $ne: "collection-04" },
    "images.0": { $exists: true },
    ...STOREFRONT_VISIBLE,
    ...STOREFRONT_EXCLUDE_TEST_PRODUCTS,
  })
    .sort({ _id: -1 })
    .limit(limit)
    .lean();
  return ser<Product[]>(docs);
}

// `excludeIds` lets a caller that already fetched products elsewhere on the
// same page (e.g. the homepage's Bestsellers rail via getFeatured()) keep
// this section from repeating them — same idea as excluding "collection-04"
// below, just per-call instead of permanent.
export async function getNewArrivals(limit = 4, excludeIds: string[] = []): Promise<Product[]> {
  await dbConnect();
  // Same "collection-04" + "images.0 exists" exclusion as getFeatured()
  // above, for the same reason (legacy placeholder-gradient seed data).
  // Primary tier is manually-curated isTrending products (set via the admin
  // bulk actions); fallback tier is newest-arrivals, so the rail always
  // fills to `limit` even before any product has been marked trending, and
  // keeps filling the remainder once some have. Sorted by _id (its embedded
  // timestamp) rather than createdAt, which is unset on every bulk-imported
  // real product.
  const baseFilter = {
    collection: { $ne: "collection-04" },
    "images.0": { $exists: true },
    ...(excludeIds.length ? { _id: { $nin: excludeIds } } : {}),
    ...STOREFRONT_VISIBLE,
    ...STOREFRONT_EXCLUDE_TEST_PRODUCTS,
  };
  const docs = await ProductModel.find({ ...baseFilter, isTrending: true }).sort({ _id: -1 }).limit(limit).lean();
  const arr = ser<Product[]>(docs);
  if (arr.length >= limit) return arr;
  const more = ser<Product[]>(await ProductModel.find(baseFilter).sort({ _id: -1 }).limit(limit).lean());
  return [...arr, ...more.filter((m) => !arr.find((a) => a._id === m._id))].slice(0, limit);
}

// `productType` scopes the per-category counts only (e.g. the Retail page's
// sidebar showing "12" for a category should count Retail products, not
// Shop ones sharing that same category) — the category list itself is one
// shared taxonomy across both catalogs, not duplicated per catalog.
export async function getCategories(productType: "shop" | "retail" = "shop"): Promise<Category[]> {
  await dbConnect();
  const cats = ser<Category[]>(await CategoryModel.find().sort({ order: 1 }).lean());
  const counts = await ProductModel.aggregate([
    { $match: { ...STOREFRONT_VISIBLE, ...STOREFRONT_EXCLUDE_TEST_PRODUCTS, ...productTypeFilter(productType) } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);
  const map = new Map(counts.map((c: { _id: string; count: number }) => [c._id, c.count]));
  const parentCategories = new Set(["men-s", "women-s", "unisex"]);
  return cats.map((c) => ({
    ...c,
    count: parentCategories.has(c.slug)
      ? counts.reduce((total: number, entry: { _id: string; count: number }) =>
          entry._id === c.slug || entry._id?.startsWith(`${c.slug}-`) ? total + entry.count : total, 0)
      : map.get(c.slug) ?? 0,
  }));
}

const DEFAULT_SHOP_BY_CATEGORY: ShopByCategorySection = {
  enabled: true, title: "Shop by Category", subtitle: "Discover our collections",
  categories: ["men-s", "women-s", "premium", "accessories", "unisex"].map((categorySlug, displayOrder) => ({ categorySlug, enabled: true, displayOrder })),
};

export async function getShopByCategory(): Promise<{ section: ShopByCategorySection; cards: ShopByCategoryCard[] }> {
  await dbConnect();
  const stored = await ShopByCategorySectionModel.findOne().lean();
  const section = ser<ShopByCategorySection>(stored ?? DEFAULT_SHOP_BY_CATEGORY);
  if (!section.enabled) return { section, cards: [] };
  const categories = await getCategories("shop");
  const cards: ShopByCategoryCard[] = [];
  const items = [...section.categories].filter((entry) => entry.enabled).sort((a, b) => a.displayOrder - b.displayOrder);
  const slugs = items.map((item) => item.categorySlug);
  const products = await ProductModel.find({ category: { $in: slugs }, "images.0": { $exists: true }, ...STOREFRONT_VISIBLE, ...productTypeFilter("shop") })
    .sort({ reviewCount: -1, createdAt: -1, _id: -1 }).select("category name sku images createdAt").lean<{ category: string; name?: string; sku?: string; images?: string[]; createdAt?: Date | string }[]>();
  const imageUse = new Map<string, number>();
  for (const product of products) {
    const image = product.images?.find(Boolean);
    if (image) imageUse.set(image, (imageUse.get(image) ?? 0) + 1);
  }
  const representativeProducts = products.filter((product) => {
    const name = product.name ?? "";
    const sku = product.sku ?? "";
    const repeatedImage = Boolean(product.images?.find((image) => (imageUse.get(image) ?? 0) >= 5));
    return !/^(test|demo|sample)\s+product/i.test(name) && !/^(TEST|DEMO|SAMPLE)/i.test(sku) && !repeatedImage;
  });
  const productByCategory = new Map<string, { images?: string[] }>();
  for (const product of representativeProducts) if (!productByCategory.has(product.category)) productByCategory.set(product.category, product);
  for (const item of items) {
    const category = categories.find((entry) => entry.slug === item.categorySlug);
    if (!category || !category.count) continue;
    const image = item.customImage || category.image || productByCategory.get(category.slug)?.images?.find(Boolean) || "";
    if (image) cards.push({ ...category, image });
  }
  return { section, cards };
}

export async function getActivePromoBanners(): Promise<PromoBanner[]> {
  await dbConnect();
  const docs = await PromoBannerModel.find({ isActive: true }).sort({ order: 1 }).lean();
  return ser<PromoBanner[]>(docs);
}

export async function getActivePromoMediaItems(): Promise<PromoMediaItem[]> {
  await dbConnect();
  const docs = await PromoMediaItemModel.find({ isActive: true }).sort({ order: 1 }).lean();
  return ser<PromoMediaItem[]>(docs);
}

// Returns null when nothing's been saved yet (or a card has no heading set)
// so the homepage's <LuxuryPromoSection> falls back to its own hardcoded
// defaults exactly as it did before this CMS existed — see that
// component's DEFAULT_LEFT/DEFAULT_RIGHT.
export async function getLuxuryPromoSection(): Promise<LuxuryPromoSectionData | null> {
  await dbConnect();
  const doc = await LuxuryPromoSectionModel.findOne().lean<any>();
  if (!doc || !doc.left?.heading || !doc.right?.heading) return null;
  return ser<LuxuryPromoSectionData>({ left: doc.left, right: doc.right });
}

// Admin -> Content -> Homepage Collections — governs the Latest Drops
// (isNew), Best Selling (isBestSeller), and Trending (isTrending) copy/CTA,
// plus the manual/automatic curation for the Best Selling and Trending
// homepage teaser rails specifically (Latest Drops has no rail; its
// dedicated /latest-drops page uses this only for heading copy).
export async function getHomepageCollections(): Promise<HomepageCollectionsData | null> {
  await dbConnect();
  const doc = await HomepageCollectionsModel.findOne().lean<any>();
  return doc ? ser<HomepageCollectionsData>(doc) : null;
}

// Shared resolver for the Best Selling/Trending homepage rails — manual mode
// returns the curated productIds in the order they were selected (filling
// any shortfall from the automatic tier so the rail still reaches `limit`);
// automatic mode is the same flag-primary + newest-fill shape
// getNewArrivals() already uses. Deliberately a NEW function, not a change
// to getFeatured()/getNewArrivals() above — those stay exactly as they were
// and remain available to any other caller.
async function resolveHomeCollectionRail(
  flag: "isBestSeller" | "isTrending",
  settings: HomepageCollectionSettings | undefined,
  excludeIds: string[]
): Promise<Product[]> {
  await dbConnect();
  const limit = settings?.limit ?? 10;
  const baseFilter = {
    collection: { $ne: "collection-04" },
    "images.0": { $exists: true },
    ...(excludeIds.length ? { _id: { $nin: excludeIds } } : {}),
    ...STOREFRONT_VISIBLE,
    ...STOREFRONT_EXCLUDE_TEST_PRODUCTS,
  };

  if (settings?.mode === "manual" && settings.productIds?.length) {
    const docs = await ProductModel.find({ _id: { $in: settings.productIds }, ...baseFilter }).lean();
    const byId = new Map(docs.map((d: any) => [String(d._id), d]));
    const ordered = settings.productIds.map((id) => byId.get(String(id))).filter(Boolean) as Record<string, unknown>[];
    if (ordered.length >= limit) return ser<Product[]>(ordered.slice(0, limit));
    const more = await ProductModel.find({ ...baseFilter, [flag]: true, _id: { $nin: [...byId.keys()] } }).sort({ _id: -1 }).limit(limit - ordered.length).lean();
    return ser<Product[]>([...ordered, ...more]);
  }

  const primary = await ProductModel.find({ ...baseFilter, [flag]: true }).sort({ _id: -1 }).limit(limit).lean();
  const arr = ser<Product[]>(primary);
  if (arr.length >= limit) return arr;
  const more = ser<Product[]>(await ProductModel.find(baseFilter).sort({ _id: -1 }).limit(limit).lean());
  return [...arr, ...more.filter((m) => !arr.find((a) => a._id === m._id))].slice(0, limit);
}

export async function getBestSellingHomeProducts(excludeIds: string[] = []): Promise<Product[]> {
  const settings = await getHomepageCollections();
  if (settings && !settings.bestSelling.enabled) return [];
  return resolveHomeCollectionRail("isBestSeller", settings?.bestSelling, excludeIds);
}

export async function getTrendingHomeProducts(excludeIds: string[] = []): Promise<Product[]> {
  const settings = await getHomepageCollections();
  if (settings && !settings.trending.enabled) return [];
  return resolveHomeCollectionRail("isTrending", settings?.trending, excludeIds);
}

// Powers the homepage "Happy Customers" section — admin-curated via the
// existing Admin -> Reviews moderation page's Feature toggle (see
// src/app/admin/(dashboard)/reviews/page.tsx), no separate CMS needed.
export async function getFeaturedReviews(limit = 8): Promise<FeaturedReview[]> {
  await dbConnect();
  const docs = await ReviewModel.find({ status: "approved", featured: true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("product", "name slug price priceMax images")
    .lean();
  return ser<FeaturedReview[]>(docs);
}

// Powers the homepage "Shop The Look" carousel — Admin -> Content -> Shop
// The Look. Each slide's hotspots.product is populated so the frontend
// hotspot popup can show image/name/price without a second round-trip.
export async function getActiveShopTheLooks(): Promise<ShopTheLook[]> {
  await dbConnect();
  const docs = await ShopTheLookModel.find({ isActive: true })
    .sort({ order: 1 })
    .populate("hotspots.product", "name slug price priceMax images rating")
    .lean();
  return ser<ShopTheLook[]>(docs);
}

export async function getCollectionProductCount(collection: string, productType: "shop" | "retail" = "shop"): Promise<number> {
  await dbConnect();
  return ProductModel.countDocuments({ collection, ...STOREFRONT_VISIBLE, ...productTypeFilter(productType) });
}

export async function getProductBySlug(slug: string): Promise<{ product: Product; related: Product[] } | null> {
  await dbConnect();
  // Deliberately no productType filter on the lookup itself — a single
  // /product/[slug] page serves both catalogs (a product's own detail
  // rendering doesn't differ by which catalog it's in, only which listing
  // pages surface it), so a Shop or Retail slug is equally valid here.
  const product = await ProductModel.findOne({ slug, ...STOREFRONT_VISIBLE }).lean<Record<string, unknown>>();
  if (!product) return null;
  // Related products ARE scoped — by the found product's own type, so a
  // Retail product's "related" list can never surface a Shop item (or vice
  // versa) just because they share a category.
  const related = await ProductModel.find({
    category: product.category,
    _id: { $ne: product._id },
    ...STOREFRONT_VISIBLE,
    ...STOREFRONT_EXCLUDE_TEST_PRODUCTS,
    ...productTypeFilter((product.productType as "shop" | "retail" | undefined) === "retail" ? "retail" : "shop"),
  }).limit(4).lean();
  return { product: ser<Product>(product), related: ser<Product[]>(related) };
}

// Read-only accessor for the /retail page (and the public /api/retail/cms
// route, its client-fetchable equivalent) — never creates the singleton
// document (unlike the admin route's getOrCreateRetailSettings()), since a
// storefront page render must never have a write side effect; a store that
// has never touched Settings > Retail Management just renders every
// section with its schema defaults (hero.enabled: true, empty copy, etc.).
export async function getRetailSettings(): Promise<Record<string, unknown> | null> {
  await dbConnect();
  const settings = await RetailSettingsModel.findOne().lean();
  return settings ? ser<Record<string, unknown>>(settings) : null;
}

// Resolves Settings > Retail Management > Featured Retail Products into
// actual product documents — "manual" returns the curated productIds in
// the order they were selected (falls back to the automatic tier for any
// that no longer exist/aren't visible, rather than showing fewer than
// intended); "automatic" is just the newest Retail products, mirroring
// getNewArrivals()'s own newest-first fallback tier above. Always capped at
// maxProducts and always Retail-only + storefront-visible.
export async function getRetailFeaturedProducts(): Promise<Product[]> {
  const settings = await getRetailSettings();
  const featured = (settings?.featured as { mode?: string; productIds?: string[]; maxProducts?: number } | undefined) ?? {};
  const maxProducts = featured.maxProducts ?? 8;
  const baseFilter = { ...STOREFRONT_VISIBLE, ...productTypeFilter("retail") };

  if (featured.mode === "manual" && featured.productIds?.length) {
    const docs = await ProductModel.find({ _id: { $in: featured.productIds }, ...baseFilter }).limit(maxProducts).lean();
    const byId = new Map(docs.map((d: any) => [String(d._id), d]));
    // Preserves the admin's chosen order (Mongo's $in doesn't) — a
    // productId that's been deleted/archived/moved back to Shop since
    // selection just silently drops out rather than erroring.
    const ordered = featured.productIds.map((id) => byId.get(String(id))).filter(Boolean) as Record<string, unknown>[];
    if (ordered.length >= maxProducts) return ser<Product[]>(ordered.slice(0, maxProducts));
    const more = await ProductModel.find({ ...baseFilter, _id: { $nin: [...byId.keys()] } }).sort({ _id: -1 }).limit(maxProducts - ordered.length).lean();
    return ser<Product[]>([...ordered, ...more]);
  }

  const docs = await ProductModel.find(baseFilter).sort({ _id: -1 }).limit(maxProducts).lean();
  return ser<Product[]>(docs);
}

export async function getAllSlugs(): Promise<string[]> {
  await dbConnect();
  const docs = await ProductModel.find(STOREFRONT_VISIBLE).select("slug").lean<{ slug: string }[]>();
  return docs.map((d) => d.slug);
}

export async function getOrderByNumber(orderNumber: string): Promise<Order | null> {
  await dbConnect();
  const order = await OrderModel.findOne({ orderNumber }).lean<Record<string, unknown>>();
  return order ? ser<Order>(order) : null;
}

export async function getPublishedBlogPosts(limit = 50): Promise<BlogPost[]> {
  await dbConnect();
  const docs = await BlogPostModel.find(CONTENT_VISIBLE).sort({ publishedAt: -1, createdAt: -1 }).limit(limit).lean();
  return ser<BlogPost[]>(docs);
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  await dbConnect();
  const doc = await BlogPostModel.findOne({ slug, ...CONTENT_VISIBLE }).lean<Record<string, unknown>>();
  return doc ? ser<BlogPost>(doc) : null;
}

export async function getAllBlogSlugs(): Promise<string[]> {
  await dbConnect();
  const docs = await BlogPostModel.find(CONTENT_VISIBLE).select("slug").lean<{ slug: string }[]>();
  return docs.map((d) => d.slug);
}

export async function getPageBySlug(slug: string): Promise<Page | null> {
  await dbConnect();
  const doc = await PageModel.findOne({ slug, ...CONTENT_VISIBLE }).lean<Record<string, unknown>>();
  return doc ? ser<Page>(doc) : null;
}

export async function getAllPageSlugs(): Promise<string[]> {
  await dbConnect();
  const docs = await PageModel.find(CONTENT_VISIBLE).select("slug").lean<{ slug: string }[]>();
  return docs.map((d) => d.slug);
}
