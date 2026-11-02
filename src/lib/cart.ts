import "server-only";
import { dbConnect } from "./mongodb";
import { CartModel } from "@/models/Cart";
import { ProductModel } from "@/models/Product";
import { calcTotals } from "./pricing";
import { getShippingSettingsDoc, getShippingSettings } from "./shipping/shippingSettings";
import { resolveStock } from "./utils";

type RawItem = {
  product: unknown; slug?: string; name?: string; sku?: string; image?: string;
  price: number; size?: string; color?: string; quantity: number;
};

const itemKey = (i: { product: unknown; size?: string; color?: string }) =>
  `${String(i.product)}|${i.size ?? ""}|${i.color ?? ""}`;

export async function getOrCreateCart(sessionId: string) {
  await dbConnect();
  let cart = await CartModel.findOne({ sessionId });
  if (!cart) cart = await CartModel.create({ sessionId, items: [] });
  return cart;
}

// Called once, at the moment a customer session is established (login,
// verify-email, reset-password — see src/lib/customerAuth.ts's callers).
// Folds this browser's guest cart (keyed by sessionId) into the account's
// own cart (keyed by `user`, from a previous device/session), summing
// quantities for matching lines exactly like POST /api/cart already does
// for a repeat add-to-cart — no stock cap here either, matching that route.
// Leaves exactly one Cart document behind, stamped with both keys, so
// getOrCreateCart(sessionId) keeps resolving correctly on this same browser.
export async function mergeGuestCartIntoUser(sessionId: string, userId: string): Promise<void> {
  await dbConnect();
  const guestCart = await CartModel.findOne({ sessionId });
  const userCart = await CartModel.findOne({ user: userId });

  if (!guestCart && !userCart) return;

  if (guestCart && !userCart) {
    guestCart.user = userId;
    await guestCart.save();
    return;
  }

  if (!guestCart && userCart) {
    if (userCart.sessionId !== sessionId) {
      userCart.sessionId = sessionId;
      await userCart.save();
    }
    return;
  }

  // Both exist. If merge already ran for this browser (idempotent re-entry,
  // e.g. a duplicate session-creation call), they may already be the same
  // document — nothing left to merge in that case.
  if (String(guestCart!._id) === String(userCart!._id)) return;

  for (const item of guestCart!.items as any[]) {
    const k = itemKey(item);
    const existing = userCart!.items.find((i: any) => itemKey(i) === k);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      // Push a plain object, not the guestCart's own subdocument instance —
      // a Mongoose subdocument keeps an internal reference to its original
      // parent array, which causes issues if reused directly on another doc.
      userCart!.items.push({
        product: item.product, slug: item.slug, name: item.name, sku: item.sku,
        image: item.image, price: item.price, size: item.size, color: item.color,
        quantity: item.quantity,
      });
    }
  }
  userCart!.sessionId = sessionId;
  await userCart!.save();
  await CartModel.deleteOne({ _id: guestCart!._id });
}

// Thin re-export of the shared resolveStock() (src/lib/utils.ts, not
// server-only, so ProductDetail.tsx can also call it directly with no
// fetch) under this module's existing name — POST/PATCH /api/cart and
// serializeCart() below both already import `variantStock` from here, so
// they keep working unchanged while the actual logic lives in exactly one
// place shared with the client. serializeWishlist() (src/lib/wishlist.ts)
// imports resolveStock directly from utils.ts instead, same underlying
// function either way.
export const variantStock = resolveStock;

// Cross-checks stored cart lines against live product data (price/stock may have
// changed since the item was added) and returns a client-ready payload with
// derived totals — nothing here is persisted, it's computed on every read.
export async function serializeCart(cart: { items: RawItem[] }) {
  const productIds = [...new Set(cart.items.map((i) => String(i.product)))];
  const products = await ProductModel.find({ _id: { $in: productIds } }).lean<any[]>();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const items = cart.items.map((i) => {
    const product = byId.get(String(i.product));
    const stock = product ? variantStock(product, i.size, i.color) : 0;
    const available = !!product && (product.inStock ?? true) && stock > 0;
    return {
      productId: String(i.product),
      slug: product?.slug ?? i.slug,
      name: product?.name ?? i.name,
      sku: i.sku,
      image: product?.images?.[0] ?? i.image,
      price: product?.price ?? i.price,
      size: i.size,
      color: i.color,
      quantity: i.quantity,
      lineTotal: (product?.price ?? i.price) * i.quantity,
      available,
      maxQuantity: Number.isFinite(stock) ? stock : undefined,
    };
  });

  const shippingSettingsDoc = await getShippingSettingsDoc();
  const shippingSettings = getShippingSettings(shippingSettingsDoc);
  const totals = calcTotals(items.map((i) => ({ price: i.price, quantity: i.quantity })), { shippingSettings });
  return { items, totals };
}

export { itemKey };
