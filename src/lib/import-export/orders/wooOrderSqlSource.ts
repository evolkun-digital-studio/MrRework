import { streamSqlTables } from "../sqlParser";

// Turns a WordPress/WooCommerce SQL dump's order-related tables into a
// stream of flat, CSV-shaped rows — one per order — exactly like
// customers/wooCustomerSqlSource.ts does for wp_users/wp_usermeta. Line
// items, coupon codes, and admin notes are structural (variable-length),
// not a single scalar value, so they're carried as JSON-encoded strings in
// dedicated columns (line_items_json / coupon_codes_json / admin_notes_json)
// rather than forced through the column-mapping UI — nothing about "which
// SKU is item 3 of this order" is something an admin would ever want to
// remap by hand, unlike a genuinely ambiguous column name. wooOrderMapping.ts
// parses these back into structured arrays.
//
// Required tables (per the task): wp_posts, wp_postmeta,
// wp_woocommerce_order_items, wp_woocommerce_order_itemmeta. Two more standard
// WordPress tables are read opportunistically, purely to satisfy explicitly
// requested Order fields that have nowhere else to come from — both degrade
// silently to "nothing found" if the dump doesn't include them (streamSqlTables
// simply yields no rows for a table that isn't present):
//   - wp_posts is also scanned for `post_type IN ('product','product_variation')`
//     rows, building an in-memory product_id/variation_id -> SKU lookup used
//     to reconnect order line items to the already-imported Product
//     collection (see § Order Items — Product Linking, ADMIN_CMS.md). No
//     Product document is ever read from or written to here; this is a
//     read-only index over the SQL file itself.
//   - wp_comments, for WooCommerce's private "order notes" (comment_type
//     "order_note") — the only place WooCommerce stores admin notes; the
//     four required tables have nowhere to carry them.
//
// Storage model: BOTH legacy (orders as wp_posts rows, post_type =
// "shop_order") and HPOS (WooCommerce's Custom Order Tables — wp_wc_orders +
// wp_wc_orders_meta + wp_wc_order_addresses + wp_wc_order_operational_data,
// the default for every store created since WooCommerce 8.2) are supported —
// see collectHposOrders() below. A real HPOS store's wp_posts still carries
// one lightweight `shop_order_placehold` stub per order (WooCommerce's own
// backward-compatibility shim, never real order data) — that is not a
// second, competing order source and is correctly ignored here (this module
// only ever matches `post_type === "shop_order"` in wp_posts). Both
// collectors produce the exact same intermediate shape, so a store with
// orders in both tables at once (a partial/in-progress HPOS migration) is
// handled by a plain Map-merge with HPOS taking priority per order ID — see
// streamOrderRows() below — with zero special-casing needed downstream.
//
// No `server-only` guard, same reasoning as wooCustomerSqlSource.ts: reused
// as-is by the standalone repair script (scripts/migrateWooOrders.ts).

const ORDER_META_KEYS = new Set([
  "_order_key", "_order_number", "_customer_user", "_order_currency",
  "_order_total", "_order_tax", "_order_shipping", "_order_shipping_tax",
  "_cart_discount", "_cart_discount_tax",
  "_payment_method", "_payment_method_title", "_transaction_id", "_customer_ip_address", "_created_via",
  "billing_first_name", "billing_last_name", "billing_company", "billing_address_1", "billing_address_2",
  "billing_city", "billing_state", "billing_postcode", "billing_country", "billing_phone", "billing_email",
  "shipping_first_name", "shipping_last_name", "shipping_company", "shipping_address_1", "shipping_address_2",
  "shipping_city", "shipping_state", "shipping_postcode", "shipping_country", "shipping_phone",
]);

// Internal WooCommerce order-item meta — never a customer-visible attribute,
// so excluded from the generic "everything else is an attribute" fallback
// used to recover variation selections (see collectOrderItems below).
const ORDER_ITEM_INTERNAL_META_KEYS = new Set([
  "_product_id", "_variation_id", "_qty",
  "_line_subtotal", "_line_subtotal_tax", "_line_total", "_line_total_tax",
  "_line_tax", "_line_tax_data", "_tax_class", "_reduced_stock",
  "discount_amount", "discount_amount_tax", "coupon_data",
]);

