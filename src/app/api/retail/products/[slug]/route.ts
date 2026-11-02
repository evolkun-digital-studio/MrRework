import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ProductModel } from "@/models/Product";
import { STOREFRONT_VISIBLE, STOREFRONT_EXCLUDE_TEST_PRODUCTS, productTypeFilter } from "@/lib/search";

export const dynamic = "force-dynamic";

// Mirrors /api/products/[slug] — same shape, scoped to the Retail catalog
// on both the lookup itself (a Shop product's slug 404s here) and its
// related-products query (so "related retail products" can never surface a
// Shop item that happens to share a category).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  await dbConnect();
  const { slug } = await params;
  const product = await ProductModel.findOne({ slug, ...STOREFRONT_VISIBLE, ...productTypeFilter("retail") }).lean<any>();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const related = await ProductModel.find({
    category: product.category,
    _id: { $ne: product._id },
    ...STOREFRONT_VISIBLE,
    ...STOREFRONT_EXCLUDE_TEST_PRODUCTS,
    ...productTypeFilter("retail"),
  })
    .limit(4)
    .lean();

  return NextResponse.json({ product, related });
}
