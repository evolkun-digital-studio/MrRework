// Central pricing config so cart drawer, cart page, checkout and the orders
// API all compute the same numbers from a single source of truth.
//
// Every function below now accepts an optional trailing `settings` (and,
// where relevant, `destination`) parameter — when provided, shipping is
// computed by src/lib/shipping/shippingCalculator.ts from live, admin-
// configured StoreSettings instead of these env-var constants. Omitting it
// keeps every existing caller's behavior exactly as before (these
// constants are also this module's own fallback default when settings
// haven't loaded yet on the client).

import {
  calculateShipping as calculateShippingQuote,
  getAvailableShippingMethods,
  type ShippingSettings,
} from "./shipping/shippingCalculator";

export type { ShippingSettings } from "./shipping/shippingCalculator";

export const FLAT_SHIPPING_RATE = Number(process.env.NEXT_PUBLIC_SHIPPING_FLAT_RATE ?? 12);
export const EXPRESS_SHIPPING_RATE = Number(process.env.NEXT_PUBLIC_EXPRESS_SHIPPING_RATE ?? 25);
export const TAX_RATE = Number(process.env.NEXT_PUBLIC_TAX_RATE ?? 0.0);

export type ShippingMethod = "standard" | "express" | "pickup";

export interface ShippingOption {
  id: ShippingMethod;
  label: string;
  description: string;
}

// Standard reuses the existing free-over-threshold flat rate untouched;
// express and pickup are the two extra tiers the checkout redesign adds.
export const SHIPPING_OPTIONS: ShippingOption[] = [
  { id: "standard", label: "Standard Delivery", description: "3–5 working days" },
  { id: "express", label: "Express Delivery", description: "1–2 working days" },
  { id: "pickup", label: "Collect in Atelier", description: "Ready within 24 hours · Antwerp" },
];

export interface PricedLine {
  price: number;
  quantity: number;
}

export interface CartTotals {
  itemCount: number;
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  total: number;
}

export interface ShippingDestination {
  country?: string;
  state?: string;
  city?: string;
}

// The original single-rate calculation — still what "standard" resolves to
// when no live settings are supplied.
export function calcShipping(subtotal: number, settings?: ShippingSettings): number {
  if (settings) return calculateShippingQuote({ subtotal }, settings, "standard").cost;
  if (subtotal <= 0) return 0;
  return FLAT_SHIPPING_RATE;
}

export function calcShippingForMethod(
  subtotal: number,
  method: ShippingMethod = "standard",
  settings?: ShippingSettings,
  destination?: ShippingDestination
): number {
  if (settings) return calculateShippingQuote({ subtotal, ...destination }, settings, method).cost;
  if (subtotal <= 0) return 0;
  if (method === "pickup") return 0;
  if (method === "express") return EXPRESS_SHIPPING_RATE;
  return calcShipping(subtotal);
}

// Priced options for a given subtotal — the checkout UI reads these instead
// of hardcoding any rate itself. With `settings`, only methods actually
// available (local pickup enabled, international allowed for this
// destination) are returned.
export function getShippingOptions(
  subtotal: number,
  settings?: ShippingSettings,
  destination?: ShippingDestination
): (ShippingOption & { price: number })[] {
  if (settings) {
    return getAvailableShippingMethods({ subtotal, ...destination }, settings).map((q) => ({
      id: q.id, label: q.label, description: q.description, price: q.cost,
    }));
  }
  return SHIPPING_OPTIONS.map((o) => ({ ...o, price: calcShippingForMethod(subtotal, o.id) }));
}

export function calcTax(subtotal: number): number {
  return Math.round(subtotal * TAX_RATE * 100) / 100;
}

export function calcTotals(
  items: PricedLine[],
  opts: {
    discount?: number;
    shippingMethod?: ShippingMethod;
    shippingSettings?: ShippingSettings;
    destination?: ShippingDestination;
    // Set by a free-shipping discount (src/lib/promotions/) — zeroes
    // shipping and recomputes `total` right here, the one place that
    // arithmetic already lives, rather than a second implementation in
    // whatever calls this.
    forceFreeShipping?: boolean;
  } = {}
): CartTotals {
  const { discount = 0, shippingMethod = "standard", shippingSettings, destination, forceFreeShipping = false } = opts;
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);
  const subtotal = items.reduce((n, i) => n + i.price * i.quantity, 0);
  const shipping = forceFreeShipping ? 0 : calcShippingForMethod(subtotal, shippingMethod, shippingSettings, destination);
  const tax = calcTax(subtotal);
  const total = Math.max(0, subtotal + shipping + tax - discount);
  return { itemCount, subtotal, shipping, tax, discount, total };
}
