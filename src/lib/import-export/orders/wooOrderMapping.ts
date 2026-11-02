import { applyMapping } from "../mapping";
import type { TargetField } from "../types";
import type { RawOrderItem } from "./wooOrderSqlSource";

// Pure order field mapping/normalization/linking-decision logic — no
// database access, no file I/O. Mirrors customers/wooCustomerMapping.ts's
// split exactly: the SQL parsing and table merge (wooOrderSqlSource.ts, this
// same folder) produces a flat "virtual CSV row" per order; everything from
// here on is format-agnostic. The *decision* logic for linking an order to a
// customer/product (resolveOrderCustomerLink / resolveOrderItemLink below)
// lives here too, exactly like isProtectedAccount does for customers — pure
// functions over already-fetched lookup maps, never touching the database
// themselves, so the live importer, the preview, the analyzer, and the
// repair script can never disagree about what a given order should become.
// No `server-only` guard, same reasoning as wooCustomerMapping.ts: reused
// as-is by the standalone repair script (scripts/migrateWooOrders.ts).

export const TARGET_FIELDS: TargetField[] = [
  { key: "orderNumber", label: "Order Number", required: true, aliases: ["order_number", "order number", "number"] },
  { key: "status", label: "Order Status", aliases: ["status", "order_status"], description: "WooCommerce's raw wc-* status — see § Status Mapping (ADMIN_CMS.md)." },
  { key: "createdDate", label: "Created Date", aliases: ["created_date", "post_date", "date created"] },
  { key: "modifiedDate", label: "Modified Date", aliases: ["modified_date", "post_modified", "date modified"] },
  { key: "customerNote", label: "Customer Note", aliases: ["customer_note", "order_comments"] },
  { key: "customerId", label: "WordPress Customer ID", aliases: ["customer_id"], description: "Fallback customer-linking key, used only when no account matches by email." },
  { key: "currency", label: "Currency", aliases: ["currency", "order_currency"] },
  { key: "orderTotal", label: "Grand Total", required: true, aliases: ["order_total", "total"] },
  { key: "orderTax", label: "Tax", aliases: ["order_tax", "tax_total"] },
  { key: "orderShipping", label: "Shipping", aliases: ["order_shipping", "shipping_total"] },
  { key: "orderShippingTax", label: "Shipping Tax", aliases: ["order_shipping_tax"] },
  { key: "cartDiscount", label: "Discount", aliases: ["cart_discount", "discount_total"] },
  { key: "cartDiscountTax", label: "Discount Tax", aliases: ["cart_discount_tax"] },
  { key: "paymentMethodRaw", label: "Payment Method (gateway id)", aliases: ["payment_method"], description: "Store's raw gateway id (e.g. \"stripe\", \"bacs\", \"cod\") — see § Payment Mapping (ADMIN_CMS.md)." },
  { key: "paymentMethodTitle", label: "Payment Method Title", aliases: ["payment_method_title"] },
  { key: "transactionId", label: "Transaction ID", aliases: ["transaction_id"] },
  { key: "customerIp", label: "Customer IP", aliases: ["customer_ip_address"] },

  { key: "billingFirstName", label: "Billing First Name", aliases: ["billing_first_name"] },
  { key: "billingLastName", label: "Billing Last Name", aliases: ["billing_last_name"] },
  { key: "billingCompany", label: "Billing Company", aliases: ["billing_company"] },
  { key: "billingAddress1", label: "Billing Address 1", aliases: ["billing_address_1"] },
  { key: "billingAddress2", label: "Billing Address 2", aliases: ["billing_address_2"] },
  { key: "billingCity", label: "Billing City", aliases: ["billing_city"] },
  { key: "billingState", label: "Billing State", aliases: ["billing_state"] },
  { key: "billingPostcode", label: "Billing Postcode", aliases: ["billing_postcode"] },
  { key: "billingCountry", label: "Billing Country", aliases: ["billing_country"] },
  { key: "billingPhone", label: "Billing Phone", aliases: ["billing_phone"] },
  { key: "billingEmail", label: "Billing Email", required: true, aliases: ["billing_email"], description: "The order's contact email — the primary customer-linking key." },

  { key: "shippingFirstName", label: "Shipping First Name", aliases: ["shipping_first_name"] },
  { key: "shippingLastName", label: "Shipping Last Name", aliases: ["shipping_last_name"] },
  { key: "shippingCompany", label: "Shipping Company", aliases: ["shipping_company"] },
  { key: "shippingAddress1", label: "Shipping Address 1", aliases: ["shipping_address_1"] },
  { key: "shippingAddress2", label: "Shipping Address 2", aliases: ["shipping_address_2"] },
  { key: "shippingCity", label: "Shipping City", aliases: ["shipping_city"] },
  { key: "shippingState", label: "Shipping State", aliases: ["shipping_state"] },
  { key: "shippingPostcode", label: "Shipping Postcode", aliases: ["shipping_postcode"] },
  { key: "shippingCountry", label: "Shipping Country", aliases: ["shipping_country"] },
  { key: "shippingPhone", label: "Shipping Phone", aliases: ["shipping_phone"] },
];