interface RawPost {
  id: string;
  postType: string;
  postParent: string;
  postDate: string;
  postModified: string;
  postStatus: string;
  postTitle: string;
  postExcerpt: string;
}

interface AdminNote {
  note: string;
  createdAt: string;
  isCustomerNote: boolean;
}

interface CollectedPosts {
  orders: Map<string, RawPost & { meta: Record<string, string> }>;
  productSkuById: Map<string, string>;
  variationParentById: Map<string, string>;
  adminNotesByOrderId: Map<string, AdminNote[]>;
}

/**
 * Pass 1 of 2: one full streamSqlTables pass over wp_posts + wp_postmeta +
 * wp_comments together (a single linear scan handles all three, same
 * memory-bound tradeoff as sqlParser.ts documents). Order-relevant meta and
 * product SKUs are collected into small allow-listed maps regardless of
 * which table's row arrives first — real dumps write one table's INSERTs as
 * a contiguous block, so which post a given postmeta row belongs to isn't
 * knowable until wp_posts has been fully seen either way; correlation
 * happens once, after the whole pass completes.
 */
async function collectPostsAndMeta(filePath: string): Promise<CollectedPosts> {
  const postsById = new Map<string, RawPost>();
  const metaByPostId = new Map<string, Record<string, string>>();
  const skuByPostId = new Map<string, string>();
  const notesByOrderId = new Map<string, AdminNote[]>();

  for await (const row of streamSqlTables(filePath, ["wp_posts", "wp_postmeta", "wp_comments"])) {
    if (row.table === "wp_posts") {
      const id = row.values["ID"];
      if (!id) continue;
      postsById.set(id, {
        id,
        postType: row.values["post_type"] ?? "",
        postParent: row.values["post_parent"] ?? "0",
        postDate: row.values["post_date"] ?? "",
        postModified: row.values["post_modified"] ?? "",
        postStatus: row.values["post_status"] ?? "",
        postTitle: row.values["post_title"] ?? "",
        postExcerpt: row.values["post_excerpt"] ?? "",
      });
      continue;
    }

    if (row.table === "wp_postmeta") {
      const postId = row.values["post_id"];
      const key = row.values["meta_key"];
      const value = row.values["meta_value"] ?? "";
      if (!postId || !key) continue;
      if (key === "_sku") { skuByPostId.set(postId, value); continue; }
      if (ORDER_META_KEYS.has(key)) {
        const bag = metaByPostId.get(postId) ?? {};
        bag[key] = value;
        metaByPostId.set(postId, bag);
      }
      continue;
    }

    if (row.table === "wp_comments") {
      if ((row.values["comment_type"] ?? "") !== "order_note") continue;
      const orderId = row.values["comment_post_ID"];
      if (!orderId) continue;
      const list = notesByOrderId.get(orderId) ?? [];
      list.push({
        note: row.values["comment_content"] ?? "",
        createdAt: row.values["comment_date"] ?? "",
        isCustomerNote: false, // requires a wp_commentmeta join we don't attempt — see module comment
      });
      notesByOrderId.set(orderId, list);
    }
  }

  const orders = new Map<string, RawPost & { meta: Record<string, string> }>();
  const productSkuById = new Map<string, string>();
  const variationParentById = new Map<string, string>();

  for (const [id, post] of postsById) {
    if (post.postType === "shop_order" && post.postStatus !== "trash") {
      orders.set(id, { ...post, meta: metaByPostId.get(id) ?? {} });
    } else if (post.postType === "product") {
      const sku = skuByPostId.get(id);
      if (sku) productSkuById.set(id, sku);
    } else if (post.postType === "product_variation") {
      const sku = skuByPostId.get(id);
      if (sku) productSkuById.set(id, sku);
      variationParentById.set(id, post.postParent);
    }
  }

  return { orders, productSkuById, variationParentById, adminNotesByOrderId: notesByOrderId };
}

interface HposAddress {
  first_name: string; last_name: string; company: string; address_1: string; address_2: string;
  city: string; state: string; postcode: string; country: string; phone: string; email: string;
}

