import { applyMapping } from "../mapping";
import type { TargetField } from "../types";

// Pure customer field mapping/normalization — no database access, no file
// I/O. Mirrors products/wooProductMapping.ts's split: the SQL parsing and
// wp_users/wp_usermeta merge (sqlSource.ts, in this same folder) produces a
// flat "virtual CSV row" per customer using WordPress's own familiar column
// and meta-key names; everything from here on is format-agnostic and would
// work identically fed by a real CSV export using the same column names.

export const TARGET_FIELDS: TargetField[] = [
  { key: "email", label: "Email", required: true, aliases: ["user_email", "email", "e-mail"] },
  { key: "username", label: "Username", aliases: ["user_login", "username", "login"] },
  { key: "displayName", label: "Display Name", aliases: ["display_name", "displayname", "name"] },
  { key: "firstName", label: "First Name", aliases: ["first_name", "firstname"] },
  { key: "lastName", label: "Last Name", aliases: ["last_name", "lastname"] },
  { key: "registeredDate", label: "Registration Date", aliases: ["user_registered", "registered", "registration date", "date registered"] },

  { key: "billingFirstName", label: "Billing First Name", aliases: ["billing_first_name"] },
  { key: "billingLastName", label: "Billing Last Name", aliases: ["billing_last_name"] },
  { key: "billingCompany", label: "Billing Company", aliases: ["billing_company", "company"] },
  { key: "billingAddress1", label: "Billing Address 1", aliases: ["billing_address_1", "billing address"] },
  { key: "billingAddress2", label: "Billing Address 2", aliases: ["billing_address_2"] },
  { key: "billingCity", label: "Billing City", aliases: ["billing_city"] },
  { key: "billingState", label: "Billing State", aliases: ["billing_state"] },
  { key: "billingPostcode", label: "Billing Postcode", aliases: ["billing_postcode", "billing_zip"] },
  { key: "billingCountry", label: "Billing Country", aliases: ["billing_country"] },
  { key: "billingPhone", label: "Billing Phone", aliases: ["billing_phone", "phone"] },
  { key: "billingEmail", label: "Billing Email", aliases: ["billing_email"], description: "Falls back to Email when blank — only relevant if it genuinely differs." },

  { key: "shippingFirstName", label: "Shipping First Name", aliases: ["shipping_first_name"] },
  { key: "shippingLastName", label: "Shipping Last Name", aliases: ["shipping_last_name"] },
  { key: "shippingCompany", label: "Shipping Company", aliases: ["shipping_company"] },
  { key: "shippingAddress1", label: "Shipping Address 1", aliases: ["shipping_address_1", "shipping address"] },
  { key: "shippingAddress2", label: "Shipping Address 2", aliases: ["shipping_address_2"] },
  { key: "shippingCity", label: "Shipping City", aliases: ["shipping_city"] },
  { key: "shippingState", label: "Shipping State", aliases: ["shipping_state"] },
  { key: "shippingPostcode", label: "Shipping Postcode", aliases: ["shipping_postcode", "shipping_zip"] },
  { key: "shippingCountry", label: "Shipping Country", aliases: ["shipping_country"] },
  { key: "shippingPhone", label: "Shipping Phone", aliases: ["shipping_phone"] },

  { key: "role", label: "Role", aliases: ["role", "wp_capabilities"], description: "Stored as wooRole for reference only — every imported account is a customer, regardless of its original WordPress role (see ADMIN_CMS.md § Customer Migration Security)." },
  { key: "language", label: "Language", aliases: ["locale", "language"] },
  { key: "newsletter", label: "Newsletter Subscribed", aliases: ["newsletter", "newsletter_subscribed"], description: "Best-effort — detected from common newsletter-plugin meta key conventions, not a WordPress core field." },
  { key: "accountStatus", label: "Account Status", aliases: ["account_status", "user_status", "status"] },
];

