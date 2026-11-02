import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ProductModel } from "@/models/Product";
import { getOrCreateCartSessionId } from "@/lib/cartSession";
import { getOrCreateCart, serializeCart, itemKey, variantStock } from "@/lib/cart";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

// GET — fetch (creating if needed) the guest cart for this browser.
export async function GET() {
  const sessionId = await getOrCreateCartSessionId();
  const cart = await getOrCreateCart(sessionId);
  const payload = await serializeCart(cart);
  return NextResponse.json(payload);
}

// POST — add an item, merging quantity into an existing matching line.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { productId, size, color, quantity = 1 } = body ?? {};
  if (!productId || typeof quantity !== "number" || quantity <= 0) {
    return NextResponse.json({ error: "productId and a positive quantity are required" }, { status: 400 });
  }
  if (!isValidObjectId(productId)) return invalidIdResponse();

  await dbConnect();
  const product = await ProductModel.findById(productId).lean<any>();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  // Server-side stock enforcement — the client (ProductCard/ProductDetail/
  // wishlist) is expected to already gate this in the UI, but this route
  // must never trust that; a direct API request bypassing the UI entirely
  // is exactly what this checks for. Same resolution logic serializeCart()
  // and serializeWishlist() use, so all three agree on one definition of
  // "in stock" for this exact size/color.
  const stock = variantStock(product, size, color);
  if (stock <= 0) {
    return NextResponse.json({ error: "This item is out of stock." }, { status: 409 });
  }

  const sessionId = await getOrCreateCartSessionId();
  const cart = await getOrCreateCart(sessionId);

  const k = itemKey({ product: productId, size, color });
  const existing = cart.items.find((i: any) => itemKey(i) === k);
  if (existing) {
    // Capped at available stock, not just added unconditionally — repeated
    // POSTs (accidental double-click, or a deliberate bypass attempt) can no
    // longer push a line's quantity past what's actually in stock.
    existing.quantity = Math.min(existing.quantity + quantity, stock);
  } else {
    cart.items.push({
      product: productId, slug: product.slug, name: product.name, sku: product.sku,
      image: product.images?.[0], price: product.price, size, color, quantity: Math.min(quantity, stock),
    });
  }
  await cart.save();

  const payload = await serializeCart(cart);
  return NextResponse.json(payload, { status: 201 });
}

// PATCH — set an item's quantity outright (quantity <= 0 removes it).
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { productId, size, color, quantity } = body ?? {};
  if (!productId || typeof quantity !== "number") {
    return NextResponse.json({ error: "productId and quantity are required" }, { status: 400 });
  }
  if (!isValidObjectId(productId)) return invalidIdResponse();

  const sessionId = await getOrCreateCartSessionId();
  const cart = await getOrCreateCart(sessionId);

  const k = itemKey({ product: productId, size, color });
  if (quantity <= 0) {
    cart.items = cart.items.filter((i: any) => itemKey(i) !== k);
  } else {
    const existing = cart.items.find((i: any) => itemKey(i) === k);
    if (!existing) return NextResponse.json({ error: "Item not in cart" }, { status: 404 });

    // Same server-side enforcement as POST — this route previously never
    // looked up the Product at all, so a client could PATCH any quantity
    // it wanted regardless of real stock.
    await dbConnect();
    const product = await ProductModel.findById(productId).lean<any>();
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const stock = variantStock(product, size, color);
    if (stock <= 0) return NextResponse.json({ error: "This item is out of stock." }, { status: 409 });
    existing.quantity = Math.min(quantity, stock);
  }
  await cart.save();

  const payload = await serializeCart(cart);
  return NextResponse.json(payload);
}

// DELETE — remove one line (?productId=&size=&color=) or the whole cart (?all=true).
export async function DELETE(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const sessionId = await getOrCreateCartSessionId();
  const cart = await getOrCreateCart(sessionId);

  if (sp.get("all") === "true") {
    cart.items = [];
  } else {
    const productId = sp.get("productId");
    if (!productId) return NextResponse.json({ error: "productId is required" }, { status: 400 });
    const k = itemKey({ product: productId, size: sp.get("size") ?? undefined, color: sp.get("color") ?? undefined });
    cart.items = cart.items.filter((i: any) => itemKey(i) !== k);
  }
  await cart.save();

  const payload = await serializeCart(cart);
  return NextResponse.json(payload);
}
