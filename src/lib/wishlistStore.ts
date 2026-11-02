import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WishlistItem {
  id: string; slug: string; name: string; sku: string;
  price: number; compareAtPrice?: number; image: string; collection: string;
  colors: string[]; sizes: string[];
  size?: string; color?: string;
  addedAt: string;
  available: boolean;
}

interface WishlistState {
  items: WishlistItem[];
  hydrated: boolean;
  removeOnAddToCart: boolean;
  add: (item: Omit<WishlistItem, "addedAt">) => void;
  remove: (id: string) => void;
  toggle: (item: Omit<WishlistItem, "addedAt">) => void;
  has: (id: string) => boolean;
  count: () => number;
  clear: () => void;
  setRemoveOnAddToCart: (v: boolean) => void;
  hydrateFromServer: (serverItems: WishlistItem[]) => void;
}

// Best-effort sync to the Mongo-backed guest wishlist (see /api/wishlist),
// mirroring the cart store's approach: localStorage (via `persist` below)
// stays the source of truth for this browser; the server copy exists so the
// wishlist survives a cleared localStorage and a future login can merge it.
function syncAdd(item: Omit<WishlistItem, "addedAt">) {
  fetch("/api/wishlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: item.id, size: item.size, color: item.color }),
  }).catch(() => {});
}
function syncRemove(id: string) {
  fetch(`/api/wishlist?productId=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
}

export const useWishlist = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      hydrated: false,
      removeOnAddToCart: true,
      add: (item) => {
        if (get().items.some((i) => i.id === item.id)) return;
        set((s) => ({ items: [...s.items, { ...item, addedAt: new Date().toISOString() }] }));
        syncAdd(item);
      },
      remove: (id) => {
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
        syncRemove(id);
      },
      toggle: (item) => {
        if (get().items.some((i) => i.id === item.id)) get().remove(item.id);
        else get().add(item);
      },
      has: (id) => get().items.some((i) => i.id === id),
      count: () => get().items.length,
      clear: () => set({ items: [] }),
      setRemoveOnAddToCart: (v) => set({ removeOnAddToCart: v }),
      // Merges the server guest-wishlist into local state once on load —
      // local entries win so an in-flight toggle in this tab is never
      // clobbered by a stale server read.
      hydrateFromServer: (serverItems) => {
        set((s) => {
          if (s.hydrated) return s;
          const existingIds = new Set(s.items.map((i) => i.id));
          const merged = [...s.items, ...serverItems.filter((i) => !existingIds.has(i.id))];
          return { items: merged, hydrated: true };
        });
      },
    }),
    { name: "epure-wishlist", partialize: (s) => ({ items: s.items, removeOnAddToCart: s.removeOnAddToCart }) }
  )
);