export interface WooMappedCustomer {
  email: string; username: string; displayName: string; firstName: string; lastName: string; registeredDate: string;
  billingFirstName: string; billingLastName: string; billingCompany: string; billingAddress1: string; billingAddress2: string;
  billingCity: string; billingState: string; billingPostcode: string; billingCountry: string; billingPhone: string; billingEmail: string;
  shippingFirstName: string; shippingLastName: string; shippingCompany: string; shippingAddress1: string; shippingAddress2: string;
  shippingCity: string; shippingState: string; shippingPostcode: string; shippingCountry: string; shippingPhone: string;
  role: string; language: string; newsletter: string; accountStatus: string;
  /** The original WordPress user ID (wp_users.ID) — carried through for traceability, never used as the dedup key (email is). */
  sourceId: string;
}

export function mapRow(raw: Record<string, string>, mapping: Record<string, string>): WooMappedCustomer {
  const m = applyMapping(raw, mapping);
  return {
    email: (m.email ?? "").trim().toLowerCase(),
    username: (m.username ?? "").trim(),
    displayName: (m.displayName ?? "").trim(),
    firstName: (m.firstName ?? "").trim(),
    lastName: (m.lastName ?? "").trim(),
    registeredDate: (m.registeredDate ?? "").trim(),
    billingFirstName: (m.billingFirstName ?? "").trim(),
    billingLastName: (m.billingLastName ?? "").trim(),
    billingCompany: (m.billingCompany ?? "").trim(),
    billingAddress1: (m.billingAddress1 ?? "").trim(),
    billingAddress2: (m.billingAddress2 ?? "").trim(),
    billingCity: (m.billingCity ?? "").trim(),
    billingState: (m.billingState ?? "").trim(),
    billingPostcode: (m.billingPostcode ?? "").trim(),
    billingCountry: (m.billingCountry ?? "").trim(),
    billingPhone: (m.billingPhone ?? "").trim(),
    billingEmail: (m.billingEmail ?? "").trim().toLowerCase(),
    shippingFirstName: (m.shippingFirstName ?? "").trim(),
    shippingLastName: (m.shippingLastName ?? "").trim(),
    shippingCompany: (m.shippingCompany ?? "").trim(),
    shippingAddress1: (m.shippingAddress1 ?? "").trim(),
    shippingAddress2: (m.shippingAddress2 ?? "").trim(),
    shippingCity: (m.shippingCity ?? "").trim(),
    shippingState: (m.shippingState ?? "").trim(),
    shippingPostcode: (m.shippingPostcode ?? "").trim(),
    shippingCountry: (m.shippingCountry ?? "").trim(),
    shippingPhone: (m.shippingPhone ?? "").trim(),
    role: (m.role ?? "").trim(),
    language: (m.language ?? "").trim(),
    newsletter: (m.newsletter ?? "").trim(),
    accountStatus: (m.accountStatus ?? "").trim(),
    sourceId: (raw["ID"] ?? "").trim(),
  };
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function truthy(v: string): boolean {
  const n = v.trim().toLowerCase();
  return n === "1" || n === "yes" || n === "true" || n === "y" || n === "subscribed";
}

export function resolveNewsletter(v: string): boolean {
  return truthy(v);
}

// WordPress core has no account-status enum by default — user_status is a
// legacy field that's effectively always "0" on a modern install. Anything
// else is treated as a signal the account was deliberately deactivated
// (some membership/security plugins repurpose it that way) rather than
// silently defaulting to active regardless of what the source data says.
export function resolveAccountStatus(v: string): "active" | "suspended" {
  const n = v.trim();
  if (!n || n === "0") return "active";
  return "suspended";
}

// Every imported account becomes an app "customer" unconditionally — see
// the wooRole field comment in models/User.ts for why. This only decides
// what gets recorded as the informational wooRole value.
export function resolveWooRole(capabilitiesOrRole: string): string {
  const n = capabilitiesOrRole.trim();
  if (!n) return "customer";
  // Already a plain role name (e.g. passed straight through from a CSV
  // rather than a serialized wp_capabilities blob).
  if (!/^a:\d+:\{/.test(n)) return n;
  const roles = decodeWpCapabilities(n);
  return roles[0] ?? "customer";
}

// Minimal, purpose-built decoder for exactly the shape WordPress writes for
// wp_capabilities — `a:N:{s:L:"role";b:1;...}` — not a general PHP
// unserializer. Returns every role name with a truthy (b:1) value, in the
// order they appear.
export function decodeWpCapabilities(serialized: string): string[] {
  const roles: string[] = [];
  const re = /s:\d+:"([^"]*)";b:1;/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(serialized)) !== null) roles.push(match[1]);
  return roles;
}

