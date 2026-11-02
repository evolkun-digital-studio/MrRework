import { UserModel } from "@/models/User";
import {
  TARGET_FIELDS,
  buildCustomerDoc,
  isProtectedAccount,
  isValidEmail,
  mapRow,
  type WooMappedCustomer,
} from "./wooCustomerMapping";
import { streamCustomerRows } from "./wooCustomerSqlSource";
import type { ImporterModule, ImportRunContext, RowResult, ValidationIssue } from "../types";

// The customer counterpart of products/wooProductImporter.ts — same
// contract, same engine, same wizard. The only thing genuinely new here is
// the source format: streamRows is wired to the SQL merge (wooCustomerSqlSource.ts)
// instead of the generic CSV streamer, so everything from mapRow down is
// unaware the file was ever SQL. Reuses ctx.seenSkus as "emails already seen
// in this file" — the engine only ever treats it as an opaque per-run Set,
// so no change to ImportRunContext was needed.

export { TARGET_FIELDS, buildCustomerDoc, mapRow };
export type { WooMappedCustomer } from "./wooCustomerMapping";

function validateRow(mapped: WooMappedCustomer, rowIndex: number, ctx: ImportRunContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!mapped.email) {
    issues.push({ row: rowIndex, field: "email", message: "Missing email address.", level: "error" });
  } else if (!isValidEmail(mapped.email)) {
    issues.push({ row: rowIndex, field: "email", message: `"${mapped.email}" does not look like a valid email address.`, level: "error" });
  } else {
    const emailKey = mapped.email.toLowerCase();
    if (ctx.seenSkus.has(emailKey)) {
      issues.push({ row: rowIndex, field: "email", message: `Duplicate email "${mapped.email}" within this file — the later row will update what the earlier row created.`, level: "warning" });
    }
    ctx.seenSkus.add(emailKey);
  }

  if (!mapped.firstName && !mapped.lastName && !mapped.displayName && !mapped.username) {
    issues.push({ row: rowIndex, field: "displayName", message: "No name of any kind (first/last/display/username) — this customer will show up unnamed.", level: "warning" });
  }
  if (mapped.registeredDate && Number.isNaN(new Date(mapped.registeredDate).getTime())) {
    issues.push({ row: rowIndex, field: "registeredDate", message: `Registration date "${mapped.registeredDate}" could not be parsed — it will be left unset.`, level: "warning" });
  }
  if (mapped.billingCountry && mapped.billingCountry.length > 2 && !/^[A-Za-z]{2}$/.test(mapped.billingCountry)) {
    // Not an error — plenty of real exports use full country names — just a heads-up since the storefront's address forms expect an ISO code.
    issues.push({ row: rowIndex, field: "billingCountry", message: `Billing country "${mapped.billingCountry}" doesn't look like a 2-letter ISO code.`, level: "warning" });
  }

  return issues;
}


async function importRow(mapped: WooMappedCustomer, _rowIndex: number, ctx: ImportRunContext): Promise<RowResult> {
  const { doc, billingAddress, shippingAddress } = buildCustomerDoc(mapped);
  const email = doc.email as string;

  // User.email has no schema-level `required` (guest accounts, keyed by
  // sessionId instead, legitimately have none) — so nothing downstream
  // would otherwise stop a blank-email row from silently creating a
  // ghost customer account with no way to ever sign into or find it again.
  // validateRow already flags this as an error; this is the actual guard
  // that keeps the write from happening at all.
  if (!email) {
    return { outcome: "failed", message: "Missing email address — cannot import a customer without one." };
  }

  const existing = await UserModel.findOne({ email });

  if (existing) {
    ctx.skuToId.set(email, String(existing._id));
    if (ctx.duplicateStrategy === "skip") {
      return { outcome: "skipped", message: `Customer with email "${email}" already exists.` };
    }

    const protectedAccount = isProtectedAccount(existing);
    const previousValues: Record<string, unknown> = {};
    const patch: Record<string, unknown> = { ...doc };
    if (protectedAccount) {
      // Profile/address fields only — never role, wooRole, status,
      // passwordNeedsReset, sourceSystem/sourceId on a real account.
      delete patch.role;
      delete patch.wooRole;
      delete patch.status;
      delete patch.passwordNeedsReset;
      delete patch.sourceSystem;
      delete patch.sourceId;
    }
    for (const key of Object.keys(patch)) previousValues[key] = (existing as any).get?.(key) ?? (existing as any)[key];

    Object.assign(existing, patch);
    if (billingAddress) {
      const addresses = (existing.addresses ?? []).filter((a: any) => !a.isDefaultBilling);
      addresses.push(billingAddress);
      existing.addresses = addresses;
    }
    if (shippingAddress) {
      const addresses = (existing.addresses ?? []).filter((a: any) => !a.isDefaultShipping);
      addresses.push(shippingAddress);
      existing.addresses = addresses;
    }
    await existing.save();
    return {
      outcome: "updated",
      message: protectedAccount ? `Updated profile fields only — "${email}" is an existing admin/password-holding account, left untouched otherwise.` : undefined,
      snapshot: { identifier: email, documentId: String(existing._id), previousValues },
    };
  }

  const addresses = [billingAddress, shippingAddress].filter((a): a is Record<string, unknown> => a !== null);
  const created = await UserModel.create({ ...doc, addresses });
  ctx.skuToId.set(email, String(created._id));
  return { outcome: "imported" };
}

export const wooCustomerImporter: ImporterModule<WooMappedCustomer> = {
  key: "customers",
  label: "Customers",
  description: "Import customer accounts from a WordPress/WooCommerce SQL export (wp_users + wp_usermeta).",
  icon: "Users",
  status: "available",
  acceptedExtensions: [".sql"],
  identifierField: "email",
  targetFields: TARGET_FIELDS,
  streamRows: streamCustomerRows,
  mapRow,
  validateRow,
  importRow,
};
