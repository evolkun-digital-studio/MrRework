import { streamSqlTables } from "../sqlParser";

// Turns a WordPress SQL dump's wp_users + wp_usermeta tables into a stream
// of flat, CSV-shaped rows — one per customer — so everything downstream
// (mapRow, the column-mapping UI, validateRow, importRow, the generic
// engine) is completely unaware the source was ever SQL. Registered as this
// importer's `streamRows` (see wooCustomerImporter.ts) in place of the
// default CSV streamer.
//
// No `server-only` guard, same reasoning as sqlParser.ts: this is reused
// as-is by the standalone repair script (scripts/migrateWooCustomers.ts).

const RELEVANT_META_KEYS = [
  "first_name", "last_name", "nickname",
  "billing_first_name", "billing_last_name", "billing_company", "billing_address_1", "billing_address_2",
  "billing_city", "billing_state", "billing_postcode", "billing_country", "billing_phone", "billing_email",
  "shipping_first_name", "shipping_last_name", "shipping_company", "shipping_address_1", "shipping_address_2",
  "shipping_city", "shipping_state", "shipping_postcode", "shipping_country", "shipping_phone",
  "wp_capabilities", "locale",
] as const;

// No WordPress core field marks a "subscribe to our newsletter" opt-in —
// it's always a plugin's own meta key (Mailchimp for WooCommerce, Newsletter,
// Mailpoet, etc.), and there's no single standard one. Best-effort: any meta
// key that looks like a subscription flag, with a truthy value, counts.
const NEWSLETTER_KEY_PATTERN = /newsletter|subscri(be|ption|bed)/i;
const TRUTHY_VALUE = /^(1|yes|true|subscribed)$/i;

/**
 * Pass 1 of 2 (each a full, independent streamSqlTables pass — see
 * sqlParser.ts's own memory-bound tradeoffs): collects every usermeta row
 * grouped by user_id, keeping only the keys this importer actually maps —
 * a WooCommerce store can have hundreds of thousands of usermeta rows for
 * plugin data (cart sessions, order caches, etc.) that have nothing to do
 * with a customer profile, so this is the only place that scan happens.
 */
async function collectRelevantMeta(filePath: string): Promise<{ metaByUser: Map<string, Record<string, string>>; newsletterByUser: Set<string> }> {
  const relevant = new Set<string>(RELEVANT_META_KEYS);
  const metaByUser = new Map<string, Record<string, string>>();
  const newsletterByUser = new Set<string>();

  for await (const row of streamSqlTables(filePath, ["wp_usermeta"])) {
    const userId = row.values["user_id"];
    const key = row.values["meta_key"];
    const value = row.values["meta_value"] ?? "";
    if (!userId || !key) continue; // orphaned/malformed meta row — nothing to attach it to

    if (relevant.has(key)) {
      const bag = metaByUser.get(userId) ?? {};
      bag[key] = value;
      metaByUser.set(userId, bag);
    }
    if (NEWSLETTER_KEY_PATTERN.test(key) && TRUTHY_VALUE.test(value.trim())) {
      newsletterByUser.add(userId);
    }
  }

  return { metaByUser, newsletterByUser };
}

export async function* streamCustomerRows(filePath: string): AsyncGenerator<Record<string, string>> {
  const { metaByUser, newsletterByUser } = await collectRelevantMeta(filePath);

  for await (const row of streamSqlTables(filePath, ["wp_users"])) {
    const id = row.values["ID"];
    if (!id) continue;
    const meta = metaByUser.get(id) ?? {};

    yield {
      ID: id,
      user_login: row.values["user_login"] ?? "",
      user_email: row.values["user_email"] ?? "",
      display_name: row.values["display_name"] ?? "",
      user_registered: row.values["user_registered"] ?? "",
      user_status: row.values["user_status"] ?? "0",
      first_name: meta.first_name ?? "",
      last_name: meta.last_name ?? "",
      billing_first_name: meta.billing_first_name ?? "",
      billing_last_name: meta.billing_last_name ?? "",
      billing_company: meta.billing_company ?? "",
      billing_address_1: meta.billing_address_1 ?? "",
      billing_address_2: meta.billing_address_2 ?? "",
      billing_city: meta.billing_city ?? "",
      billing_state: meta.billing_state ?? "",
      billing_postcode: meta.billing_postcode ?? "",
      billing_country: meta.billing_country ?? "",
      billing_phone: meta.billing_phone ?? "",
      billing_email: meta.billing_email ?? "",
      shipping_first_name: meta.shipping_first_name ?? "",
      shipping_last_name: meta.shipping_last_name ?? "",
      shipping_company: meta.shipping_company ?? "",
      shipping_address_1: meta.shipping_address_1 ?? "",
      shipping_address_2: meta.shipping_address_2 ?? "",
      shipping_city: meta.shipping_city ?? "",
      shipping_state: meta.shipping_state ?? "",
      shipping_postcode: meta.shipping_postcode ?? "",
      shipping_country: meta.shipping_country ?? "",
      shipping_phone: meta.shipping_phone ?? "",
      role: meta.wp_capabilities ?? "",
      locale: meta.locale ?? "",
      newsletter: newsletterByUser.has(id) ? "1" : "0",
      account_status: row.values["user_status"] ?? "0",
    };
  }
}
