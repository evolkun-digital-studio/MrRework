import { OrderModel } from "@/models/Order";
import { UserModel } from "@/models/User";
import { ProductModel } from "@/models/Product";
import { CouponModel } from "@/models/Coupon";
import {
  TARGET_FIELDS,
  buildOrderDoc,
  isProtectedOrder,
  isValidOrderTotal,
  mapRow,
  resolveOrderCustomerLink,
  resolveOrderItemLink,
  resolveOrderStatus,
  type ItemLinkResult,
  type MappedOrderItem,
  type NameLookupEntry,
  type SkuLookupEntry,
  type WooMappedOrder,
} from "./wooOrderMapping";
import { streamOrderRows } from "./wooOrderSqlSource";
import type { ImporterModule, ImportRunContext, RowResult, ValidationIssue } from "../types";

// The order counterpart of customers/wooCustomerImporter.ts — same contract,
// same engine, same wizard. Order items don't exist as their own SKU-keyed
// rows in a WooCommerce export the way product variations do; instead one
// order = one row, with every item, coupon code, and admin note carried as
// pre-structured data (see wooOrderSqlSource.ts). Reuses ctx.seenSkus as
// "order numbers already seen in this file" — same opaque-Set reuse the
// customer importer already established.

export { TARGET_FIELDS, buildOrderDoc, mapRow };
export type { WooMappedOrder } from "./wooOrderMapping";

function validateRow(mapped: WooMappedOrder, rowIndex: number, ctx: ImportRunContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!mapped.orderNumber) {
    issues.push({ row: rowIndex, field: "orderNumber", message: "Missing order number.", level: "error" });
  } else {
    const key = mapped.orderNumber.trim().toLowerCase();
    if (ctx.seenSkus.has(key)) {
      issues.push({ row: rowIndex, field: "orderNumber", message: `Duplicate order number "${mapped.orderNumber}" within this file — the later row will update what the earlier row created.`, level: "warning" });
    }
    ctx.seenSkus.add(key);
  }

  if (!isValidOrderTotal(mapped.orderTotal)) {
    issues.push({ row: rowIndex, field: "orderTotal", message: `"${mapped.orderTotal}" is not a valid non-negative total.`, level: "error" });
  }
  if (!mapped.email && (!mapped.customerId || mapped.customerId === "0")) {
    issues.push({ row: rowIndex, field: "email", message: "No billing email and no WordPress customer id — this will import as a guest order.", level: "warning" });
  }
  if (!resolveOrderStatus(mapped.wooStatus).recognized) {
    issues.push({ row: rowIndex, field: "status", message: `Unrecognized order status "${mapped.wooStatus}" — will default to pending/pending.`, level: "warning" });
  }
  if (!mapped.items.length) {
    issues.push({ row: rowIndex, field: "items", message: "This order has no line items.", level: "warning" });
  }
  for (const item of mapped.items) {
    if (item.quantity <= 0) issues.push({ row: rowIndex, field: "items", message: `Line item "${item.name}" has a non-positive quantity (${item.quantity}).`, level: "warning" });
    if (item.total < 0) issues.push({ row: rowIndex, field: "items", message: `Line item "${item.name}" has a negative total (${item.total}).`, level: "warning" });
  }
  if (mapped.currency && !/^[A-Z]{3}$/.test(mapped.currency)) {
    issues.push({ row: rowIndex, field: "currency", message: `Currency "${mapped.currency}" doesn't look like a 3-letter ISO code.`, level: "warning" });
  }

  return issues;
}

/** Batch-resolves this one order's items against the live Product collection — one query pair per order, not per item. */
async function buildItemLookups(items: MappedOrderItem[]): Promise<{ bySku: Map<string, SkuLookupEntry>; byName: Map<string, NameLookupEntry> }> {
  const bySku = new Map<string, SkuLookupEntry>();
  const byName = new Map<string, NameLookupEntry>();

  const skus = [...new Set(items.map((i) => i.sku.trim()).filter(Boolean))];
  const names = [...new Set(items.map((i) => i.name.trim()).filter(Boolean))];

  const [bySkuProducts, byNameProducts] = await Promise.all([
    skus.length ? ProductModel.find({ $or: [{ sku: { $in: skus } }, { "variants.sku": { $in: skus } }] }).select("sku variants").lean<any[]>() : Promise.resolve([]),
    names.length ? ProductModel.find({ name: { $in: names } }).select("name variants").lean<any[]>() : Promise.resolve([]),
  ]);

  for (const p of bySkuProducts) {
    if (p.sku) bySku.set(String(p.sku).toLowerCase(), { productId: String(p._id), variantSku: null });
    for (const v of p.variants ?? []) {
      if (v.sku) bySku.set(String(v.sku).toLowerCase(), { productId: String(p._id), variantSku: v.sku });
    }
  }
  for (const p of byNameProducts) {
    byName.set(String(p.name).toLowerCase(), {
      productId: String(p._id),
      variants: (p.variants ?? []).map((v: any) => ({ sku: v.sku, size: v.size, color: v.color, attributes: v.attributes })),
    });
  }

  return { bySku, byName };
}

