import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ProductModel } from "@/models/Product";
import { STOREFRONT_VISIBLE, STOREFRONT_EXCLUDE_TEST_PRODUCTS, productTypeFilter } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  await dbConnect();
  const { slug } = await params;
  const product = await ProductModel.findOne({ slug, ...STOREFRONT_VISIBLE }).lean<any>();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  // Scoped by the found product's own type — see getProductBySlug() in
  // src/lib/data.ts (used by the actual /product/[slug] page) for the same
  // reasoning; this route is that page's client-fetchable API counterpart.
  const related = await ProductModel.find({
    category: product.category,
    _id: { $ne: product._id },
    ...STOREFRONT_VISIBLE,
    ...STOREFRONT_EXCLUDE_TEST_PRODUCTS,
    ...productTypeFilter(product.productType === "retail" ? "retail" : "shop"),
  })
    .limit(4)
    .lean();

  return NextResponse.json({ product, related });
}
