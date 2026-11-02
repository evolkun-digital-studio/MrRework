import { UserModel } from "@/models/User";
import { ProductModel } from "@/models/Product";
import { CouponModel } from "@/models/Coupon";
import { OrderModel } from "@/models/Order";
import { streamSqlTables } from "../sqlParser";
import { streamOrderRows } from "./wooOrderSqlSource";
import {
  TARGET_FIELDS,
  isValidOrderTotal,
  mapRow,
  resolveOrderCustomerLink,
  resolveOrderItemLink,
  resolveOrderStatus,
  resolvePaymentMethod,
  type NameLookupEntry,
  type SkuLookupEntry,
} from "./wooOrderMapping";

// A read-only "dry run" for a WordPress/WooCommerce order SQL export — the
// order counterpart of customers/wooCustomerSqlAnalyzer.ts. Same guarantee:
// every Mongo call here is .find()/.lean(), never .create()/.save()/
// .updateOne(); nothing is ever persisted from this module. Detects exactly
// what the task's ANALYZER section names: missing customers, missing
// products, missing variations, negative totals, currency mismatch, broken
// payment methods, missing addresses, unsupported order metadata.

export interface OrderAnalysisIssue { row: number; orderNumber: string; message: string; level: "error" | "warning" }

export interface OrderAnalysisReport {
  fileName: string;
  totalRows: number;
  analyzedAt: string;

  general: {
    totalOrders: number;
    totalLineItems: number;
    guestOrders: number;
    registeredCustomerOrders: number;
    dateRange: { earliest: string | null; latest: string | null };
    statusBreakdown: { status: string; fulfillmentStatus: string; paymentStatus: string; count: number }[];
    paymentBreakdown: { bucket: string; gatewayId: string; count: number }[];
    revenue: {
      grossRevenueAllOrders: number;
      recognizedPaidRevenue: number;
      averageOrderValue: number;
      dominantCurrency: string | null;
      currencyBreakdown: { currency: string; count: number; total: number }[];
    };
    timeline: { period: string; orders: number; revenue: number }[];
  };

  quality: {
    missingOrderNumber: number;
    duplicateOrderNumbersInFile: number;
    negativeOrInvalidTotals: number;
    missingBillingAddress: number;
    missingShippingAddress: number;
    unrecognizedStatus: number;
    unrecognizedPaymentMethod: number;
    currencyMismatch: number;
    issues: OrderAnalysisIssue[];
    issuesTruncated: boolean;
  };

  // Every wp_postmeta key found on an order post that this importer doesn't
  // recognize/import — mirrors the customer analyzer's metaKeyCoverage
  // guarantee that nothing is silently invisible to the admin.
  unsupportedMetaKeys: { key: string; orderCount: number }[];

  databaseImpact: {
    ordersToCreate: number;
    ordersToUpdate: number;
    protectedOrdersMatched: number;
    matchedCustomers: number;
    missingCustomers: number;
    totalLineItems: number;
    matchedProductItems: number;
    missingVariationItems: number;
    missingProductItems: number;
    couponCodesUsed: number;
    couponCodesMatched: number;
  };

  summary: { score: number; label: "Ready to Import" | "Needs Review" | "High Risk" };
}

const ISSUE_CAP = 300;
const META_KEY_CAP = 100;
const RECOGNIZED_ORDER_META_KEYS = new Set(TARGET_FIELDS.flatMap((f) => f.aliases));

/** Independent pass purely for "unsupported order metadata" coverage reporting — never used by the real import path. */
async function collectUnsupportedMetaKeys(filePath: string): Promise<{ key: string; orderCount: number }[]> {
  const orderIds = new Set<string>();
  for await (const row of streamSqlTables(filePath, ["wp_posts"])) {
    if (row.table !== "wp_posts") continue;
    if (row.values["post_type"] === "shop_order" && row.values["post_status"] !== "trash" && row.values["ID"]) {
      orderIds.add(row.values["ID"]);
    }
  }
  if (!orderIds.size) return [];

  const metaKeyOrders = new Map<string, Set<string>>();
  for await (const row of streamSqlTables(filePath, ["wp_postmeta"])) {
    const postId = row.values["post_id"];
    const key = row.values["meta_key"];
    if (!postId || !key || !orderIds.has(postId)) continue;
    if (RECOGNIZED_ORDER_META_KEYS.has(key) || key === "_sku") continue;
    const set = metaKeyOrders.get(key) ?? new Set<string>();
    set.add(postId);
    metaKeyOrders.set(key, set);
  }

  return [...metaKeyOrders.entries()]
    .map(([key, orders]) => ({ key, orderCount: orders.size }))
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, META_KEY_CAP);
}

