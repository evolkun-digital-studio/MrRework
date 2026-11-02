import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ProductModel } from "@/models/Product";
import { STOREFRONT_VISIBLE, productTypeFilter, buildProductListingQuery } from "@/lib/search";

export const dynamic = "force-dynamic";

// The Retail counterpart of /api/products — identical filtering/sorting/
// pagination capability (both routes share buildProductListingQuery(), see
// src/lib/search.ts), differing only in the one filter clause that actually
// matters for isolation: productTypeFilter("retail") here vs "shop" there.
// A Shop product can never appear in this response, and vice versa.
export async function GET(req: NextRequest) {
  await dbConnect();
  const { filter, sort, page, limit } = buildProductListingQuery(req.nextUrl.searchParams);

  const visibleFilter = { $and: [filter, STOREFRONT_VISIBLE, productTypeFilter("retail")] };
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
