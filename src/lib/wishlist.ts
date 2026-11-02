import "server-only";
import { dbConnect } from "./mongodb";
import { WishlistModel } from "@/models/Wishlist";
import { ProductModel } from "@/models/Product";
import { resolveStock } from "./utils";

type RawItem = { product: unknown; size?: string; color?: string; addedAt: Date };

export async function getOrCreateWishlist(sessionId: string) {
  await dbConnect();
  let wishlist = await WishlistModel.findOne({ sessionId });
  if (!wishlist) wishlist = await WishlistModel.create({ sessionId, items: [] });
  return wishlist;
}

// Mirrors mergeGuestCartIntoUser() — called once, at the moment a customer
// session is established. Dedupes by product only (matching this model's
// own uniqueness rule — see WishlistItemSchema's comment: size/color are
// display hints, never part of the key), so a product wishlisted as a guest
// and already wishlisted on the account isn't duplicated.
export async function mergeGuestWishlistIntoUser(sessionId: string, userId: string): Promise<void> {
  await dbConnect();
  const guestWishlist = await WishlistModel.findOne({ sessionId });
  const userWishlist = await WishlistModel.findOne({ user: userId });

  if (!guestWishlist && !userWishlist) return;

  if (guestWishlist && !userWishlist) {
    guestWishlist.user = userId;
    await guestWishlist.save();
    return;
  }

  if (!guestWishlist && userWishlist) {
    if (userWishlist.sessionId !== sessionId) {
      userWishlist.sessionId = sessionId;
      await userWishlist.save();
    }
    return;
  }

  if (String(guestWishlist!._id) === String(userWishlist!._id)) return;

  const existingProductIds = new Set(userWishlist!.items.map((i: any) => String(i.product)));
  for (const item of guestWishlist!.items as any[]) {
    if (existingProductIds.has(String(item.product))) continue;
    userWishlist!.items.push({ product: item.product, size: item.size, color: item.color, addedAt: item.addedAt });
    existingProductIds.add(String(item.product));
  }
  userWishlist!.sessionId = sessionId;
  await userWishlist!.save();
  await WishlistModel.deleteOne({ _id: guestWishlist!._id });
}

// The Wishlist collection only ever stores a product reference — this reads
// live product data on every request (name/price/stock can change after the
// item was saved) instead of persisting a duplicate snapshot anywhere.
export async function serializeWishlist(wishlist: { items: RawItem[] }) {
  const productIds = [...new Set(wishlist.items.map((i) => String(i.product)))];
  const products = await ProductModel.find({ _id: { $in: productIds } }).lean<any[]>();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const items = wishlist.items.map((i) => {
    const product = byId.get(String(i.product));
    return {
      productId: String(i.product),
      slug: product?.slug,
      name: product?.name,
      sku: product?.sku,
      price: product?.price,
      compareAtPrice: product?.compareAtPrice,
      image: product?.images?.[0],
      collection: product?.collection,
      colors: product?.colors ?? [],
      sizes: product?.sizes ?? [],
      size: i.size,
      color: i.color,
      addedAt: i.addedAt,
      // Previously just `product.inStock` — product-level only, so an item
      // wishlisted in a specific sold-out size still read as "available"
      // whenever any other size/color of the same product had stock.
      // ProductCard (no size picker) wishlists with no size/color pinned at
      // all — for that case there's no specific variant to check, so this
      // still falls back to the overall flag, same as before; only a
      // wishlist entry that DOES pin a size/color (from the PDP) gets the
      // more precise per-variant check.
      available: !product ? false
        : (!i.size && !i.color) ? (product.inStock ?? true)
        : resolveStock(product, i.size, i.color) > 0,
    };
  });

  return { items, count: items.length };
}
