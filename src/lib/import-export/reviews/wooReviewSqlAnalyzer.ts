import { UserModel } from "@/models/User";
import { ProductModel } from "@/models/Product";
import { ReviewModel } from "@/models/Review";
import { streamSqlTables } from "../sqlParser";
import { streamReviewRows, collectProductIndex } from "./wooReviewSqlSource";
import {
  TARGET_FIELDS,
  classifyReviewRow,
  isMalformedRating,
  isValidRating,
  mapRow,
  resolveReviewCustomerLink,
  resolveReviewProductLink,
  resolveReviewStatus,
  type ProductLookups,
} from "./wooReviewMapping";

// A read-only "dry run" for a WordPress/WooCommerce review SQL export — the
// review counterpart of orders/wooOrderSqlAnalyzer.ts. Same guarantee: every
// Mongo call here is .find()/.lean(), never .create()/.save()/.updateOne();
// nothing is ever persisted from this module.

export interface ReviewAnalysisIssue { row: number; sourceId: string; message: string; level: "error" | "warning" }

export interface ReviewAnalysisReport {
  fileName: string;
  totalRows: number;
  analyzedAt: string;

  general: {
    totalReviews: number;
    guestReviews: number;
    registeredCustomerReviews: number;
    ratingDistribution: { rating: number; count: number }[];
    approvalBreakdown: { wooStatus: string; status: string; count: number }[];
    verifiedPurchaseCount: number;
    withAdminReply: number;
    timeline: { period: string; count: number }[];
  };

  quality: {
    missingProductReference: number;
    /** Present but malformed (not blank, not 1-5) — genuinely corrupted source data. Distinct from unratedProductComments/spamComments/trashedComments below, which are blank ratings — valid WooCommerce data, not errors. */
    invalidRatings: number;
    /** Blank rating, not spam/trash — WooCommerce comment_type="review" rows are valid without a rating (see wooReviewMapping.ts's classifyReviewRow doc comment). Never imported as a Review, never a validation error. */
    unratedProductComments: number;
    trashedComments: number;
    duplicateReviewIdsInFile: number;
    duplicateReviewerProductCombos: number;
    missingReviewText: number;
    spamComments: number;
    nonProductComments: number;
    brokenProductReferences: number;
    unrecognizedStatus: number;
    issues: ReviewAnalysisIssue[];
    issuesTruncated: boolean;
  };

  unsupportedMetaKeys: { key: string; reviewCount: number }[];

  databaseImpact: {
    reviewsToCreate: number;
    reviewsToUpdate: number;
    protectedReviewsMatched: number;
    matchedCustomers: number;
    missingCustomers: number;
    matchedProducts: number;
    missingProducts: number;
  };

  summary: { score: number; label: "Ready to Import" | "Needs Review" | "High Risk" };
}

const ISSUE_CAP = 300;
const META_KEY_CAP = 100;
const RECOGNIZED_META_KEYS = new Set(["rating", "verified"]);
const RECOGNIZED_META_PATTERNS = [/^(review_title|title)$/i, /edited|modified/i, /helpful/i, /vote_(up|down)/i];

/** Independent pass purely for "unsupported metadata" coverage reporting — scoped to review comment IDs only, never used by the real import path. */
async function collectUnsupportedMetaKeys(filePath: string, reviewIds: Set<string>): Promise<{ key: string; reviewCount: number }[]> {
  const metaKeyReviews = new Map<string, Set<string>>();
  for await (const row of streamSqlTables(filePath, ["wp_commentmeta"])) {
    const commentId = row.values["comment_id"];
    const key = row.values["meta_key"];
    if (!commentId || !key || !reviewIds.has(commentId)) continue;
    if (RECOGNIZED_META_KEYS.has(key) || RECOGNIZED_META_PATTERNS.some((p) => p.test(key))) continue;
    const set = metaKeyReviews.get(key) ?? new Set<string>();
    set.add(commentId);
    metaKeyReviews.set(key, set);
  }
  return [...metaKeyReviews.entries()]
    .map(([key, reviews]) => ({ key, reviewCount: reviews.size }))
    .sort((a, b) => b.reviewCount - a.reviewCount)
    .slice(0, META_KEY_CAP);
}

