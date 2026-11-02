import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ProductModel } from "@/models/Product";
import { STOREFRONT_VISIBLE, STOREFRONT_EXCLUDE_TEST_PRODUCTS, productTypeFilter, buildProductListingQuery } from "@/lib/search";

export const dynamic = "force-dynamic";

// _id is a required tiebreaker on every sort mode, not cosmetic: most
// WooCommerce-imported products have no createdAt at all (see the
// Product.isNew/Document.isNew collision documented in ADMIN_CMS.md), and
// plenty share the same price/reviewCount/rating/salesCount too. MongoDB
// does not guarantee a stable order for ties across separate skip/limit
// queries — without a unique secondary key, the same product can be
// returned on two different "Load more" pages, rendering the same _id
// twice in one list (and skipping a different product entirely). See
// buildProductListingQuery() in src/lib/search.ts for where this now lives
// (shared with /api/retail/products, which has the identical requirement).
export async function GET(req: NextRequest) {
  await dbConnect();
  const { filter, sort, page, limit } = buildProductListingQuery(req.nextUrl.searchParams);

  // Wrapped in $and (rather than merged into `filter`) so this never
  // collides with an `$or` the filter above may already carry from `q`.
  // productTypeFilter("shop") is the Retail-isolation boundary — see its
  // comment in search.ts for why this is a no-op for every product that
  // predates the Retail catalog.
  const visibleFilter = { $and: [filter, STOREFRONT_VISIBLE, STOREFRONT_EXCLUDE_TEST_PRODUCTS, productTypeFilter("shop")] };
  const [items, total] = await Promise.all([
    ProductModel.find(visibleFilter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    ProductModel.countDocuments(visibleFilter),
  ]);

  return NextResponse.json({
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    hasMore: page * limit < total,
  });
}
