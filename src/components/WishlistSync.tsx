"use client";
import { useEffect } from "react";
import { useWishlist, type WishlistItem } from "@/lib/wishlistStore";

type ServerWishlistItem = {
  productId: string; slug?: string; name?: string; sku?: string; price: number; compareAtPrice?: number;
  image?: string; collection?: string; colors?: string[]; sizes?: string[];
  size?: string; color?: string; addedAt: string; available: boolean;
};

// Mounted once in the root layout, mirroring CartSync. Pulls the Mongo-backed
// guest wishlist down and merges anything missing into the local
// (localStorage) wishlist.
export default function WishlistSync() {
  useEffect(() => {
    let cancelled = false;
    fetch("/api/wishlist")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items: ServerWishlistItem[] } | null) => {
        if (cancelled || !data) return;
        const items: WishlistItem[] = data.items.map((i) => ({
          id: i.productId, slug: i.slug ?? "", name: i.name ?? "", sku: i.sku ?? "",
          price: i.price, compareAtPrice: i.compareAtPrice, image: i.image ?? "", collection: i.collection ?? "",
          colors: i.colors ?? [], sizes: i.sizes ?? [], size: i.size, color: i.color,
          addedAt: i.addedAt, available: i.available,
        }));
        useWishlist.getState().hydrateFromServer(items);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return null;
}