/**
 * HPOS (WooCommerce's Custom Order Tables) equivalent of the legacy-order
 * half of collectPostsAndMeta() above — produces the exact same `RawPost &
 * { meta }` shape per order (same field names throughout: `_order_total`,
 * `billing_city`, etc.), so streamOrderRows() below never needs to know or
 * care which storage model a given order actually came from. One combined
 * pass over all four HPOS tables (same "correlate after the full scan"
 * approach collectPostsAndMeta uses, for the same reason: which table's rows
 * arrive first isn't guaranteed, only that a real dump writes each table's
 * own INSERTs as a contiguous block).
 */
async function collectHposOrders(filePath: string): Promise<Map<string, RawPost & { meta: Record<string, string> }>> {
  const ordersById = new Map<string, Record<string, string | null>>();
  const addressesByOrderId = new Map<string, { billing?: HposAddress; shipping?: HposAddress }>();
  const opDataByOrderId = new Map<string, Record<string, string>>();
  const orderNumberByOrderId = new Map<string, string>();

  for await (const row of streamSqlTables(filePath, ["wp_wc_orders", "wp_wc_orders_meta", "wp_wc_order_addresses", "wp_wc_order_operational_data"])) {
    if (row.table === "wp_wc_orders") {
      const id = row.values["id"];
      if (id) ordersById.set(id, row.values);
      continue;
    }
    if (row.table === "wp_wc_order_addresses") {
      const orderId = row.values["order_id"];
      const type = row.values["address_type"];
      if (!orderId || (type !== "billing" && type !== "shipping")) continue;
      const bag = addressesByOrderId.get(orderId) ?? {};
      bag[type] = {
        first_name: row.values["first_name"] ?? "", last_name: row.values["last_name"] ?? "", company: row.values["company"] ?? "",
        address_1: row.values["address_1"] ?? "", address_2: row.values["address_2"] ?? "", city: row.values["city"] ?? "",
        state: row.values["state"] ?? "", postcode: row.values["postcode"] ?? "", country: row.values["country"] ?? "",
        phone: row.values["phone"] ?? "", email: row.values["email"] ?? "",
      };
      addressesByOrderId.set(orderId, bag);
      continue;
    }
    if (row.table === "wp_wc_order_operational_data") {
      const orderId = row.values["order_id"];
      if (orderId) opDataByOrderId.set(orderId, row.values as Record<string, string>);
      continue;
    }
    if (row.table === "wp_wc_orders_meta") {
      const orderId = row.values["order_id"];
      const key = row.values["meta_key"];
      // The only field this source needs beyond HPOS's own columnar data —
      // a sequential/custom order number (e.g. from a numbering plugin);
      // every other legacy meta key this importer reads is already a plain
      // column on wp_wc_orders/wp_wc_order_operational_data instead.
      if (orderId && key === "_order_number") orderNumberByOrderId.set(orderId, row.values["meta_value"] ?? "");
    }
  }

  const orders = new Map<string, RawPost & { meta: Record<string, string> }>();
  for (const [id, order] of ordersById) {
    // Mirrors the legacy filter exactly: only real orders, never refunds
    // (HPOS's own `type` column distinguishes "shop_order" from
    // "shop_order_refund" the same way wp_posts's post_type does) or
    // trashed ones.
    if ((order["type"] ?? "") !== "shop_order" || order["status"] === "trash") continue;

    const addresses = addressesByOrderId.get(id) ?? {};
    const billing = addresses.billing;
    const shipping = addresses.shipping;
    const opData = opDataByOrderId.get(id) ?? {};

    const meta: Record<string, string> = {
      _order_number: orderNumberByOrderId.get(id) ?? "",
      _customer_user: order["customer_id"] ?? "",
      _order_currency: order["currency"] ?? "",
      _order_total: order["total_amount"] ?? "",
      _order_tax: order["tax_amount"] ?? "",
      _order_shipping: opData["shipping_total_amount"] ?? "",
      _order_shipping_tax: opData["shipping_tax_amount"] ?? "",
      _cart_discount: opData["discount_total_amount"] ?? "",
      _cart_discount_tax: opData["discount_tax_amount"] ?? "",
      _payment_method: order["payment_method"] ?? "",
      _payment_method_title: order["payment_method_title"] ?? "",
      _transaction_id: order["transaction_id"] ?? "",
      _customer_ip_address: order["ip_address"] ?? "",
      billing_first_name: billing?.first_name ?? "", billing_last_name: billing?.last_name ?? "", billing_company: billing?.company ?? "",
      billing_address_1: billing?.address_1 ?? "", billing_address_2: billing?.address_2 ?? "",
      billing_city: billing?.city ?? "", billing_state: billing?.state ?? "", billing_postcode: billing?.postcode ?? "",
      billing_country: billing?.country ?? "", billing_phone: billing?.phone ?? "",
      // wp_wc_orders.billing_email is always present as its own column
      // (used for the order regardless of whether an address row exists);
      // the address row's own email (when present) is only ever a fallback.
      billing_email: order["billing_email"] ?? billing?.email ?? "",
      shipping_first_name: shipping?.first_name ?? "", shipping_last_name: shipping?.last_name ?? "", shipping_company: shipping?.company ?? "",
      shipping_address_1: shipping?.address_1 ?? "", shipping_address_2: shipping?.address_2 ?? "",
      shipping_city: shipping?.city ?? "", shipping_state: shipping?.state ?? "", shipping_postcode: shipping?.postcode ?? "",
      shipping_country: shipping?.country ?? "", shipping_phone: shipping?.phone ?? "",
    };

    orders.set(id, {
      id,
      postType: "shop_order",
      postParent: "0",
      postDate: order["date_created_gmt"] ?? "",
      postModified: order["date_updated_gmt"] ?? "",
      postStatus: order["status"] ?? "",
      postTitle: "",
      postExcerpt: order["customer_note"] ?? "",
      meta,
    });
  }
  return orders;
}