export interface MappedOrderItem {
  name: string;
  sku: string;
  productId: string;
  variationId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  total: number;
  tax: number;
  attributes: Record<string, string>;
}

export interface MappedAdminNote { note: string; createdAt: string; isCustomerNote: boolean }

export interface WooMappedOrder {
  sourceId: string;
  orderNumber: string;
  wooStatus: string;
  createdDate: string;
  modifiedDate: string;
  customerNote: string;
  customerId: string;
  email: string;
  currency: string;
  orderTotal: string; orderTax: string; orderShipping: string; orderShippingTax: string;
  cartDiscount: string; cartDiscountTax: string;
  paymentMethodRaw: string; paymentMethodTitle: string; transactionId: string; customerIp: string;
  billingFirstName: string; billingLastName: string; billingCompany: string; billingAddress1: string; billingAddress2: string;
  billingCity: string; billingState: string; billingPostcode: string; billingCountry: string; billingPhone: string;
  shippingFirstName: string; shippingLastName: string; shippingCompany: string; shippingAddress1: string; shippingAddress2: string;
  shippingCity: string; shippingState: string; shippingPostcode: string; shippingCountry: string; shippingPhone: string;
  items: MappedOrderItem[];
  couponCodes: string[];
  adminNotes: MappedAdminNote[];
}

