import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ProductModel } from "@/models/Product";
import { getOrCreateCartSessionId } from "@/lib/cartSession";
import { getOrCreateWishlist, serializeWishlist } from "@/lib/wishlist";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

// GET — fetch (creating if needed) the guest wishlist for this browser.
export async function GET() {
  const sessionId = await getOrCreateCartSessionId();
  const wishlist = await getOrCreateWishlist(sessionId);
  return NextResponse.json(await serializeWishlist(wishlist));
}

// POST — add a product, ignoring the request if it's already saved.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { productId, size, color } = body ?? {};
  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }
  if (!isValidObjectId(productId)) return invalidIdResponse();

  await dbConnect();
  const product = await ProductModel.findById(productId).lean<any>();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const sessionId = await getOrCreateCartSessionId();
  const wishlist = await getOrCreateWishlist(sessionId);

  const exists = wishlist.items.some((i: any) => String(i.product) === productId);
  if (!exists) {
    wishlist.items.push({ product: productId, size, color, addedAt: new Date() });
    await wishlist.save();
  }

  const payload = await serializeWishlist(wishlist);
  return NextResponse.json(payload, { status: exists ? 200 : 201 });
}

// DELETE — remove one product (?productId=) or clear the whole wishlist (?all=true).
export async function DELETE(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const sessionId = await getOrCreateCartSessionId();
  const wishlist = await getOrCreateWishlist(sessionId);

  if (sp.get("all") === "true") {
    wishlist.items = [];
  } else {
    const productId = sp.get("productId");
    if (!productId) return NextResponse.json({ error: "productId is required" }, { status: 400 });
    wishlist.items = wishlist.items.filter((i: any) => String(i.product) !== productId);
  }
  await wishlist.save();

  const payload = await serializeWishlist(wishlist);
  return NextResponse.json(payload);
}