export interface RawOrderItem {
  itemId: string;
  type: string;
  name: string;
  productId: string;
  variationId: string;
  sku: string;
  qty: string;
  subtotal: string;
  total: string;
  tax: string;
  attributes: Record<string, string>;
}

/**
 * Pass 2 of 2: wp_woocommerce_order_items + wp_woocommerce_order_itemmeta,
 * same single-scan-for-both-tables approach. Every non-internal itemmeta key
 * on a `line_item` becomes a variation attribute (the standard WooCommerce
 * convention: internal bookkeeping keys are underscore-prefixed, a visible
 * attribute selection is not) — this is what lets a variable product's
 * chosen Size/Color (or any custom attribute) survive even when SKU-based
 * reconnection fails. Unaffected by the legacy-vs-HPOS order-storage split
 * above — WooCommerce keeps order line items in these same two tables
 * either way, regardless of where the parent order itself is stored.
 */
async function collectOrderItems(
  filePath: string,
  productSkuById: Map<string, string>
): Promise<Map<string, RawOrderItem[]>> {
  const itemsById = new Map<string, { orderId: string; type: string; name: string }>();
  const metaByItemId = new Map<string, Record<string, string>>();

  for await (const row of streamSqlTables(filePath, ["wp_woocommerce_order_items", "wp_woocommerce_order_itemmeta"])) {
    if (row.table === "wp_woocommerce_order_items") {
      const itemId = row.values["order_item_id"];
      const orderId = row.values["order_id"];
      if (!itemId || !orderId) continue;
      itemsById.set(itemId, {
        orderId,
        type: row.values["order_item_type"] ?? "",
        name: row.values["order_item_name"] ?? "",
      });
      continue;
    }

    if (row.table === "wp_woocommerce_order_itemmeta") {
      const itemId = row.values["order_item_id"];
      const key = row.values["meta_key"];
      const value = row.values["meta_value"] ?? "";
      if (!itemId || !key) continue;
      const bag = metaByItemId.get(itemId) ?? {};
      bag[key] = value;
      metaByItemId.set(itemId, bag);
    }
  }

  const itemsByOrderId = new Map<string, RawOrderItem[]>();
  for (const [itemId, item] of itemsById) {
    const meta = metaByItemId.get(itemId) ?? {};
    const productId = meta["_product_id"] ?? "";
    const variationId = meta["_variation_id"] ?? "";

    // A variation's own SKU wins when present (the common case); falling
    // back to the parent product's SKU only happens downstream (mapping
    // layer), never here — this stays a faithful transcription of the file.
    const sku = (variationId && productSkuById.get(variationId)) || (productId && productSkuById.get(productId)) || "";

    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (!ORDER_ITEM_INTERNAL_META_KEYS.has(key) && !key.startsWith("_")) attributes[key] = value;
    }

    const list = itemsByOrderId.get(item.orderId) ?? [];
    list.push({
      itemId,
      type: item.type,
      name: item.name,
      productId,
      variationId,
      sku,
      qty: meta["_qty"] ?? "",
      subtotal: meta["_line_subtotal"] ?? "",
      total: meta["_line_total"] ?? "",
      tax: meta["_line_total_tax"] ?? meta["_line_subtotal_tax"] ?? "",
      attributes,
    });
    itemsByOrderId.set(item.orderId, list);
  }

  return itemsByOrderId;
}

