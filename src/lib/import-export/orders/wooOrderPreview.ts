import { dbConnect } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { ProductModel } from "@/models/Product";
import { CouponModel } from "@/models/Coupon";
import { OrderModel } from "@/models/Order";
import { streamOrderRows } from "./wooOrderSqlSource";
import {
  buildOrderDoc,
  isProtectedOrder,
  mapRow,
  resolveOrderCustomerLink,
  resolveOrderItemLink,
  type ItemLinkResult,
  type MappedOrderItem,
  type NameLookupEntry,
  type SkuLookupEntry,
  type WooMappedOrder,
} from "./wooOrderMapping";

// The order counterpart of customers/wooCustomerPreview.ts — "source row ->
// mapped fields -> the exact document a real import would create," entirely
// read-only. Calls the exact same mapRow()/resolveOrderCustomerLink()/
// resolveOrderItemLink()/buildOrderDoc() the live importer uses — no
// re-implementation of any mapping, linking, or merge logic. For a
// protected order (admin-managed status history), `after` shows the
// existing, unchanged fulfillmentStatus/paymentStatus/wooStatus — mirroring
// what wooOrderImporter.ts's importRow actually does (strips those three
// fields from its patch), the same accuracy fix the Customer Migration
// Assistant needed for isProtectedAccount (see ADMIN_CMS.md's Customer
// Migration Assistant section) applied here from the start.

const PREVIEW_CAP = 200;

export interface OrderPreviewAddress {
  firstName: string; lastName: string; company: string; phone: string;
  address: string; apartment: string; city: string; state: string; postalCode: string; country: string;
}

export interface OrderPreviewItem {
  name: string; sku: string | null; quantity: number; unitPrice: number; subtotal: number; total: number; tax: number;
  matched: boolean; matchMethod: string; attributes: Record<string, string>;
}

export interface OrderPreviewSide {
  orderNumber: string;
  wooStatus: string; fulfillmentStatus: string; paymentStatus: string;
  createdAt: string | null;
  email: string; isGuestOrder: boolean;
  currency: string; subtotal: number; shipping: number; tax: number; discount: number; total: number;
  paymentMethod: string; paymentGatewayId: string; transactionId: string;
  couponCodes: string[];
  billingAddress: OrderPreviewAddress | null;
  shippingAddress: OrderPreviewAddress | null;
  items: OrderPreviewItem[];
}

export interface OrderPreviewRow {
  row: number;
  orderNumber: string;
  isDuplicateInFile: boolean;
  existsInDb: boolean;
  isProtected: boolean;
  before: OrderPreviewSide | null;
  after: OrderPreviewSide;
  warnings: string[];
}

export interface OrderPreviewResult {
  rows: OrderPreviewRow[];
  totalRows: number;
  truncated: boolean;
}

function toAddress(addr: Record<string, unknown> | null): OrderPreviewAddress | null {
  if (!addr) return null;
  return {
    firstName: String(addr.firstName ?? ""), lastName: String(addr.lastName ?? ""), company: String(addr.company ?? ""),
    phone: String(addr.phone ?? ""), address: String(addr.address ?? ""), apartment: String(addr.apartment ?? ""),
    city: String(addr.city ?? ""), state: String(addr.state ?? ""), postalCode: String(addr.postalCode ?? ""), country: String(addr.country ?? ""),
  };
}

function existingToSide(existing: any): OrderPreviewSide {
  return {
    orderNumber: existing.orderNumber ?? "",
    wooStatus: existing.wooStatus ?? "", fulfillmentStatus: existing.fulfillmentStatus ?? "", paymentStatus: existing.paymentStatus ?? "",
    createdAt: existing.createdAt ? new Date(existing.createdAt).toISOString() : null,
    email: existing.email ?? "", isGuestOrder: !!existing.isGuestOrder,
    currency: existing.currency ?? "GBP", subtotal: existing.subtotal ?? 0, shipping: existing.shipping ?? 0,
    tax: existing.tax ?? 0, discount: existing.discount ?? 0, total: existing.total ?? 0,
    paymentMethod: existing.paymentMethod ?? "", paymentGatewayId: existing.paymentGatewayId ?? "", transactionId: existing.transactionId ?? "",
    couponCodes: existing.couponCodes ?? (existing.coupon ? [existing.coupon] : []),
    billingAddress: toAddress(existing.billingAddress ?? null),
    shippingAddress: toAddress(existing.shippingAddress ?? null),
    items: (existing.items ?? []).map((i: any) => ({
      name: i.name ?? "", sku: i.sku ?? null, quantity: i.quantity ?? 0, unitPrice: i.price ?? 0,
      subtotal: i.subtotal ?? 0, total: i.total ?? 0, tax: i.tax ?? 0,
      matched: !!i.product, matchMethod: i.product ? "existing" : "unmatched", attributes: i.variationAttributes ?? {},
    })),
  };
}

