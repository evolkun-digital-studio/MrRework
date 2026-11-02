import { create } from "zustand";
import { persist } from "zustand/middleware";
import { calcTotals, type CartTotals, type ShippingSettings } from "./pricing";

export interface CartItem {
  id: string; slug: string; name: string; sku: string;
  price: number; image: string; size: string; color: string; quantity: number;
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  hydrated: boolean;
  // Live, admin-configured shipping settings (see /api/shipping/config) —
  // fetched once (Header.tsx) and cached here so calcTotals() in this store
  // matches checkout/order-creation instead of the env-var fallback. Origin
  // fields are unknown at the cart-preview stage (no address collected
  // yet), left empty — harmless, since that just means "never treat as an
  // international destination" for this rough, pre-checkout estimate.
  shippingSettings: ShippingSettings | null;
  setShippingSettings: (s: ShippingSettings) => void;
  add: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  remove: (id: string, size: string, color: string) => void;
  setQty: (id: string, size: string, color: string, qty: number) => void;
  clear: () => void;
  open: () => void;
  close: () => void;
  count: () => number;
  subtotal: () => number;
  totals: () => CartTotals;
  hydrateFromServer: (serverItems: CartItem[]) => void;
}

const key = (i: { id: string; size: string; color: string }) => `${i.id}|${i.size}|${i.color}`;

// Best-effort sync to the Mongo-backed guest cart (see /api/cart). This never
// blocks or throws into the UI — localStorage (via `persist` below) stays the
// source of truth for this browser; the server copy exists so the cart can
// survive a cleared localStorage and so a future login can merge it.
function syncAdd(item: Omit<CartItem, "quantity">, qty: number) {
  fetch("/api/cart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: item.id, size: item.size, color: item.color, quantity: qty }),
  }).catch(() => {});
}
function syncSetQty(id: string, size: string, color: string, quantity: number) {
  fetch("/api/cart", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: id, size, color, quantity }),
  }).catch(() => {});
}
function syncRemove(id: string, size: string, color: string) {
  const sp = new URLSearchParams({ productId: id, size, color });
  fetch(`/api/cart?${sp.toString()}`, { method: "DELETE" }).catch(() => {});
}
function syncClear() {
  fetch("/api/cart?all=true", { method: "DELETE" }).catch(() => {});
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      hydrated: false,
      shippingSettings: null,
      setShippingSettings: (s) => set({ shippingSettings: s }),
      add: (item, qty = 1) => {
        set((s) => {
          const k = key(item);
          const existing = s.items.find((i) => key(i) === k);
          if (existing) {
            return { items: s.items.map((i) => (key(i) === k ? { ...i, quantity: i.quantity + qty } : i)), isOpen: true };
          }
          return { items: [...s.items, { ...item, quantity: qty }], isOpen: true };
        });
        syncAdd(item, qty);
      },
      remove: (id, size, color) => {
        set((s) => ({ items: s.items.filter((i) => key(i) !== key({ id, size, color })) }));
        syncRemove(id, size, color);
      },
      setQty: (id, size, color, qty) => {
        const k = key({ id, size, color });
        if (qty <= 0) {
          set((s) => ({ items: s.items.filter((i) => key(i) !== k) }));
        } else {
          set((s) => ({ items: s.items.map((i) => (key(i) === k ? { ...i, quantity: qty } : i)) }));
        }
        syncSetQty(id, size, color, Math.max(0, qty));
      },
      clear: () => {
        set({ items: [] });
        syncClear();
      },
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      count: () => get().items.reduce((n, i) => n + i.quantity, 0),
      subtotal: () => get().items.reduce((n, i) => n + i.price * i.quantity, 0),
      totals: () => calcTotals(get().items, { shippingSettings: get().shippingSettings ?? undefined }),
      // Merges the server guest-cart (from a different session/device, or one
      // that survived a cleared localStorage) into local state once on load.
      // Local quantities win for lines that already exist so an in-flight edit
      // in this tab is never clobbered by a stale server read.
      hydrateFromServer: (serverItems) => {
        set((s) => {
          if (s.hydrated) return s;
          const existingKeys = new Set(s.items.map(key));
          const merged = [...s.items];
          for (const si of serverItems) {
            if (!existingKeys.has(key(si))) merged.push(si);
          }
          return { items: merged, hydrated: true };
        });
      },
    }),
    { name: "epure-cart", partialize: (s) => ({ items: s.items }) }
  )
);
