import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ProductModel } from "@/models/Product";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { buildProductFilter } from "@/lib/adminProductFilter";
import { validateStockQuantity, validateProductType } from "@/lib/validation";

export const dynamic = "force-dynamic";

const REQUIRED = ["name", "slug", "sku", "price"] as const;

// GET — admin product list: search, status filter, pagination. Deliberately
// its own query (not /api/products) since it must see drafts and doesn't
// need the storefront's category/collection/color/size faceting.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const sp = req.nextUrl.searchParams;
  const filter = buildProductFilter({ q: sp.get("q"), status: sp.get("status"), category: sp.get("category"), productType: sp.get("productType") });

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(100, Number(sp.get("limit")) || 20);

  // _id is a required tiebreaker, not cosmetic: most WooCommerce-imported
  // products have no createdAt at all (see the Product.isNew/Document.isNew
  // collision documented in ADMIN_CMS.md), so sorting by createdAt alone
  // ties hundreds of documents together. MongoDB does not guarantee a
  // stable order for ties across separate skip/limit queries — without a
  // unique secondary key, the same product can be returned on two
  // different pages, rendering the same _id twice in one list.
  const [items, total] = await Promise.all([
    ProductModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ProductModel.countDocuments(filter),
  ]);

  return NextResponse.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
}

// POST — create a product.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const missing = REQUIRED.filter((k) => !body[k]);
  if (missing.length) return NextResponse.json({ error: `Missing required fields: ${missing.join(", ")}.` }, { status: 400 });

  // Required on create — the dropdown-or-custom distinction is purely a
  // form-UI concept (see ProductForm.tsx); only the resolved integer ever
  // reaches here, and this is what actually enforces it isn't skippable by
  // calling the API directly.
  const stockResult = validateStockQuantity(body.stock);
  if (!stockResult.ok) return NextResponse.json({ error: stockResult.error }, { status: 400 });
  body.stock = stockResult.value;

  const productTypeResult = validateProductType(body.productType);
  if (!productTypeResult.ok) return NextResponse.json({ error: productTypeResult.error }, { status: 400 });
  body.productType = productTypeResult.value;

  // Same rule as the PATCH route: a product created WITH variants gets its
  // `inStock` derived from real variant stock, not whatever the form's
  // manual checkbox happened to be set to.
  if (Array.isArray(body.variants) && body.variants.length > 0) {
    body.inStock = body.variants.some((v: any) => Number(v?.stock) > 0);
  }

  await dbConnect();
  const existing = await ProductModel.findOne({ slug: body.slug });
  if (existing) return NextResponse.json({ error: "A product with that slug already exists." }, { status: 409 });

  const product = await ProductModel.create(body);
  logActivity({
    type: "product_create", adminUserId: String(admin._id), targetType: "Product", targetId: String(product._id),
    message: `${admin.email} created product "${product.name}".`,
  });

  return NextResponse.json({ product }, { status: 201 });
}