export async function* streamOrderRows(filePath: string): AsyncGenerator<Record<string, string>> {
  const { orders: legacyOrders, productSkuById, adminNotesByOrderId } = await collectPostsAndMeta(filePath);
  const hposOrders = await collectHposOrders(filePath);
  // Auto-detected merge of both storage models: a store using only one has
  // an empty Map for the other (streamSqlTables simply yields nothing for
  // tables that aren't in the file), so this is a no-op there. A store with
  // orders in both (a partial/in-progress HPOS migration) has HPOS win per
  // order ID — later entries in a Map spread overwrite earlier ones for the
  // same key — matching "prefer HPOS values where both exist."
  const orders = new Map([...legacyOrders, ...hposOrders]);
  const itemsByOrderId = await collectOrderItems(filePath, productSkuById);

  for (const [orderId, order] of orders) {
    const items = itemsByOrderId.get(orderId) ?? [];
    const lineItems = items.filter((i) => i.type === "line_item");
    const couponItems = items.filter((i) => i.type === "coupon");
    const notes = adminNotesByOrderId.get(orderId) ?? [];

    yield {
      ID: orderId,
      order_number: order.meta._order_number || orderId,
      order_key: order.meta._order_key ?? "",
      status: order.postStatus,
      created_date: order.postDate,
      modified_date: order.postModified,
      customer_note: order.postExcerpt,
      customer_id: order.meta._customer_user ?? "",
      currency: order.meta._order_currency ?? "",
      order_total: order.meta._order_total ?? "",
      order_tax: order.meta._order_tax ?? "",
      order_shipping: order.meta._order_shipping ?? "",
      order_shipping_tax: order.meta._order_shipping_tax ?? "",
      cart_discount: order.meta._cart_discount ?? "",
      cart_discount_tax: order.meta._cart_discount_tax ?? "",
      payment_method: order.meta._payment_method ?? "",
      payment_method_title: order.meta._payment_method_title ?? "",
      transaction_id: order.meta._transaction_id ?? "",
      customer_ip_address: order.meta._customer_ip_address ?? "",
      billing_first_name: order.meta.billing_first_name ?? "",
      billing_last_name: order.meta.billing_last_name ?? "",
      billing_company: order.meta.billing_company ?? "",
      billing_address_1: order.meta.billing_address_1 ?? "",
      billing_address_2: order.meta.billing_address_2 ?? "",
      billing_city: order.meta.billing_city ?? "",
      billing_state: order.meta.billing_state ?? "",
      billing_postcode: order.meta.billing_postcode ?? "",
      billing_country: order.meta.billing_country ?? "",
      billing_phone: order.meta.billing_phone ?? "",
      billing_email: order.meta.billing_email ?? "",
      shipping_first_name: order.meta.shipping_first_name ?? "",
      shipping_last_name: order.meta.shipping_last_name ?? "",
      shipping_company: order.meta.shipping_company ?? "",
      shipping_address_1: order.meta.shipping_address_1 ?? "",
      shipping_address_2: order.meta.shipping_address_2 ?? "",
      shipping_city: order.meta.shipping_city ?? "",
      shipping_state: order.meta.shipping_state ?? "",
      shipping_postcode: order.meta.shipping_postcode ?? "",
      shipping_country: order.meta.shipping_country ?? "",
      shipping_phone: order.meta.shipping_phone ?? "",
      line_items_json: JSON.stringify(lineItems),
      coupon_codes_json: JSON.stringify(couponItems.map((c) => c.name).filter(Boolean)),
      admin_notes_json: JSON.stringify(notes),
    };
  }
}