async function importRow(mapped: WooMappedOrder, _rowIndex: number, ctx: ImportRunContext): Promise<RowResult> {
  if (!mapped.orderNumber) {
    return { outcome: "failed", message: "Missing order number — cannot import an order without one." };
  }
  if (!isValidOrderTotal(mapped.orderTotal)) {
    return { outcome: "failed", message: `Order ${mapped.orderNumber}: invalid total "${mapped.orderTotal}".` };
  }

  const [userByEmail, userBySourceId, coupons, itemLookups, existing] = await Promise.all([
    mapped.email ? UserModel.findOne({ email: mapped.email }).select("_id").lean<{ _id: unknown } | null>() : Promise.resolve(null),
    mapped.customerId && mapped.customerId !== "0"
      ? UserModel.findOne({ sourceSystem: "woocommerce", sourceId: mapped.customerId }).select("_id").lean<{ _id: unknown } | null>()
      : Promise.resolve(null),
    mapped.couponCodes.length ? CouponModel.find({ code: { $in: mapped.couponCodes.map((c) => c.trim().toUpperCase()) } }).select("code").lean<{ code: string }[]>() : Promise.resolve([]),
    buildItemLookups(mapped.items),
    OrderModel.findOne({ orderNumber: mapped.orderNumber }),
  ]);

  const customerLink = resolveOrderCustomerLink(mapped, {
    userIdByEmail: userByEmail ? new Map([[mapped.email, String(userByEmail._id)]]) : new Map(),
    userIdBySourceId: userBySourceId ? new Map([[mapped.customerId, String(userBySourceId._id)]]) : new Map(),
  });
  void coupons; // existence already reflected in Coupon collection; couponCodes are preserved verbatim regardless (see buildOrderDoc)

  const itemLinks: { item: MappedOrderItem; link: ItemLinkResult }[] = mapped.items.map((item) => ({ item, link: resolveOrderItemLink(item, itemLookups) }));
  const { doc, items } = buildOrderDoc(mapped, customerLink, itemLinks);

  if (existing) {
    ctx.skuToId.set(mapped.orderNumber.toLowerCase(), String(existing._id));
    if (ctx.duplicateStrategy === "skip") {
      return { outcome: "skipped", message: `Order "${mapped.orderNumber}" already exists.` };
    }

    const protectedOrder = isProtectedOrder(existing);
    const previousValues: Record<string, unknown> = {};
    const patch: Record<string, unknown> = { ...doc, items };
    if (protectedOrder) {
      delete patch.fulfillmentStatus;
      delete patch.paymentStatus;
      delete patch.wooStatus;
    }
    for (const key of Object.keys(patch)) previousValues[key] = (existing as any).get?.(key) ?? (existing as any)[key];

    Object.assign(existing, patch);
    await existing.save();
    return {
      outcome: "updated",
      message: protectedOrder ? `Updated order data only — "${mapped.orderNumber}" has admin-managed status history, left untouched.` : undefined,
      snapshot: { identifier: mapped.orderNumber, documentId: String(existing._id), previousValues },
    };
  }

  const created = await OrderModel.create({ ...doc, items });
  ctx.skuToId.set(mapped.orderNumber.toLowerCase(), String(created._id));
  return { outcome: "imported" };
}

export const wooOrderImporter: ImporterModule<WooMappedOrder> = {
  key: "orders",
  label: "Orders",
  description: "Import historical orders from a WordPress/WooCommerce SQL export (wp_posts + wp_postmeta + order items).",
  icon: "ShoppingBag",
  status: "available",
  acceptedExtensions: [".sql"],
  identifierField: "orderNumber",
  targetFields: TARGET_FIELDS,
  streamRows: streamOrderRows,
  mapRow,
  validateRow,
  importRow,
};
