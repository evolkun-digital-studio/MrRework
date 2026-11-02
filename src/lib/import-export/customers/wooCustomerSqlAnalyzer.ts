import { UserModel } from "@/models/User";
import { streamSqlTables } from "../sqlParser";
import { streamCustomerRows } from "./wooCustomerSqlSource";
import { mapRow, isValidEmail, resolveWooRole, TARGET_FIELDS } from "./wooCustomerMapping";

// A read-only "dry run" for a WordPress/WooCommerce SQL export — the
// customer counterpart of products/wooCsvAnalyzer.ts. Same guarantee: every
// Mongo call here is .find()/.lean(), never .create()/.save()/.updateOne();
// nothing is ever persisted from this module.

export interface CustomerAnalysisIssue { row: number; email: string; message: string; level: "error" | "warning" }

export interface CustomerAnalysisReport {
  fileName: string;
  totalRows: number;
  analyzedAt: string;

  general: {
    totalCustomers: number;
    withEmail: number;
    withoutEmail: number;
    withBillingAddress: number;
    withShippingAddress: number;
    subscribedToNewsletter: number;
    roleDistribution: { role: string; count: number }[];
  };

  quality: {
    missingEmail: number;
    invalidEmail: number;
    duplicateEmailsInFile: number;
    missingName: number;
    unparseableRegisteredDate: number;
    issues: CustomerAnalysisIssue[];
    issuesTruncated: boolean;
  };

  // Every usermeta key actually present in the file, classified — mirrors
  // the product analyzer's "Unsupported Fields" guarantee that nothing is
  // silently invisible to the admin, even though it isn't imported.
  metaKeyCoverage: { key: string; userCount: number; imported: boolean }[];

  databaseImpact: {
    customersToCreate: number;
    customersToUpdate: number;
    /** Existing accounts this run would touch that are admins or already have a password — see wooCustomerImporter.ts's isProtectedAccount. */
    protectedAccountsMatched: number;
  };

  summary: { score: number; label: "Ready to Import" | "Needs Review" | "High Risk" };
}

const ISSUE_CAP = 300;
const META_KEY_CAP = 100;

const IMPORTED_META_KEYS = new Set(TARGET_FIELDS.flatMap((f) => f.aliases));
IMPORTED_META_KEYS.add("wp_capabilities");
const NEWSLETTER_KEY_PATTERN = /newsletter|subscri(be|ption|bed)/i;