function periodKey(dateStr: string): string | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function analyzeWooOrderSql(filePath: string, fileName: string): Promise<OrderAnalysisReport> {
  const unsupportedMetaKeys = await collectUnsupportedMetaKeys(filePath);

  const mapping: Record<string, string> = {};
  for (const f of TARGET_FIELDS) mapping[f.aliases[0]] = f.key;

  let totalOrders = 0, totalLineItems = 0;
  let earliest: string | null = null, latest: string | null = null;
  const statusCounts = new Map<string, number>();
  const paymentCounts = new Map<string, { bucket: string; count: number }>();
  const currencyTotals = new Map<string, { count: number; total: number }>();
  const timelineByPeriod = new Map<string, { orders: number; revenue: number }>();

  let missingOrderNumber = 0, duplicateOrderNumbersInFile = 0, negativeOrInvalidTotals = 0;
  let missingBillingAddress = 0, missingShippingAddress = 0, unrecognizedStatus = 0, unrecognizedPaymentMethod = 0;
  const seenOrderNumbers = new Set<string>(); // lowercased — dedup-in-file detection only
  const orderNumbersOriginalCase = new Set<string>(); // original case — feeds the case-sensitive DB query below
  const issues: OrderAnalysisIssue[] = [];
  const addIssue = (row: number, orderNumber: string, message: string, level: "error" | "warning") => {
    if (issues.length < ISSUE_CAP) issues.push({ row, orderNumber, message, level });
  };

  let grossRevenueAllOrders = 0, recognizedPaidRevenue = 0;

  const fileEmails: string[] = [];
  const fileWpCustomerIds: string[] = [];
  const allSkus = new Set<string>();
  const allNames = new Set<string>();
  const allCouponCodes = new Set<string>();

  interface PendingOrder { orderNumber: string; email: string; customerId: string; items: ReturnType<typeof mapRow>["items"]; total: number }
  const pending: PendingOrder[] = [];

  for await (const raw of streamOrderRows(filePath)) {
    totalOrders++;
    const mapped = mapRow(raw, mapping);
    const label = mapped.orderNumber || `row ${totalOrders}`;

    if (!mapped.orderNumber) { missingOrderNumber++; addIssue(totalOrders, label, "Missing order number.", "error"); }
    else {
      const key = mapped.orderNumber.toLowerCase();
      if (seenOrderNumbers.has(key)) { duplicateOrderNumbersInFile++; addIssue(totalOrders, label, `Duplicate order number "${mapped.orderNumber}" within this file.`, "warning"); }
      seenOrderNumbers.add(key);
      orderNumbersOriginalCase.add(mapped.orderNumber);
    }

    const total = Number(mapped.orderTotal);
    if (!isValidOrderTotal(mapped.orderTotal)) { negativeOrInvalidTotals++; addIssue(totalOrders, label, `Invalid or negative total "${mapped.orderTotal}".`, "error"); }

    const hasBilling = !!(mapped.billingAddress1 || mapped.billingCity || mapped.billingCountry);
    const hasShipping = !!(mapped.shippingAddress1 || mapped.shippingCity || mapped.shippingCountry);
    if (!hasBilling) { missingBillingAddress++; addIssue(totalOrders, label, "No billing address.", "warning"); }
    if (!hasShipping) { missingShippingAddress++; addIssue(totalOrders, label, "No shipping address.", "warning"); }

    const status = resolveOrderStatus(mapped.wooStatus);
    if (!status.recognized) { unrecognizedStatus++; addIssue(totalOrders, label, `Unrecognized status "${mapped.wooStatus}".`, "warning"); }
    const statusKey = mapped.wooStatus || "(none)";
    statusCounts.set(statusKey, (statusCounts.get(statusKey) ?? 0) + 1);

    const bucket = resolvePaymentMethod(mapped.paymentMethodRaw);
    if (bucket === "other" && mapped.paymentMethodRaw) { unrecognizedPaymentMethod++; addIssue(totalOrders, label, `Unrecognized payment gateway "${mapped.paymentMethodRaw}" — bucketed as "other".`, "warning"); }
    const payKey = mapped.paymentMethodRaw || "(none)";
    const payEntry = paymentCounts.get(payKey) ?? { bucket, count: 0 };
    payEntry.count++;
    paymentCounts.set(payKey, payEntry);

    if (mapped.email) fileEmails.push(mapped.email);
    if (mapped.customerId && mapped.customerId !== "0") fileWpCustomerIds.push(mapped.customerId);

    const currency = mapped.currency || "(unknown)";
    const currEntry = currencyTotals.get(currency) ?? { count: 0, total: 0 };
    currEntry.count++;
    if (Number.isFinite(total)) currEntry.total += total;
    currencyTotals.set(currency, currEntry);

    if (Number.isFinite(total) && total >= 0) {
      grossRevenueAllOrders += total;
      if (status.paymentStatus === "paid" || status.paymentStatus === "refunded") recognizedPaidRevenue += total;
    }

    const period = periodKey(mapped.createdDate);
    if (period) {
      const entry = timelineByPeriod.get(period) ?? { orders: 0, revenue: 0 };
      entry.orders++;
      if (Number.isFinite(total)) entry.revenue += total;
      timelineByPeriod.set(period, entry);
      if (!earliest || mapped.createdDate < earliest) earliest = mapped.createdDate;
      if (!latest || mapped.createdDate > latest) latest = mapped.createdDate;
    }

    totalLineItems += mapped.items.length;
    for (const item of mapped.items) {
      // Original case preserved here — this feeds the MongoDB query below,
      // and `sku`/`name` string equality there is case-sensitive. Lookup
      // maps built FROM the query results lowercase their own keys (see
      // bySku/byName below), which is where case-insensitive matching
      // actually happens.
      if (item.sku) allSkus.add(item.sku.trim());
      if (item.name) allNames.add(item.name.trim());
    }
    for (const code of mapped.couponCodes) allCouponCodes.add(code.trim().toUpperCase());

    pending.push({ orderNumber: mapped.orderNumber, email: mapped.email, customerId: mapped.customerId, items: mapped.items, total });
  }

  // Read-only DB lookups — batched once for the whole file, never per row.
  const [existingUsersByEmail, existingUsersBySourceId, existingOrders, existingCoupons, skuProducts, nameProducts] = await Promise.all([
    fileEmails.length ? UserModel.find({ email: { $in: [...new Set(fileEmails.map((e) => e.toLowerCase()))] } }).select("email").lean<{ email: string }[]>() : Promise.resolve([]),
    fileWpCustomerIds.length ? UserModel.find({ sourceSystem: "woocommerce", sourceId: { $in: [...new Set(fileWpCustomerIds)] } }).select("sourceId").lean<{ sourceId: string }[]>() : Promise.resolve([]),
    orderNumbersOriginalCase.size ? OrderModel.find({ orderNumber: { $in: [...orderNumbersOriginalCase] } }).select("orderNumber timeline").lean<{ orderNumber: string; timeline?: unknown[] }[]>() : Promise.resolve([]),
    allCouponCodes.size ? CouponModel.find({ code: { $in: [...allCouponCodes] } }).select("code").lean<{ code: string }[]>() : Promise.resolve([]),
    allSkus.size ? ProductModel.find({ $or: [{ sku: { $in: [...allSkus] } }, { "variants.sku": { $in: [...allSkus] } }] }).select("sku name variants").lean<any[]>() : Promise.resolve([]),
    allNames.size ? ProductModel.find({ name: { $in: [...allNames] } }).select("name variants").lean<any[]>() : Promise.resolve([]),
  ]);

  const userEmailSet = new Set(existingUsersByEmail.map((u) => u.email.toLowerCase()));
  const userSourceIdSet = new Set(existingUsersBySourceId.map((u) => u.sourceId));
  const existingOrderByNumber = new Map(existingOrders.map((o: any) => [o.orderNumber.toLowerCase(), o]));
  const existingCouponCodes = new Set(existingCoupons.map((c) => c.code.toUpperCase()));

  const bySku = new Map<string, SkuLookupEntry>();
  const byName = new Map<string, NameLookupEntry>();
  for (const p of skuProducts) {
    if (p.sku) bySku.set(String(p.sku).toLowerCase(), { productId: String(p._id), variantSku: null });
    for (const v of p.variants ?? []) if (v.sku) bySku.set(String(v.sku).toLowerCase(), { productId: String(p._id), variantSku: v.sku });
  }
  for (const p of nameProducts) {
    byName.set(String(p.name).toLowerCase(), { productId: String(p._id), variants: (p.variants ?? []).map((v: any) => ({ sku: v.sku, size: v.size, color: v.color, attributes: v.attributes })) });
  }

  let ordersToCreate = 0, ordersToUpdate = 0, protectedOrdersMatched = 0;
  let matchedCustomers = 0, missingCustomers = 0;
  let matchedProductItems = 0, missingVariationItems = 0, missingProductItems = 0;

  for (const order of pending) {
    const numberKey = order.orderNumber.toLowerCase();
    const existing = numberKey ? existingOrderByNumber.get(numberKey) : undefined;
    if (existing) {
      ordersToUpdate++;
      if ((existing.timeline?.length ?? 0) > 0) protectedOrdersMatched++;
    } else if (order.orderNumber) {
      ordersToCreate++;
    }

    const link = resolveOrderCustomerLink(order, {
      userIdByEmail: order.email && userEmailSet.has(order.email.toLowerCase()) ? new Map([[order.email, "1"]]) : new Map(),
      userIdBySourceId: order.customerId && userSourceIdSet.has(order.customerId) ? new Map([[order.customerId, "1"]]) : new Map(),
    });
    if (link.isGuest) missingCustomers++; else matchedCustomers++;

    for (const item of order.items) {
      const itemLink = resolveOrderItemLink(item, { bySku, byName });
      if (!itemLink.matched) missingProductItems++;
      else {
        matchedProductItems++;
        const hasAttributes = Object.keys(item.attributes).length > 0;
        if (hasAttributes && !itemLink.variantSku) missingVariationItems++;
      }
    }
  }

  let currencyMismatch = 0;
  const dominantCurrency = [...currencyTotals.entries()].sort((a, b) => b[1].count - a[1].count)[0]?.[0] ?? null;
  if (dominantCurrency) {
    for (const [currency, entry] of currencyTotals) if (currency !== dominantCurrency) currencyMismatch += entry.count;
  }

  const averageOrderValue = totalOrders > 0 ? grossRevenueAllOrders / totalOrders : 0;

  // Readiness score — same rubric spirit as the customer/product analyzers:
  // heavier deductions for blocking issues than soft-quality ones.
  let score = 100;
  score -= Math.min(50, missingOrderNumber * 2 + negativeOrInvalidTotals * 2);
  score -= Math.min(20, duplicateOrderNumbersInFile);
  score -= Math.min(15, missingProductItems * 0.5);
  score -= Math.min(10, unrecognizedStatus * 0.5 + unrecognizedPaymentMethod * 0.5);
  score -= Math.min(10, missingBillingAddress * 0.2 + missingShippingAddress * 0.2);
  score = Math.max(0, Math.round(score));
  const label = score >= 90 ? "Ready to Import" : score >= 70 ? "Needs Review" : "High Risk";

  return {
    fileName,
    totalRows: totalOrders,
    analyzedAt: new Date().toISOString(),
    general: {
      totalOrders, totalLineItems,
      // "Guest" here means "no matching User account" (resolveOrderCustomerLink's
      // real determination, made against the database below) — not merely
      // "no email/customer id present in the file at all." An order with a
      // real billing email that simply doesn't match any existing account is
      // still a guest order once imported.
      guestOrders: missingCustomers, registeredCustomerOrders: matchedCustomers,
      dateRange: { earliest, latest },
      statusBreakdown: [...statusCounts.entries()].map(([status, count]) => {
        const m = resolveOrderStatus(status);
        return { status, fulfillmentStatus: m.fulfillmentStatus, paymentStatus: m.paymentStatus, count };
      }).sort((a, b) => b.count - a.count),
      paymentBreakdown: [...paymentCounts.entries()].map(([gatewayId, v]) => ({ bucket: v.bucket, gatewayId, count: v.count })).sort((a, b) => b.count - a.count),
      revenue: {
        grossRevenueAllOrders: Math.round(grossRevenueAllOrders * 100) / 100,
        recognizedPaidRevenue: Math.round(recognizedPaidRevenue * 100) / 100,
        averageOrderValue: Math.round(averageOrderValue * 100) / 100,
        dominantCurrency,
        currencyBreakdown: [...currencyTotals.entries()].map(([currency, v]) => ({ currency, count: v.count, total: Math.round(v.total * 100) / 100 })).sort((a, b) => b.count - a.count),
      },
      timeline: [...timelineByPeriod.entries()].map(([period, v]) => ({ period, orders: v.orders, revenue: Math.round(v.revenue * 100) / 100 })).sort((a, b) => a.period.localeCompare(b.period)),
    },
    quality: {
      missingOrderNumber, duplicateOrderNumbersInFile, negativeOrInvalidTotals,
      missingBillingAddress, missingShippingAddress, unrecognizedStatus, unrecognizedPaymentMethod, currencyMismatch,
      issues: issues.slice(0, ISSUE_CAP), issuesTruncated: issues.length >= ISSUE_CAP,
    },
    unsupportedMetaKeys,
    databaseImpact: {
      ordersToCreate, ordersToUpdate, protectedOrdersMatched,
      matchedCustomers, missingCustomers,
      totalLineItems, matchedProductItems, missingVariationItems, missingProductItems,
      couponCodesUsed: allCouponCodes.size, couponCodesMatched: [...allCouponCodes].filter((c) => existingCouponCodes.has(c)).length,
    },
    summary: { score, label },
  };
}
