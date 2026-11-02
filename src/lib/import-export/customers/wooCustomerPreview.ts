import { dbConnect } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { streamCustomerRows } from "./wooCustomerSqlSource";
import { buildCustomerDoc, isProtectedAccount, isValidEmail, mapRow, resolveWooRole } from "./wooCustomerMapping";

// The customer counterpart of products/migrationAssistant.ts's
// previewProduct() — "source row -> mapped fields -> the exact document a
// real import would create," entirely read-only. Built for the Customer
// Migration Assistant page: unlike previewProduct() (one record, searched
// by SKU), this returns every customer in the file at once (capped), since
// the Assistant's Customer Preview and Duplicate Resolution sections need
// to browse and cross-reference the whole set, not look up one at a time.
// Calls the exact same mapRow()/buildCustomerDoc() the live importer uses —
// no re-implementation of any mapping or merge logic.

const PREVIEW_CAP = 300;

export interface CustomerPreviewAddress {
  firstName: string; lastName: string; company: string; phone: string;
  address: string; apartment: string; city: string; state: string; postalCode: string; country: string;
}

export interface CustomerPreviewSide {
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: string;
  wooRole: string;
  registeredAt: string | null;
  newsletter: boolean;
  passwordNeedsReset: boolean;
  sourceSystem: string;
  billingAddress: CustomerPreviewAddress | null;
  shippingAddress: CustomerPreviewAddress | null;
}

export interface CustomerPreviewRow {
  row: number;
  email: string;
  isDuplicateInFile: boolean;
  existsInDb: boolean;
  isProtected: boolean;
  before: CustomerPreviewSide | null;
  after: CustomerPreviewSide;
  warnings: string[];
}

export interface CustomerPreviewResult {
  rows: CustomerPreviewRow[];
  totalRows: number;
  truncated: boolean;
}

// A permissive but real check — international numbers vary too much for a
// strict format, but this catches the two most common junk cases: too few
// digits to be a real phone number, or letters mixed into what's supposed
// to be one.
function isPlausiblePhone(phone: string): boolean {
  if (!phone) return true; // absent is not "invalid" — that's the separate "missing" case
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) return false;
  return /^[\d\s()+.\-]+$/.test(phone);
}

function toAddress(addr: Record<string, unknown> | null): CustomerPreviewAddress | null {
  if (!addr) return null;
  return {
    firstName: String(addr.firstName ?? ""), lastName: String(addr.lastName ?? ""), company: String(addr.company ?? ""),
    phone: String(addr.phone ?? ""), address: String(addr.address ?? ""), apartment: String(addr.apartment ?? ""),
    city: String(addr.city ?? ""), state: String(addr.state ?? ""), postalCode: String(addr.postalCode ?? ""), country: String(addr.country ?? ""),
  };
}

function existingToSide(existing: any): CustomerPreviewSide {
  const billing = (existing.addresses ?? []).find((a: any) => a.isDefaultBilling);
  const shipping = (existing.addresses ?? []).find((a: any) => a.isDefaultShipping);
  return {
    email: existing.email ?? "",
    firstName: existing.firstName ?? "",
    lastName: existing.lastName ?? "",
    displayName: existing.displayName ?? "",
    role: existing.role ?? "customer",
    wooRole: existing.wooRole ?? "",
    registeredAt: existing.registeredAt ? new Date(existing.registeredAt).toISOString() : null,
    newsletter: !!existing.notificationSettings?.newsletter,
    passwordNeedsReset: !!existing.passwordNeedsReset,
    sourceSystem: existing.sourceSystem ?? "",
    billingAddress: toAddress(billing?.toObject?.() ?? billing ?? null),
    shippingAddress: toAddress(shipping?.toObject?.() ?? shipping ?? null),
  };
}