function periodKey(dateStr: string): string | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function analyzeWooReviewSql(filePath: string, fileName: string): Promise<ReviewAnalysisReport> {
  const mapping: Record<string, string> = {};
  for (const f of TARGET_FIELDS) mapping[f.aliases[0]] = f.key;

  // wp_posts scan, purely to distinguish "no product in this dump matches
  // this ID at all" (brokenProductReferences) from "a product exists in the
  // dump but not yet in MongoDB" (missingProducts, checked below).
  const productIndex = await collectProductIndex(filePath);

  let totalReviews = 0, guestReviews = 0, registeredCustomerReviews = 0, verifiedPurchaseCount = 0, withAdminReply = 0;
  const ratingCounts = new Map<number, number>();
  const approvalCounts = new Map<string, number>();
  const timelineByPeriod = new Map<string, number>();

  let missingProductReference = 0, invalidRatings = 0, unratedProductComments = 0, trashedComments = 0, duplicateReviewIdsInFile = 0, duplicateReviewerProductCombos = 0;
  let missingReviewText = 0, spamComments = 0, nonProductComments = 0, brokenProductReferences = 0, unrecognizedStatus = 0;
  const seenIds = new Set<string>();
  const seenCombos = new Set<string>();
  const reviewIds = new Set<string>();
  const issues: ReviewAnalysisIssue[] = [];
  const addIssue = (row: number, sourceId: string, message: string, level: "error" | "warning") => {
    if (issues.length < ISSUE_CAP) issues.push({ row, sourceId, message, level });
  };

  const fileEmails: string[] = [];
  const fileWpCustomerIds: string[] = [];
  const allSkus = new Set<string>();
  const allSlugs = new Set<string>();
  const allNames = new Set<string>();

  interface PendingReview { sourceId: string; email: string; customerId: string; productSku: string; productSlug: string; productName: string; productSourceId: string }
  const pending: PendingReview[] = [];
  // Excludes rows that classifyReviewRow() says aren't real reviews (no
  // rating) — those never become Review documents, so counting them toward
  // reviewsToCreate/reviewsToUpdate/matchedCustomers/matchedProducts would
  // overstate what the real import actually does.

  for await (const raw of streamReviewRows(filePath)) {
    totalReviews++;
    const mapped = mapRow(raw, mapping);
    const label = mapped.sourceId || `row ${totalReviews}`;
    reviewIds.add(mapped.sourceId);

    if (!mapped.sourceId) addIssue(totalReviews, label, "Missing review ID.", "error");
    else {
      const key = mapped.sourceId.toLowerCase();
      if (seenIds.has(key)) { duplicateReviewIdsInFile++; addIssue(totalReviews, label, `Duplicate review ID "${mapped.sourceId}" within this file.`, "warning"); }
      seenIds.add(key);
    }

    if (!mapped.productSourceId) { missingProductReference++; addIssue(totalReviews, label, "No product reference.", "error"); }
    else if (!productIndex.has(mapped.productSourceId)) { brokenProductReferences++; addIssue(totalReviews, label, `Product post ID "${mapped.productSourceId}" not found among this file's own product posts.`, "warning"); }

    if (isMalformedRating(mapped.rating)) {
      // Present but not 1-5 — the source's own rating field is corrupted, genuinely unusable.
      invalidRatings++;
      addIssue(totalReviews, label, `Invalid rating "${mapped.rating}".`, "error");
    } else if (!isValidRating(mapped.rating)) {
      // Blank — a valid WooCommerce comment_type="review" row without a
      // rating (see wooReviewMapping.ts's classifyReviewRow doc comment).
      // Not an error: counted by classification, surfaced as a warning, and
      // excluded from `pending` below so it's never counted as a review
      // that will be created/updated.
      const cls = classifyReviewRow(mapped);
      if (cls === "trash") trashedComments++;
      else if (cls === "product-comment") unratedProductComments++;
      // cls === "spam" is already counted via spamComments below (unconditional on rating).
      addIssue(totalReviews, label, `No rating — classified as "${cls}" (a WooCommerce product comment, not a star review). Will not be imported as a review.`, "warning");
    } else {
      ratingCounts.set(Number(mapped.rating), (ratingCounts.get(Number(mapped.rating)) ?? 0) + 1);
    }

    if (!mapped.body.trim()) { missingReviewText++; addIssue(totalReviews, label, "No review text.", "warning"); }

    const statusKey = mapped.wooStatus || "(none)";
    approvalCounts.set(statusKey, (approvalCounts.get(statusKey) ?? 0) + 1);
    const status = resolveReviewStatus(mapped.wooStatus);
    if (!status.recognized) { unrecognizedStatus++; addIssue(totalReviews, label, `Unrecognized approval status "${mapped.wooStatus}".`, "warning"); }
    if (mapped.wooStatus.trim().toLowerCase() === "spam") spamComments++;

    if (mapped.adminReply.trim()) withAdminReply++;
    if (/^(1|yes|true)$/i.test(mapped.wooVerified)) verifiedPurchaseCount++;

    if (!mapped.email && (!mapped.customerId || mapped.customerId === "0")) guestReviews++;
    else registeredCustomerReviews++;
    if (mapped.email) fileEmails.push(mapped.email);
    if (mapped.customerId && mapped.customerId !== "0") fileWpCustomerIds.push(mapped.customerId);

    const comboKey = `${(mapped.email || mapped.author).toLowerCase()}::${mapped.productSourceId}`;
    if (seenCombos.has(comboKey)) { duplicateReviewerProductCombos++; addIssue(totalReviews, label, `Another review from the same reviewer for the same product already appears in this file.`, "warning"); }
    seenCombos.add(comboKey);

    const period = periodKey(mapped.createdDate);
    if (period) timelineByPeriod.set(period, (timelineByPeriod.get(period) ?? 0) + 1);

    if (mapped.productSku) allSkus.add(mapped.productSku);
    if (mapped.productSlug) allSlugs.add(mapped.productSlug);
    if (mapped.productName) allNames.add(mapped.productName);

    if (classifyReviewRow(mapped) === "review") {
      pending.push({ sourceId: mapped.sourceId, email: mapped.email, customerId: mapped.customerId, productSku: mapped.productSku, productSlug: mapped.productSlug, productName: mapped.productName, productSourceId: mapped.productSourceId });
    }
  }

  const unsupportedMetaKeys = await collectUnsupportedMetaKeys(filePath, reviewIds);

  const [existingUsersByEmail, existingUsersBySourceId, existingReviews, skuProducts, slugProducts, nameProducts] = await Promise.all([
    fileEmails.length ? UserModel.find({ email: { $in: [...new Set(fileEmails.map((e) => e.toLowerCase()))] } }).select("email").lean<{ email: string }[]>() : Promise.resolve([]),
    fileWpCustomerIds.length ? UserModel.find({ sourceSystem: "woocommerce", sourceId: { $in: [...new Set(fileWpCustomerIds)] } }).select("sourceId").lean<{ sourceId: string }[]>() : Promise.resolve([]),
    seenIds.size ? ReviewModel.find({ sourceSystem: "woocommerce", sourceId: { $in: [...seenIds] } }).select("sourceId status wooStatus adminReply featured").lean<any[]>() : Promise.resolve([]),
    allSkus.size ? ProductModel.find({ sku: { $in: [...allSkus] } }).select("sku").lean<{ sku: string }[]>() : Promise.resolve([]),
    allSlugs.size ? ProductModel.find({ slug: { $in: [...allSlugs] } }).select("slug").lean<{ slug: string }[]>() : Promise.resolve([]),
    allNames.size ? ProductModel.find({ name: { $in: [...allNames] } }).select("name").lean<{ name: string }[]>() : Promise.resolve([]),
  ]);

  const userEmailSet = new Set(existingUsersByEmail.map((u) => u.email.toLowerCase()));
  const userSourceIdSet = new Set(existingUsersBySourceId.map((u) => u.sourceId));
  const existingReviewBySourceId = new Map(existingReviews.map((r: any) => [String(r.sourceId).toLowerCase(), r]));

  const productLookups: ProductLookups = {
    bySku: new Map(skuProducts.map((p) => [String(p.sku).toLowerCase(), "1"])),
    bySlug: new Map(slugProducts.map((p) => [String(p.slug).toLowerCase(), "1"])),
    byName: new Map(nameProducts.map((p) => [String(p.name).toLowerCase(), "1"])),
  };

  let reviewsToCreate = 0, reviewsToUpdate = 0, protectedReviewsMatched = 0, matchedCustomers = 0, missingCustomers = 0, matchedProducts = 0, missingProducts = 0;

  for (const r of pending) {
    if (!r.sourceId) continue;
    const key = r.sourceId.toLowerCase();
    const existing = existingReviewBySourceId.get(key);
    if (existing) {
      reviewsToUpdate++;
      const derivedStatus = existing.wooStatus ? resolveReviewStatus(existing.wooStatus).status : undefined;
      if (existing.featured || existing.adminReply || (derivedStatus && existing.status !== derivedStatus)) protectedReviewsMatched++;
    } else {
      reviewsToCreate++;
    }

    const link = resolveReviewCustomerLink(r, {
      userIdByEmail: r.email && userEmailSet.has(r.email.toLowerCase()) ? new Map([[r.email, "1"]]) : new Map(),
      userIdBySourceId: r.customerId && userSourceIdSet.has(r.customerId) ? new Map([[r.customerId, "1"]]) : new Map(),
    });
    if (link.isGuest) missingCustomers++; else matchedCustomers++;

    const productLink = resolveReviewProductLink({ sku: r.productSku, slug: r.productSlug, name: r.productName }, productLookups);
    if (productLink.matched) matchedProducts++; else missingProducts++;

    // "non-product comments" — a review whose product post ID exists in the
    // dump but its post_type wasn't "product" would never have made it into
    // productIndex in the first place (collectProductIndex only indexes
    // post_type="product"), so it's indistinguishable here from a genuinely
    // missing reference — both are already counted above via
    // brokenProductReferences/missingProductReference.
  }
  nonProductComments = brokenProductReferences;

  let score = 100;
  score -= Math.min(50, missingProductReference * 2 + invalidRatings * 2);
  score -= Math.min(20, duplicateReviewIdsInFile);
  score -= Math.min(15, missingProducts * 0.3);
  score -= Math.min(10, unrecognizedStatus * 0.5);
  score -= Math.min(10, missingReviewText * 0.2);
  score = Math.max(0, Math.round(score));
  const label = score >= 90 ? "Ready to Import" : score >= 70 ? "Needs Review" : "High Risk";

  return {
    fileName,
    totalRows: totalReviews,
    analyzedAt: new Date().toISOString(),
    general: {
      totalReviews, guestReviews, registeredCustomerReviews,
      ratingDistribution: [...ratingCounts.entries()].map(([rating, count]) => ({ rating, count })).sort((a, b) => a.rating - b.rating),
      approvalBreakdown: [...approvalCounts.entries()].map(([wooStatus, count]) => ({ wooStatus, status: resolveReviewStatus(wooStatus).status, count })).sort((a, b) => b.count - a.count),
      verifiedPurchaseCount, withAdminReply,
      timeline: [...timelineByPeriod.entries()].map(([period, count]) => ({ period, count })).sort((a, b) => a.period.localeCompare(b.period)),
    },
    quality: {
      missingProductReference, invalidRatings, unratedProductComments, trashedComments, duplicateReviewIdsInFile, duplicateReviewerProductCombos,
      missingReviewText, spamComments, nonProductComments, brokenProductReferences, unrecognizedStatus,
      issues: issues.slice(0, ISSUE_CAP), issuesTruncated: issues.length >= ISSUE_CAP,
    },
    unsupportedMetaKeys,
    databaseImpact: { reviewsToCreate, reviewsToUpdate, protectedReviewsMatched, matchedCustomers, missingCustomers, matchedProducts, missingProducts },
    summary: { score, label },
  };
}