export async function previewOrders(filePath: string, columnMapping: Record<string, string>): Promise<OrderPreviewResult> {
  await dbConnect();

  const mapped_rows: { rowIndex: number; mapped: WooMappedOrder }[] = [];
  let totalRows = 0;
  const seenOrderNumbers = new Set<string>();

  const emails = new Set<string>();
  const wpCustomerIds = new Set<string>();
  const orderNumbers = new Set<string>();
  const skus = new Set<string>();
  const names = new Set<string>();
  const couponCodes = new Set<string>();

  for await (const raw of streamOrderRows(filePath)) {
    totalRows++;
    if (mapped_rows.length >= PREVIEW_CAP) continue;
    const mapped = mapRow(raw, columnMapping);
    mapped_rows.push({ rowIndex: totalRows, mapped });

    if (mapped.email) emails.add(mapped.email);
    if (mapped.customerId && mapped.customerId !== "0") wpCustomerIds.add(mapped.customerId);
    if (mapped.orderNumber) orderNumbers.add(mapped.orderNumber);
    for (const item of mapped.items) {
      // Original case preserved — feeds the MongoDB query below (case-
      // sensitive string equality); lookup-map keys are lowercased only
      // after the query results come back (see bySku/byName below).
      if (item.sku) skus.add(item.sku.trim());
      if (item.name) names.add(item.name.trim());
    }
    for (const code of mapped.couponCodes) couponCodes.add(code.trim().toUpperCase());
  }

  const [users, usersBySourceId, existingOrders, coupons, skuProducts, nameProducts] = await Promise.all([
    emails.size ? UserModel.find({ email: { $in: [...emails] } }).select("email").lean<{ email: string }[]>() : Promise.resolve([]),
    wpCustomerIds.size ? UserModel.find({ sourceSystem: "woocommerce", sourceId: { $in: [...wpCustomerIds] } }).select("sourceId").lean<{ sourceId: string }[]>() : Promise.resolve([]),
    orderNumbers.size ? OrderModel.find({ orderNumber: { $in: [...orderNumbers] } }).lean<any[]>() : Promise.resolve([]),
    couponCodes.size ? CouponModel.find({ code: { $in: [...couponCodes] } }).select("code").lean<{ code: string }[]>() : Promise.resolve([]),
    skus.size ? ProductModel.find({ $or: [{ sku: { $in: [...skus] } }, { "variants.sku": { $in: [...skus] } }] }).select("sku variants").lean<any[]>() : Promise.resolve([]),
    names.size ? ProductModel.find({ name: { $in: [...names] } }).select("name variants").lean<any[]>() : Promise.resolve([]),
  ]);
  void coupons;

  const userEmailSet = new Set(users.map((u) => u.email.toLowerCase()));
  const userSourceIdSet = new Set(usersBySourceId.map((u) => u.sourceId));
  const existingByOrderNumber = new Map(existingOrders.map((o) => [String(o.orderNumber).toLowerCase(), o]));

  const bySku = new Map<string, SkuLookupEntry>();
  const byName = new Map<string, NameLookupEntry>();
  for (const p of skuProducts) {
    if (p.sku) bySku.set(String(p.sku).toLowerCase(), { productId: String(p._id), variantSku: null });
    for (const v of p.variants ?? []) if (v.sku) bySku.set(String(v.sku).toLowerCase(), { productId: String(p._id), variantSku: v.sku });
  }
  for (const p of nameProducts) {
    byName.set(String(p.name).toLowerCase(), { productId: String(p._id), variants: (p.variants ?? []).map((v: any) => ({ sku: v.sku, size: v.size, color: v.color, attributes: v.attributes })) });
  }

  const rows: OrderPreviewRow[] = mapped_rows.map(({ rowIndex, mapped }) => {
    const warnings: string[] = [];
    const numberKey = mapped.orderNumber.toLowerCase();

    if (!mapped.orderNumber) warnings.push("Missing order number — this row cannot be imported.");
    const isDuplicateInFile = !!mapped.orderNumber && seenOrderNumbers.has(numberKey);
    if (mapped.orderNumber) seenOrderNumbers.add(numberKey);
    if (isDuplicateInFile) warnings.push("Duplicate order number within this file — a later row will overwrite this one.");

    const total = Number(mapped.orderTotal);
    if (!Number.isFinite(total) || total < 0) warnings.push(`"${mapped.orderTotal}" is not a valid non-negative total.`);

    if (!mapped.email && (!mapped.customerId || mapped.customerId === "0")) warnings.push("No billing email or WordPress customer id — will import as a guest order.");
    if (!mapped.items.length) warnings.push("This order has no line items.");

    const existing = existingByOrderNumber.get(numberKey);
    const protectedOrder = isProtectedOrder(existing);
    if (protectedOrder) warnings.push("Matches an existing order with admin-managed status history — only order data will be updated, fulfillment/payment status left untouched.");

    const customerLink = resolveOrderCustomerLink(mapped, {
      userIdByEmail: mapped.email && userEmailSet.has(mapped.email.toLowerCase()) ? new Map([[mapped.email, "1"]]) : new Map(),
      userIdBySourceId: mapped.customerId && userSourceIdSet.has(mapped.customerId) ? new Map([[mapped.customerId, "1"]]) : new Map(),
    });

    const itemLinks: { item: MappedOrderItem; link: ItemLinkResult }[] = mapped.items.map((item) => ({ item, link: resolveOrderItemLink(item, { bySku, byName }) }));
    for (const { item, link } of itemLinks) {
      if (!link.matched) warnings.push(`Line item "${item.name}" couldn't be matched to any product in the catalog.`);
      else if (Object.keys(item.attributes).length && !link.variantSku) warnings.push(`Line item "${item.name}" matched a product but not the specific variation ordered.`);
    }

    const { doc, items } = buildOrderDoc(mapped, customerLink, itemLinks);

    const after: OrderPreviewSide = {
      orderNumber: String(doc.orderNumber ?? ""),
      wooStatus: protectedOrder ? (existing?.wooStatus ?? "") : String(doc.wooStatus ?? ""),
      fulfillmentStatus: protectedOrder ? (existing?.fulfillmentStatus ?? "") : String(doc.fulfillmentStatus ?? ""),
      paymentStatus: protectedOrder ? (existing?.paymentStatus ?? "") : String(doc.paymentStatus ?? ""),
      createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : null,
      email: String(doc.email ?? ""), isGuestOrder: !!doc.isGuestOrder,
      currency: String(doc.currency ?? "GBP"), subtotal: Number(doc.subtotal) || 0, shipping: Number(doc.shipping) || 0,
      tax: Number(doc.tax) || 0, discount: Number(doc.discount) || 0, total: Number(doc.total) || 0,
      paymentMethod: String(doc.paymentMethod ?? ""), paymentGatewayId: String(doc.paymentGatewayId ?? ""), transactionId: String(doc.transactionId ?? ""),
      couponCodes: (doc.couponCodes as string[] | undefined) ?? [],
      billingAddress: toAddress(doc.billingAddress as Record<string, unknown> | null),
      shippingAddress: toAddress(doc.shippingAddress as Record<string, unknown> | null),
      items: items.map((it, i) => ({
        name: String(it.name ?? ""), sku: (it.sku as string | undefined) ?? null,
        quantity: Number(it.quantity) || 0, unitPrice: Number(it.price) || 0,
        subtotal: Number(it.subtotal) || 0, total: Number(it.total) || 0, tax: Number(it.tax) || 0,
        matched: itemLinks[i].link.matched, matchMethod: itemLinks[i].link.matchMethod,
        attributes: (it.variationAttributes as Record<string, string> | undefined) ?? {},
      })),
    };

    return {
      row: rowIndex,
      orderNumber: mapped.orderNumber,
      isDuplicateInFile,
      existsInDb: !!existing,
      isProtected: protectedOrder,
      before: existing ? existingToSide(existing) : null,
      after,
      warnings,
    };
  });

  return { rows, totalRows, truncated: totalRows > PREVIEW_CAP };
}