export async function previewCustomers(filePath: string, columnMapping: Record<string, string>): Promise<CustomerPreviewResult> {
  await dbConnect();

  const mapped_rows: { rowIndex: number; mapped: ReturnType<typeof mapRow> }[] = [];
  let totalRows = 0;
  const seenEmails = new Set<string>();
  const emailsToLookUp = new Set<string>();

  for await (const raw of streamCustomerRows(filePath)) {
    totalRows++;
    if (mapped_rows.length >= PREVIEW_CAP) continue; // still counted in totalRows/truncated, just not built into a full preview
    const mapped = mapRow(raw, columnMapping);
    mapped_rows.push({ rowIndex: totalRows, mapped });
    if (mapped.email) emailsToLookUp.add(mapped.email);
  }

  // One batch read, not one query per row.
  const existingUsers = emailsToLookUp.size
    ? await UserModel.find({ email: { $in: [...emailsToLookUp] } }).lean<any[]>()
    : [];
  const existingByEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u]));

  const rows: CustomerPreviewRow[] = mapped_rows.map(({ rowIndex, mapped }) => {
    const warnings: string[] = [];
    const emailKey = mapped.email.toLowerCase();

    if (!mapped.email) warnings.push("Missing email address — this row cannot be imported.");
    else if (!isValidEmail(mapped.email)) warnings.push(`"${mapped.email}" does not look like a valid email address.`);

    const isDuplicateInFile = !!mapped.email && seenEmails.has(emailKey);
    if (mapped.email) seenEmails.add(emailKey);
    if (isDuplicateInFile) warnings.push(`Duplicate email within this file — a later row will overwrite this one.`);

    if (mapped.billingPhone && !isPlausiblePhone(mapped.billingPhone)) warnings.push(`Billing phone "${mapped.billingPhone}" doesn't look valid.`);
    if (mapped.shippingPhone && !isPlausiblePhone(mapped.shippingPhone)) warnings.push(`Shipping phone "${mapped.shippingPhone}" doesn't look valid.`);

    const hasBilling = !!(mapped.billingAddress1 || mapped.billingCity || mapped.billingCountry);
    const hasShipping = !!(mapped.shippingAddress1 || mapped.shippingCity || mapped.shippingCountry);
    if (!hasBilling) warnings.push("No billing address.");
    if (!hasShipping) warnings.push("No shipping address.");

    const wooRole = resolveWooRole(mapped.role);
    if (!mapped.role.trim()) warnings.push("Unknown role — no wp_capabilities data found; will still import as a customer.");

    const existing = existingByEmail.get(emailKey);
    const { doc, billingAddress, shippingAddress } = buildCustomerDoc(mapped);
    const protectedAccount = isProtectedAccount(existing);
    if (protectedAccount) warnings.push("Matches an existing admin or password-holding account — only profile/address fields will be updated.");

    const after: CustomerPreviewSide = {
      email: String(doc.email ?? ""),
      firstName: String(doc.firstName ?? ""),
      lastName: String(doc.lastName ?? ""),
      displayName: String(doc.displayName ?? ""),
      role: protectedAccount ? (existing?.role ?? "customer") : String(doc.role ?? "customer"),
      wooRole: protectedAccount ? (existing?.wooRole ?? "") : wooRole,
      registeredAt: doc.registeredAt instanceof Date ? doc.registeredAt.toISOString() : null,
      newsletter: !!doc["notificationSettings.newsletter"],
      passwordNeedsReset: protectedAccount ? !!existing?.passwordNeedsReset : true,
      sourceSystem: protectedAccount ? (existing?.sourceSystem ?? "") : "woocommerce",
      billingAddress: toAddress(billingAddress),
      shippingAddress: toAddress(shippingAddress),
    };

    return {
      row: rowIndex,
      email: mapped.email,
      isDuplicateInFile,
      existsInDb: !!existing,
      isProtected: protectedAccount,
      before: existing ? existingToSide(existing) : null,
      after,
      warnings,
    };
  });

  return { rows, totalRows, truncated: totalRows > PREVIEW_CAP };
}