// Never touch role/status/passwordNeedsReset/sourceSystem/sourceId on an
// account that's already an admin or already has a working password — see
// models/User.ts's wooRole comment. Shared by the live importer, the repair
// script, and the migration-assistant preview, so this decision can only
// ever be made in one place.
export function isProtectedAccount(existing: { role?: string; passwordHash?: string } | null | undefined): boolean {
  if (!existing) return false;
  return existing.role !== "customer" || !!existing.passwordHash;
}

export interface CustomerBuildResult {
  doc: Record<string, unknown>;
  billingAddress: Record<string, unknown> | null;
  shippingAddress: Record<string, unknown> | null;
}

// The pure part of turning a mapped customer row into a User document — no
// database access, no side effects. Used by the importer, preview, and the
// repair script so they all agree on customer shape.
export function buildCustomerDoc(mapped: WooMappedCustomer): CustomerBuildResult {
  const email = mapped.email || mapped.billingEmail;
  const displayName = mapped.displayName || [mapped.firstName, mapped.lastName].filter(Boolean).join(" ") || mapped.username;

  const registeredAt = mapped.registeredDate ? new Date(mapped.registeredDate) : undefined;

  const billingAddress =
    mapped.billingAddress1 || mapped.billingCity || mapped.billingCountry
      ? {
          firstName: mapped.billingFirstName || mapped.firstName,
          lastName: mapped.billingLastName || mapped.lastName,
          company: mapped.billingCompany,
          phone: mapped.billingPhone,
          address: mapped.billingAddress1,
          apartment: mapped.billingAddress2,
          city: mapped.billingCity,
          state: mapped.billingState,
          postalCode: mapped.billingPostcode,
          country: mapped.billingCountry,
          isDefaultBilling: true,
        }
      : null;

  const shippingAddress =
    mapped.shippingAddress1 || mapped.shippingCity || mapped.shippingCountry
      ? {
          firstName: mapped.shippingFirstName || mapped.firstName,
          lastName: mapped.shippingLastName || mapped.lastName,
          company: mapped.shippingCompany,
          phone: mapped.shippingPhone,
          address: mapped.shippingAddress1,
          apartment: mapped.shippingAddress2,
          city: mapped.shippingCity,
          state: mapped.shippingState,
          postalCode: mapped.shippingPostcode,
          country: mapped.shippingCountry,
          isDefaultShipping: true,
        }
      : null;

  // Keys are only ever added when there's a real value to set — never left
  // in the object as `key: undefined`. That distinction matters a lot here:
  // Object.assign(existingDocument, doc) (importRow's update path, and the
  // repair script) applies an explicit `undefined` as a real overwrite,
  // blanking out whatever the field already held — a manual admin edit, or
  // data a *previous* import run set that this particular source row simply
  // has nothing to say about. Schema defaults (e.g. language: "en") only
  // ever apply at document *creation*, so this omission is also what lets a
  // brand-new customer still pick up those defaults normally.
  const doc: Record<string, unknown> = {
    email,
    status: resolveAccountStatus(mapped.accountStatus),
    role: "customer", // always — see models/User.ts
    wooRole: resolveWooRole(mapped.role),
    sourceSystem: "woocommerce",
    passwordNeedsReset: true,
    "notificationSettings.newsletter": resolveNewsletter(mapped.newsletter),
  };
  if (mapped.username) doc.username = mapped.username;
  if (displayName) doc.displayName = displayName;
  if (mapped.firstName) doc.firstName = mapped.firstName;
  if (mapped.lastName) doc.lastName = mapped.lastName;
  const phone = mapped.billingPhone || mapped.shippingPhone;
  if (phone) doc.phone = phone;
  if (mapped.language) doc.language = mapped.language;
  if (mapped.sourceId) doc.sourceId = mapped.sourceId;
  if (registeredAt && !Number.isNaN(registeredAt.getTime())) doc.registeredAt = registeredAt;

  return { doc, billingAddress, shippingAddress };
}