export async function analyzeWooCustomerSql(filePath: string, fileName: string): Promise<CustomerAnalysisReport> {
  // Independent pass over wp_usermeta purely for coverage reporting — the
  // real import path (wooCustomerSqlSource.ts) only ever keeps the keys it
  // recognizes, so this is the only place every key that was actually in
  // the file gets counted, imported or not.
  const metaKeyUsers = new Map<string, Set<string>>();
  for await (const row of streamSqlTables(filePath, ["wp_usermeta"])) {
    const key = row.values.meta_key;
    const userId = row.values.user_id;
    if (!key || !userId) continue;
    const users = metaKeyUsers.get(key) ?? new Set<string>();
    users.add(userId);
    metaKeyUsers.set(key, users);
  }
  const metaKeyCoverage = [...metaKeyUsers.entries()]
    .map(([key, users]) => ({ key, userCount: users.size, imported: IMPORTED_META_KEYS.has(key) || NEWSLETTER_KEY_PATTERN.test(key) }))
    .sort((a, b) => b.userCount - a.userCount)
    .slice(0, META_KEY_CAP);

  const mapping: Record<string, string> = {};
  for (const f of TARGET_FIELDS) mapping[f.aliases[0]] = f.key;

  let totalCustomers = 0;
  let withEmail = 0, withoutEmail = 0, withBillingAddress = 0, withShippingAddress = 0, subscribedToNewsletter = 0;
  const roleCounts = new Map<string, number>();

  let missingEmail = 0, invalidEmail = 0, missingName = 0, unparseableRegisteredDate = 0;
  const seenEmails = new Set<string>();
  let duplicateEmailsInFile = 0;
  const issues: CustomerAnalysisIssue[] = [];
  const addIssue = (row: number, email: string, message: string, level: "error" | "warning") => {
    if (issues.length < ISSUE_CAP) issues.push({ row, email, message, level });
  };

  const fileEmails: string[] = [];

  for await (const raw of streamCustomerRows(filePath)) {
    totalCustomers++;
    const mapped = mapRow(raw, mapping);
    const rowLabel = mapped.email || `row ${totalCustomers}`;

    if (!mapped.email) { withoutEmail++; missingEmail++; addIssue(totalCustomers, rowLabel, "Missing email address.", "error"); }
    else {
      withEmail++;
      if (!isValidEmail(mapped.email)) { invalidEmail++; addIssue(totalCustomers, rowLabel, `"${mapped.email}" does not look like a valid email.`, "error"); }
      const key = mapped.email.toLowerCase();
      if (seenEmails.has(key)) { duplicateEmailsInFile++; addIssue(totalCustomers, rowLabel, `Duplicate email "${mapped.email}" within this file.`, "warning"); }
      seenEmails.add(key);
      fileEmails.push(mapped.email);
    }

    if (!mapped.firstName && !mapped.lastName && !mapped.displayName && !mapped.username) {
      missingName++;
      addIssue(totalCustomers, rowLabel, "No name of any kind found.", "warning");
    }
    if (mapped.registeredDate && Number.isNaN(new Date(mapped.registeredDate).getTime())) {
      unparseableRegisteredDate++;
      addIssue(totalCustomers, rowLabel, `Registration date "${mapped.registeredDate}" could not be parsed.`, "warning");
    }
    if (mapped.billingAddress1 || mapped.billingCity || mapped.billingCountry) withBillingAddress++;
    if (mapped.shippingAddress1 || mapped.shippingCity || mapped.shippingCountry) withShippingAddress++;
    if (/^(1|yes|true|subscribed)$/i.test(mapped.newsletter)) subscribedToNewsletter++;

    const role = resolveWooRole(mapped.role);
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
  }

  // Read-only DB lookups — never write. Matched by the exact same key the
  // real importer uses (email, case-insensitive).
  const existing = fileEmails.length
    ? await UserModel.find({ email: { $in: fileEmails.map((e) => e.toLowerCase()) } })
        .select("email role passwordHash")
        .lean<{ email: string; role: string; passwordHash?: string }[]>()
    : [];
  const existingByEmail = new Map(existing.map((u) => [u.email.toLowerCase(), u]));
  let customersToUpdate = 0, protectedAccountsMatched = 0;
  for (const email of new Set(fileEmails.map((e) => e.toLowerCase()))) {
    const match = existingByEmail.get(email);
    if (match) {
      customersToUpdate++;
      if (match.role !== "customer" || match.passwordHash) protectedAccountsMatched++;
    }
  }
  const customersToCreate = seenEmails.size - customersToUpdate;

  // Readiness score — same rubric spirit as the product analyzer: heavier
  // deductions for blocking issues (missing/invalid email — a customer that
  // simply can't be imported) than soft-quality ones (missing name).
  let score = 100;
  score -= Math.min(50, missingEmail * 2 + invalidEmail * 2);
  score -= Math.min(20, duplicateEmailsInFile);
  score -= Math.min(15, missingName * 0.5);
  score -= Math.min(10, unparseableRegisteredDate * 0.5);
  score = Math.max(0, Math.round(score));
  const label = score >= 90 ? "Ready to Import" : score >= 70 ? "Needs Review" : "High Risk";

  return {
    fileName,
    totalRows: totalCustomers,
    analyzedAt: new Date().toISOString(),
    general: {
      totalCustomers, withEmail, withoutEmail, withBillingAddress, withShippingAddress, subscribedToNewsletter,
      roleDistribution: [...roleCounts.entries()].map(([role, count]) => ({ role, count })).sort((a, b) => b.count - a.count),
    },
    quality: {
      missingEmail, invalidEmail, duplicateEmailsInFile, missingName, unparseableRegisteredDate,
      issues: issues.slice(0, ISSUE_CAP), issuesTruncated: issues.length >= ISSUE_CAP,
    },
    metaKeyCoverage,
    databaseImpact: { customersToCreate, customersToUpdate, protectedAccountsMatched },
    summary: { score, label },
  };
}
