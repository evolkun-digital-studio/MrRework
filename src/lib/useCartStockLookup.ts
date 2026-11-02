"use client";
import { useEffect, useState } from "react";

interface StockInfo {
  available: boolean;
  maxQuantity?: number;
}

type ServerCartItem = {
  productId: string; size?: string; color?: string;
  available: boolean; maxQuantity?: number;
};

export function cartStockKey(id: string, size: string, color: string): string {
  return `${id}|${size}|${color}`;
}

// Best-effort, display-only cross-check for lines already sitting in the
// (client Zustand) cart — the store itself carries no stock data, and
// GET /api/cart already computes per-line `available`/`maxQuantity` via
// serializeCart() but nothing previously consumed it. Shared by
// CartDrawer.tsx and cart/page.tsx so a product that sold out AFTER being
// added shows a "Sold out" state instead of silently letting quantity be
// increased or checkout proceed with a line that will just be rejected at
// order creation anyway. Fails open (empty map, so every line reads as
// available) on any fetch error or before the fetch resolves — order
// creation remains the real, authoritative check regardless of what this
// returns; this is purely an earlier warning.
export function useCartStockLookup(active: boolean) {
  const [lookup, setLookup] = useState<Map<string, StockInfo>>(new Map());

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch("/api/cart")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items?: ServerCartItem[] } | null) => {
        if (cancelled || !data?.items) return;
        const map = new Map<string, StockInfo>();
        for (const i of data.items) {
          map.set(cartStockKey(i.productId, i.size ?? "", i.color ?? ""), { available: i.available, maxQuantity: i.maxQuantity });
        }
        setLookup(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [active]);

  return lookup;
}
