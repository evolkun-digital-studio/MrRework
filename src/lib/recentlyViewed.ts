import type { Product } from "./types";

// Stores full Product snapshots (not a trimmed subset) so every consumer —
// the search overlay's compact cards and the account dashboard's full
// ProductCard row — can render straight from localStorage with zero extra
// fetches. Guest-only for now (localStorage); syncing this to MongoDB for
// signed-in users is a natural follow-up once real auth exists.
export type RecentlyViewedItem = Product;

const KEY = "epure-recently-viewed";
const MAX = 10;

export function readRecentlyViewed(): RecentlyViewedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function recordRecentlyViewed(product: Product) {
  if (typeof window === "undefined") return;
  try {
    const next = [product, ...readRecentlyViewed().filter((i) => i._id !== product._id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}
