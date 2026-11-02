"use client";
import { useEffect } from "react";
import { useCart, type CartItem } from "@/lib/store";

type ServerCartItem = {
  productId: string; slug?: string; name?: string; sku?: string; image?: string;
  price: number; size?: string; color?: string; quantity: number;
};

// Mounted once in the root layout. Pulls the Mongo-backed guest cart down and
// merges anything missing into the local (localStorage) cart — e.g. items
// added from another device/browser tab for the same guest session cookie.
export default function CartSync() {
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cart")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items: ServerCartItem[] } | null) => {
        if (cancelled || !data) return;
        const items: CartItem[] = data.items.map((i) => ({
          id: i.productId, slug: i.slug ?? "", name: i.name ?? "", sku: i.sku ?? "",
          price: i.price, image: i.image ?? "", size: i.size ?? "", color: i.color ?? "", quantity: i.quantity,
        }));
        useCart.getState().hydrateFromServer(items);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return null;
}
