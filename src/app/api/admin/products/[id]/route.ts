import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ProductModel } from "@/models/Product";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { isValidObjectId, invalidIdResponse, validateStockQuantity, validateProductType } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const product = await ProductModel.findById(id).lean();
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  return NextResponse.json({ product });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  // Only validated when present — PATCH is a partial update, so a save
  // that isn't touching stock at all must not be forced to resend it.
  if ("stock" in body) {
    const stockResult = validateStockQuantity(body.stock);
    if (!stockResult.ok) return NextResponse.json({ error: stockResult.error }, { status: 400 });
    body.stock = stockResult.value;
  }
  if ("productType" in body) {
    const productTypeResult = validateProductType(body.productType);
    if (!productTypeResult.ok) return NextResponse.json({ error: productTypeResult.error }, { status: 400 });
    body.productType = productTypeResult.value;
  }
  // For a product WITH variants, `inStock` must always be derived from
  // actual variant stock, never left as whatever the admin's manual
  // checkbox happened to say — same rule createPendingOrder()/
  // releaseOrderStock() already enforce after their own stock mutations.
  // Without this, saving edited variant stock through this route (the only
  // place that edits variants outside those two paths) could leave
  // `inStock` drifted out of sync with reality — e.g. an admin zeroes out
  // every variant's stock but the stale checkbox still reads "in stock",
  // and the storefront never disables purchasing. An empty/absent
  // `variants` array is left alone (the manual checkbox is the only signal
  // for a variant-less product).
  if (Array.isArray(body.variants) && body.variants.length > 0) {
    body.inStock = body.variants.some((v: any) => Number(v?.stock) > 0);
  }

  await dbConnect();
  if (body.slug) {
    const clash = await ProductModel.findOne({ slug: body.slug, _id: { $ne: id } });
    if (clash) return NextResponse.json({ error: "A product with that slug already exists." }, { status: 409 });
  }

  const product = await ProductModel.findByIdAndUpdate(id, { $set: body }, { new: true });
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  logActivity({
    type: "product_update", adminUserId: String(admin._id), targetType: "Product", targetId: String(product._id),
    message: `${admin.email} updated product "${product.name}".`,
  });

  return NextResponse.json({ product });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const product = await ProductModel.findByIdAndDelete(id);
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  logActivity({
    type: "product_delete", adminUserId: String(admin._id), targetType: "Product", targetId: id,
    message: `${admin.email} deleted product "${product.name}".`,
  });

  return NextResponse.json({ ok: true });
}
