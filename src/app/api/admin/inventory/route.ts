import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ProductModel } from "@/models/Product";
import { ActivityLogModel } from "@/models/ActivityLog";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { variantKey } from "@/lib/utils";

export const dynamic = "force-dynamic";

// GET — every product's stock picture, plus its recent inventory-adjustment
// history from the shared ActivityLog collection (type:"inventory_adjustment").
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const filterParam = req.nextUrl.searchParams.get("filter"); // "low" | "out"
  // Capped as a safety net — the low/out-of-stock filters below run in
  // memory over this full set, so this can't be a real paginated `.limit()`
  // without changing that logic; it's just a guard against unbounded growth.
  const products = await ProductModel.find().select("name slug sku variants inStock images").sort({ name: 1 }).limit(5000).lean();

  const items = (products as any[]).map((p) => {
    const totalStock = p.variants?.length ? p.variants.reduce((n: number, v: any) => n + (v.stock ?? 0), 0) : p.inStock ? null : 0;
    return { _id: p._id, name: p.name, slug: p.slug, sku: p.sku, image: p.images?.[0] ?? "", variants: p.variants ?? [], totalStock, inStock: p.inStock };
  });

  const filtered = filterParam === "low"
    ? items.filter((i) => i.totalStock !== null && i.totalStock > 0 && i.totalStock <= 5)
    : filterParam === "out"
    ? items.filter((i) => i.totalStock === 0 || (i.totalStock === null && !i.inStock))
    : items;

  const history = await ActivityLogModel.find({ type: "inventory_adjustment" }).sort({ createdAt: -1 }).limit(20).lean();

  return NextResponse.json({ items: filtered, history });
}

// PATCH — adjust a specific variant's stock (or the simple inStock flag for
// variant-less products), logging the change to ActivityLog for history.
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { productId, variantKey: targetVariantKey, variantSize, variantColor, stock, reason } = body ?? {};
  if (!productId) return NextResponse.json({ error: "productId is required." }, { status: 400 });

  await dbConnect();
  const product = await ProductModel.findById(productId);
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  if (targetVariantKey) {
    // Matched by the variant's full canonical identity (attributes when
    // present, size+colour fallback otherwise — see variantKey() in
    // lib/utils.ts), not size+colour alone: a WooCommerce "bundle" product's
    // variants are commonly distinguished by an attribute like Quantity
    // instead, in which case every variant shares size="" colour="" and a
    // size+colour-only match would silently hit the wrong variant (or none
    // at all, if a request happened to reach the branch below instead).
    const variant = product.variants.find((v: any) => variantKey(v.attributes, v.size ?? "", v.color ?? "") === targetVariantKey);
    if (!variant) return NextResponse.json({ error: "Variant not found." }, { status: 404 });
    const previous = variant.stock;
    variant.stock = Math.max(0, Number(stock));
    product.inStock = product.variants.some((v: any) => v.stock > 0);
    await product.save();

    logActivity({
      type: "inventory_adjustment", adminUserId: String(admin._id), targetType: "Product", targetId: String(product._id),
      message: `${admin.email} set stock for ${product.name} (${variantColor || variantSize ? `${variantColor} / ${variantSize}` : targetVariantKey}) from ${previous} to ${variant.stock}.${reason ? ` Reason: ${reason}` : ""}`,
      meta: { variantKey: targetVariantKey, variantSize, variantColor, previous, next: variant.stock, reason },
    });
  } else {
    product.inStock = !!stock;
    await product.save();
    logActivity({
      type: "inventory_adjustment", adminUserId: String(admin._id), targetType: "Product", targetId: String(product._id),
      message: `${admin.email} set ${product.name} to ${product.inStock ? "in stock" : "out of stock"}.`,
    });
  }

  return NextResponse.json({ product });
}