function toNumber(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseJsonArray<T>(json: string | undefined): T[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseLineItems(json: string | undefined): MappedOrderItem[] {
  return parseJsonArray<RawOrderItem>(json).map((item) => {
    const quantity = toNumber(item.qty) || 1;
    const total = toNumber(item.total);
    const subtotal = item.subtotal ? toNumber(item.subtotal) : total;
    return {
      name: item.name ?? "",
      sku: item.sku ?? "",
      productId: item.productId ?? "",
      variationId: item.variationId ?? "",
      quantity,
      unitPrice: quantity ? total / quantity : total,
      subtotal,
      total,
      tax: toNumber(item.tax),
      attributes: item.attributes ?? {},
    };
  });
}

// Items/coupons/notes are structural (already fully resolved by the SQL
// source), never a column an admin remaps by hand — read straight off `raw`
// rather than through applyMapping/TARGET_FIELDS, same reasoning as
// wooCustomerSqlSource.ts's `sourceId` handling.
export function mapRow(raw: Record<string, string>, mapping: Record<string, string>): WooMappedOrder {
  const m = applyMapping(raw, mapping);
  return {
    sourceId: (raw["ID"] ?? "").trim(),
    orderNumber: (m.orderNumber ?? "").trim(),
    wooStatus: (m.status ?? "").trim(),
    createdDate: (m.createdDate ?? "").trim(),
    modifiedDate: (m.modifiedDate ?? "").trim(),
    customerNote: (m.customerNote ?? "").trim(),
    customerId: (m.customerId ?? "").trim(),
    email: (m.billingEmail ?? "").trim().toLowerCase(),
    currency: (m.currency ?? "").trim().toUpperCase(),
    orderTotal: m.orderTotal ?? "", orderTax: m.orderTax ?? "", orderShipping: m.orderShipping ?? "", orderShippingTax: m.orderShippingTax ?? "",
    cartDiscount: m.cartDiscount ?? "", cartDiscountTax: m.cartDiscountTax ?? "",
    paymentMethodRaw: (m.paymentMethodRaw ?? "").trim(), paymentMethodTitle: (m.paymentMethodTitle ?? "").trim(),
    transactionId: (m.transactionId ?? "").trim(), customerIp: (m.customerIp ?? "").trim(),
    billingFirstName: (m.billingFirstName ?? "").trim(), billingLastName: (m.billingLastName ?? "").trim(),
    billingCompany: (m.billingCompany ?? "").trim(), billingAddress1: (m.billingAddress1 ?? "").trim(), billingAddress2: (m.billingAddress2 ?? "").trim(),
    billingCity: (m.billingCity ?? "").trim(), billingState: (m.billingState ?? "").trim(), billingPostcode: (m.billingPostcode ?? "").trim(),
    billingCountry: (m.billingCountry ?? "").trim(), billingPhone: (m.billingPhone ?? "").trim(),
    shippingFirstName: (m.shippingFirstName ?? "").trim(), shippingLastName: (m.shippingLastName ?? "").trim(),
    shippingCompany: (m.shippingCompany ?? "").trim(), shippingAddress1: (m.shippingAddress1 ?? "").trim(), shippingAddress2: (m.shippingAddress2 ?? "").trim(),
    shippingCity: (m.shippingCity ?? "").trim(), shippingState: (m.shippingState ?? "").trim(), shippingPostcode: (m.shippingPostcode ?? "").trim(),
    shippingCountry: (m.shippingCountry ?? "").trim(), shippingPhone: (m.shippingPhone ?? "").trim(),
    items: parseLineItems(raw["line_items_json"]),
    couponCodes: parseJsonArray<string>(raw["coupon_codes_json"]),
    adminNotes: parseJsonArray<MappedAdminNote>(raw["admin_notes_json"]),
  };
}

// ---------------------------------------------------------------------------
// Status Mapping — wc-<slug> -> { fulfillmentStatus, paymentStatus }. Maps
// onto Order.fulfillmentStatus's existing enum (unfulfilled/pending/
// confirmed/processing/packed/shipped/delivered/cancelled/returned) rather
// than adding new values, since the admin order-management UI already
// validates against that fixed list — the original wc-* string is always
// preserved verbatim as Order.wooStatus regardless, so nothing is lost even
// where the mapping is a necessarily lossy many-to-one normalization (e.g.
// "completed" doesn't distinguish shipped/delivered/picked-up).
// ---------------------------------------------------------------------------

export interface StatusMapping { fulfillmentStatus: string; paymentStatus: string }

export const ORDER_STATUS_MAP: Record<string, StatusMapping> = {
  pending: { fulfillmentStatus: "pending", paymentStatus: "pending" },
  "on-hold": { fulfillmentStatus: "pending", paymentStatus: "pending" },
  processing: { fulfillmentStatus: "processing", paymentStatus: "paid" },
  completed: { fulfillmentStatus: "delivered", paymentStatus: "paid" },
  cancelled: { fulfillmentStatus: "cancelled", paymentStatus: "pending" },
  refunded: { fulfillmentStatus: "returned", paymentStatus: "refunded" },
  failed: { fulfillmentStatus: "cancelled", paymentStatus: "failed" },
};
const DEFAULT_STATUS_MAPPING: StatusMapping = { fulfillmentStatus: "pending", paymentStatus: "pending" };

export function resolveOrderStatus(wooStatus: string): StatusMapping & { recognized: boolean } {
  const key = wooStatus.trim().toLowerCase().replace(/^wc-/, "");
  const mapping = ORDER_STATUS_MAP[key];
  return mapping ? { ...mapping, recognized: true } : { ...DEFAULT_STATUS_MAPPING, recognized: false };
}

// ---------------------------------------------------------------------------
// Payment Mapping — raw gateway id -> Order.paymentMethod's enum. Substring
// matching, not an exact lookup table: real stores run dozens of gateway
// plugin variants ("stripe_cc", "stripe_sepa", "ppcp-gateway",
// "paypal_express_checkout"...) that all deserve to land in the same bucket.
// The raw id is always preserved verbatim as Order.paymentGatewayId.
// ---------------------------------------------------------------------------

export type PaymentMethodBucket = "stripe" | "paypal" | "card" | "upi" | "cash" | "bank_transfer" | "cod" | "other";

export function resolvePaymentMethod(gatewayId: string): PaymentMethodBucket {
  const id = gatewayId.trim().toLowerCase();
  if (!id) return "other";
  if (id.includes("stripe")) return "stripe";
  if (id.includes("paypal") || id.includes("ppcp")) return "paypal";
  if (id.includes("upi")) return "upi";
  if (id === "cod" || id.includes("cash_on_delivery") || id.includes("cashondelivery")) return "cod";
  if (id.includes("bacs") || id.includes("bank")) return "bank_transfer";
  if (id.includes("cash")) return "cash";
  if (id.includes("card") || id.includes("credit") || id.includes("authorize") || id.includes("square") || id.includes("braintree")) return "card";
  return "other";
}

// ---------------------------------------------------------------------------
// Customer Linking — email (primary) -> WordPress customer id (fallback) ->
// guest order. Pure: takes already-fetched lookup maps (email/sourceId ->
// User _id), never queries the database itself. See wooOrderImporter.ts /
// wooOrderPreview.ts / wooOrderSqlAnalyzer.ts for where those maps come from.
// ---------------------------------------------------------------------------

export interface CustomerLinkResult { userId: string | null; isGuest: boolean; matchMethod: "email" | "wp-id" | "guest" }

export function resolveOrderCustomerLink(
  mapped: { email: string; customerId: string },
  lookups: { userIdByEmail: Map<string, string>; userIdBySourceId: Map<string, string> }
): CustomerLinkResult {
  const emailKey = mapped.email.trim().toLowerCase();
  if (emailKey) {
    const byEmail = lookups.userIdByEmail.get(emailKey);
    if (byEmail) return { userId: byEmail, isGuest: false, matchMethod: "email" };
  }
  if (mapped.customerId && mapped.customerId !== "0") {
    const byId = lookups.userIdBySourceId.get(mapped.customerId);
    if (byId) return { userId: byId, isGuest: false, matchMethod: "wp-id" };
  }
  return { userId: null, isGuest: true, matchMethod: "guest" };
}

// ---------------------------------------------------------------------------
// Order Item -> Product Linking — SKU first (works for both simple products
// and variations, since a variation's own SKU is looked up directly), name +
// attribute fallback second (for stores where variations were never given
// their own SKU — common on smaller WooCommerce installs). Pure: takes
// already-fetched lookup maps built by the caller from the live Product
// collection, never queries the database itself.
// ---------------------------------------------------------------------------

export interface SkuLookupEntry { productId: string; variantSku: string | null }
export interface NameLookupVariant { sku: string; size?: string; color?: string; attributes?: Record<string, unknown> }
export interface NameLookupEntry { productId: string; variants: NameLookupVariant[] }

export interface ItemLinkResult {
  productId: string | null;
  variantSku: string | null;
  matched: boolean;
  matchMethod: "sku" | "variant-sku" | "name" | "unmatched";
}

function normalizeAttrKey(k: string): string {
  return k.toLowerCase().replace(/^pa_/, "").replace(/^attribute_/, "").trim();
}

function attributeMatches(variant: NameLookupVariant, key: string, value: string): boolean {
  const nk = normalizeAttrKey(key);
  const v = value.trim().toLowerCase();
  if (nk === "size" && variant.size) return variant.size.trim().toLowerCase() === v;
  if ((nk === "color" || nk === "colour") && variant.color) return variant.color.trim().toLowerCase() === v;
  const attrVal = variant.attributes?.[key] ?? variant.attributes?.[nk];
  return attrVal !== undefined && String(attrVal).trim().toLowerCase() === v;
}

export function resolveOrderItemLink(
  item: MappedOrderItem,
  lookups: { bySku: Map<string, SkuLookupEntry>; byName: Map<string, NameLookupEntry> }
): ItemLinkResult {
  const skuKey = item.sku.trim().toLowerCase();
  if (skuKey) {
    const hit = lookups.bySku.get(skuKey);
    if (hit) return { productId: hit.productId, variantSku: hit.variantSku, matched: true, matchMethod: hit.variantSku ? "variant-sku" : "sku" };
  }

  const nameKey = item.name.trim().toLowerCase();
  if (nameKey) {
    const hit = lookups.byName.get(nameKey);
    if (hit) {
      if (!hit.variants.length) return { productId: hit.productId, variantSku: null, matched: true, matchMethod: "name" };
      const attrEntries = Object.entries(item.attributes);
      const variant = attrEntries.length ? hit.variants.find((v) => attrEntries.every(([k, val]) => attributeMatches(v, k, val))) : undefined;
      return { productId: hit.productId, variantSku: variant?.sku ?? null, matched: true, matchMethod: "name" };
    }
  }

  return { productId: null, variantSku: null, matched: false, matchMethod: "unmatched" };
}

// ---------------------------------------------------------------------------
// Coupon Linking — pure decision over an already-fetched code -> exists map.
// ---------------------------------------------------------------------------

export interface CouponLinkResult { code: string; matched: boolean }

export function resolveCouponLinks(codes: string[], existingCodes: Set<string>): CouponLinkResult[] {
  return codes.map((code) => ({ code, matched: existingCodes.has(code.trim().toUpperCase()) }));
}

// ---------------------------------------------------------------------------
// Document assembly — the pure part of turning a mapped order + its already-
// resolved links into an Order document. No database access, no side
// effects. Used by the importer, preview, analyzer, and repair script so
// they all agree on order shape.
// ---------------------------------------------------------------------------

export interface OrderBuildResult {
  doc: Record<string, unknown>;
  items: Record<string, unknown>[];
}

export function buildOrderDoc(
  mapped: WooMappedOrder,
  customerLink: CustomerLinkResult,
  itemLinks: { item: MappedOrderItem; link: ItemLinkResult }[]
): OrderBuildResult {
  const status = resolveOrderStatus(mapped.wooStatus);
  const paymentMethod = resolvePaymentMethod(mapped.paymentMethodRaw);

  const billingAddress =
    mapped.billingAddress1 || mapped.billingCity || mapped.billingCountry
      ? {
          firstName: mapped.billingFirstName, lastName: mapped.billingLastName, company: mapped.billingCompany,
          phone: mapped.billingPhone, address: mapped.billingAddress1, apartment: mapped.billingAddress2,
          city: mapped.billingCity, state: mapped.billingState, postalCode: mapped.billingPostcode, country: mapped.billingCountry,
        }
      : null;
  const shippingAddress =
    mapped.shippingAddress1 || mapped.shippingCity || mapped.shippingCountry
      ? {
          firstName: mapped.shippingFirstName, lastName: mapped.shippingLastName, company: mapped.shippingCompany,
          phone: mapped.shippingPhone, address: mapped.shippingAddress1, apartment: mapped.shippingAddress2,
          city: mapped.shippingCity, state: mapped.shippingState, postalCode: mapped.shippingPostcode, country: mapped.shippingCountry,
        }
      : null;

  const items = itemLinks.map(({ item, link }) => {
    const out: Record<string, unknown> = {
      name: item.name, sku: link.variantSku || item.sku || undefined,
      price: item.unitPrice, quantity: item.quantity,
      subtotal: item.subtotal, total: item.total, tax: item.tax,
    };
    if (link.productId) out.product = link.productId;
    if (Object.keys(item.attributes).length) out.variationAttributes = item.attributes;
    const sizeKey = Object.keys(item.attributes).find((k) => normalizeAttrKey(k) === "size");
    const colorKey = Object.keys(item.attributes).find((k) => ["color", "colour"].includes(normalizeAttrKey(k)));
    if (sizeKey) out.size = item.attributes[sizeKey];
    if (colorKey) out.color = item.attributes[colorKey];
    return out;
  });

  const itemsSubtotal = items.reduce((sum, i) => sum + (Number(i.subtotal) || 0), 0);

  const createdAt = mapped.createdDate ? new Date(mapped.createdDate) : undefined;
  const validCreatedAt = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : undefined;

  const doc: Record<string, unknown> = {
    orderNumber: mapped.orderNumber,
    email: mapped.email,
    isGuestOrder: customerLink.isGuest,
    subtotal: itemsSubtotal,
    shipping: toNumber(mapped.orderShipping),
    tax: toNumber(mapped.orderTax) + toNumber(mapped.orderShippingTax),
    discount: toNumber(mapped.cartDiscount) + toNumber(mapped.cartDiscountTax),
    total: toNumber(mapped.orderTotal),
    currency: mapped.currency || "GBP",
    paymentMethod,
    paymentGatewayId: mapped.paymentMethodRaw || undefined,
    transactionId: mapped.transactionId || undefined,
    customerNote: mapped.customerNote || undefined,
    adminNotes: mapped.adminNotes,
    sourceSystem: "woocommerce",
    sourceId: mapped.sourceId,
    wooStatus: mapped.wooStatus,
    paymentStatus: status.paymentStatus,
    fulfillmentStatus: status.fulfillmentStatus,
    billingAddress, shippingAddress,
  };
  if (mapped.couponCodes.length) { doc.coupon = mapped.couponCodes[0]; doc.couponCodes = mapped.couponCodes; }
  if (customerLink.userId) doc.user = customerLink.userId;
  if (validCreatedAt) doc.createdAt = validCreatedAt;

  return { doc, items };
}

export function isValidOrderTotal(total: string): boolean {
  const n = Number(total);
  return Number.isFinite(n) && n >= 0;
}

// Never let a re-import (or the repair script) silently overwrite an
// order's fulfillment/payment status once an admin has ever changed it
// through the Admin CMS — PATCH /api/admin/orders/[id] always appends to
// `timeline` on a status change (see that route), so a non-empty timeline is
// a reliable "a human has managed this order's lifecycle" signal. Mirrors
// isProtectedAccount's philosophy (wooCustomerMapping.ts): once real,
// deliberate admin action has happened, a data migration must never
// silently undo it — only cosmetic/data-quality fields (addresses, notes,
// totals, item detail) stay eligible for correction on re-import.
export function isProtectedOrder(existing: { timeline?: unknown[] } | null | undefined): boolean {
  if (!existing) return false;
  return (existing.timeline?.length ?? 0) > 0;
}
