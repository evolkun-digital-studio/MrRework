import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface StockLike {
  inStock?: boolean;
  variants?: { size?: string; color?: string; stock?: number }[];
}

// The single definition of "how many of this exact size/color are still
// available" — shared by client components (ProductDetail.tsx, which
// already has the full product in hand and needs this synchronously, no
// fetch) and server-only code (src/lib/cart.ts's `variantStock`, which
// wraps this instead of duplicating the same logic) so both sides of the
// add-to-cart flow agree on one rule. Variant-less products fall back to
// the binary `inStock` flag treated as unlimited (Infinity) or none (0),
// since that field has no real quantity for them.
export function resolveStock(product: StockLike, size?: string, color?: string): number {
  if (!product.variants?.length) return product.inStock ? Infinity : 0;
  const v = product.variants.find((v) => v.size === size && v.color === color);
  return v ? (v.stock ?? 0) : 0;
}

// Same fallback layout.tsx's root metadataBase already uses — shared here
// so canonical/OpenGraph URLs built by individual pages (product, shop,
// blog) always agree with the origin the root layout resolves relative
// metadata URLs against, instead of each page re-deriving it separately.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Serializes a value for embedding inside a `<script type="application/ld+json">`
 * tag via `dangerouslySetInnerHTML`. Plain `JSON.stringify` never escapes `<`,
 * so a string containing the literal sequence `</script>` (e.g. an imported
 * product description, or any admin-edited content) would close the script
 * tag early and let the remaining text be parsed as new HTML — a stored XSS.
 * Escaping `<` to its unicode escape neutralizes the tag boundary without
 * changing the value once a consumer (crawler, JSON.parse) reads it back.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function formatPrice(amount: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Every stored/charged amount is GBP — this only changes how checkout
 * *displays* it once a destination country resolves to a different
 * currency (see src/app/checkout/page.tsx), converting at the supplied
 * live rate. `rate` is GBP -> `currency`, e.g. 1.17 for EUR.
 */
export function formatConvertedPrice(amountGBP: number, currency: string, rate: number) {
  if (currency === "GBP") return formatPrice(amountGBP);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountGBP * rate);
}

/**
 * A variable product (WooCommerce import) has `price` set to its cheapest
 * variant and `priceMax` set to its most expensive one whenever those
 * differ — see resolveVariablePricing() in wooProductMapping.ts. Every
 * simple product has no priceMax, so this is a no-op "£X" for them.
 */
export function formatProductPrice(product: { price: number; priceMax?: number }, currency = "GBP") {
  if (product.priceMax !== undefined && product.priceMax > product.price) {
    return `From ${formatPrice(product.price, currency)}`;
  }
  return formatPrice(product.price, currency);
}

/** Same "From £X" range-price logic as formatProductPrice, but rate-converted like formatConvertedPrice. */
export function formatConvertedProductPrice(product: { price: number; priceMax?: number }, currency: string, rate: number) {
  if (product.priceMax !== undefined && product.priceMax > product.price) {
    return `From ${formatConvertedPrice(product.price, currency, rate)}`;
  }
  return formatConvertedPrice(product.price, currency, rate);
}

/**
 * A variant's canonical identity — the single source of truth used to
 * match/key a specific variant everywhere one is needed: the WooCommerce
 * importer (attaching a variation to the right slot), the admin Inventory
 * page (React keys, edit state), and the inventory PATCH route (which
 * variant's stock to update). Not every variant is distinguished by
 * size+color — a WooCommerce "bundle" product's variants are commonly
 * distinguished by an attribute like Quantity instead, in which case every
 * variant has size="" color="" and a size+color-only key collapses all of
 * them onto the same identity. Falls back to size+color only when a
 * variant genuinely has no attributes at all (hand-created products, e.g.
 * the admin Product Form, which only ever sets size/color/stock/sku).
 */
export function variantKey(attributes: Record<string, string> | undefined, size: string, color: string): string {
  const attrs = attributes ?? {};
  const entries = Object.entries(attrs).filter(([, v]) => v);
  if (!entries.length) return `size=${size.toLowerCase()}|color=${color.toLowerCase()}`;
  return entries
    .map(([k, v]) => `${k.toLowerCase()}=${v.toLowerCase()}`)
    .sort()
    .join("|");
}
