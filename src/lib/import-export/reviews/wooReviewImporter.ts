import { ReviewModel } from "@/models/Review";
import { UserModel } from "@/models/User";
import { ProductModel } from "@/models/Product";
import { OrderModel } from "@/models/Order";
import { syncProductRating } from "@/lib/reviews";
import {
  TARGET_FIELDS,
  buildReviewDoc,
  classifyReviewRow,
  isMalformedRating,
  isProtectedReview,
  isValidRating,
  mapRow,
  resolveReviewCustomerLink,
  resolveReviewProductLink,
  resolveReviewStatus,
  resolveVerifiedPurchase,
  type WooMappedReview,
} from "./wooReviewMapping";
import { streamReviewRows } from "./wooReviewSqlSource";
import type { ImporterModule, ImportRunContext, RowResult, ValidationIssue } from "../types";

// The review counterpart of orders/wooOrderImporter.ts — same contract,
// same engine, same wizard. `sourceId` (the original WordPress comment_ID)
// is this importer's identity key: unlike orders (orderNumber) or customers
// (email), a review has no pre-existing natural business key on its own
// schema, so the source system's own ID is the only thing that reliably
// identifies "the same review" across re-imports.

export { TARGET_FIELDS, buildReviewDoc, mapRow };
export type { WooMappedReview } from "./wooReviewMapping";

function validateRow(mapped: WooMappedReview, rowIndex: number, ctx: ImportRunContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!mapped.sourceId) {
    issues.push({ row: rowIndex, field: "sourceId", message: "Missing review ID.", level: "error" });
  } else {
    const key = mapped.sourceId.toLowerCase();
    if (ctx.seenSkus.has(key)) {
      issues.push({ row: rowIndex, field: "sourceId", message: `Duplicate review ID "${mapped.sourceId}" within this file — the later row will update what the earlier row created.`, level: "warning" });
    }
    ctx.seenSkus.add(key);
  }

  if (!mapped.productSourceId) {
    issues.push({ row: rowIndex, field: "productSourceId", message: "Missing product reference — this review cannot be linked to anything.", level: "error" });
  }
  if (isMalformedRating(mapped.rating)) {
    // Present but not 1-5 — the source's own rating field is corrupted;
    // this genuinely can't be imported as a review. Distinct from a blank
    // rating below, which is normal WooCommerce data, not an error.
    issues.push({ row: rowIndex, field: "rating", message: `"${mapped.rating}" is not a valid rating (must be a whole number 1-5).`, level: "error" });
  } else if (!isValidRating(mapped.rating)) {
    // Blank — no rating meta existed in the source at all. WooCommerce
    // itself has no dedicated "review" comment type separate from a plain
    // product comment; "Reviews are almost identical to comments with the
    // exception of optional 'rating' meta data" (WC_Comments code
    // reference). Not an error — this row simply isn't a star review and
    // will be skipped from the Review import, not blocked or invented.
    const cls = classifyReviewRow(mapped);
    issues.push({ row: rowIndex, field: "rating", message: `No rating found — this is a WooCommerce comment on a product page (classified as "${cls}"), not a star review. It will not be imported as a review.`, level: "warning" });
  }
  if (!mapped.body.trim()) {
    issues.push({ row: rowIndex, field: "body", message: "No review text — rating-only review.", level: "warning" });
  }
  if (!resolveReviewStatus(mapped.wooStatus).recognized) {
    issues.push({ row: rowIndex, field: "wooStatus", message: `Unrecognized approval status "${mapped.wooStatus}" — will default to pending.`, level: "warning" });
  }

  // Duplicate reviewer+product combination — a heads-up, not an error:
  // WooCommerce allows the same customer to review a product more than
  // once over time (e.g. after a repeat purchase).
  const comboKey = `${(mapped.email || mapped.author).toLowerCase()}::${mapped.productSourceId}`;
  const combos = (ctx.scratch.reviewerProductCombos ??= new Set<string>()) as Set<string>;
  if (combos.has(comboKey)) {
    issues.push({ row: rowIndex, field: "productSourceId", message: `Another review from "${mapped.email || mapped.author}" for the same product already appears in this file.`, level: "warning" });
  }
  combos.add(comboKey);

  return issues;
}

async function resolveProductLink(mapped: WooMappedReview) {
  const orConditions: Record<string, string>[] = [];
  if (mapped.productSku) orConditions.push({ sku: mapped.productSku });
  if (mapped.productSlug) orConditions.push({ slug: mapped.productSlug });
  if (mapped.productName) orConditions.push({ name: mapped.productName });
  const candidates = orConditions.length ? await ProductModel.find({ $or: orConditions }).select("_id sku slug name").lean<any[]>() : [];

  const bySku = new Map(candidates.filter((p) => p.sku).map((p) => [String(p.sku).toLowerCase(), String(p._id)]));
  const bySlug = new Map(candidates.filter((p) => p.slug).map((p) => [String(p.slug).toLowerCase(), String(p._id)]));
  const byName = new Map(candidates.filter((p) => p.name).map((p) => [String(p.name).toLowerCase(), String(p._id)]));

  return resolveReviewProductLink({ sku: mapped.productSku, slug: mapped.productSlug, name: mapped.productName }, { bySku, bySlug, byName });
}

async function importRow(mapped: WooMappedReview, _rowIndex: number, ctx: ImportRunContext): Promise<RowResult> {
  if (!mapped.sourceId) {
    return { outcome: "failed", message: "Missing review ID — cannot import a review without one." };
  }
  if (isMalformedRating(mapped.rating)) {
    return { outcome: "failed", message: `Review ${mapped.sourceId}: invalid rating "${mapped.rating}".` };
  }
  if (!isValidRating(mapped.rating)) {
    // No rating meta at all — a valid WooCommerce product comment, not a
    // star review (see classifyReviewRow's doc comment). Skipped, not
    // failed: this isn't broken data, it just isn't a review.
    const cls = classifyReviewRow(mapped);
    return { outcome: "skipped", message: `Review ${mapped.sourceId}: no rating — classified as "${cls}", not a star review.` };
  }

  const [productLink, userByEmail, userBySourceId, existing] = await Promise.all([
    resolveProductLink(mapped),
    mapped.email ? UserModel.findOne({ email: mapped.email }).select("_id").lean<{ _id: unknown } | null>() : Promise.resolve(null),
    mapped.customerId && mapped.customerId !== "0"
      ? UserModel.findOne({ sourceSystem: "woocommerce", sourceId: mapped.customerId }).select("_id").lean<{ _id: unknown } | null>()
      : Promise.resolve(null),
    ReviewModel.findOne({ sourceSystem: "woocommerce", sourceId: mapped.sourceId }),
  ]);

  const customerLink = resolveReviewCustomerLink(mapped, {
    userIdByEmail: userByEmail ? new Map([[mapped.email, String(userByEmail._id)]]) : new Map(),
    userIdBySourceId: userBySourceId ? new Map([[mapped.customerId, String(userBySourceId._id)]]) : new Map(),
  });

  // Order Verification — only attempted when the review resolved to a real
  // product; a customer/email match alone isn't enough to prove a purchase.
  let orderConfirms = false;
  if (productLink.productId && (customerLink.userId || mapped.email)) {
    orderConfirms = await OrderModel.exists({
      $or: [...(customerLink.userId ? [{ user: customerLink.userId }] : []), ...(mapped.email ? [{ email: mapped.email }] : [])],
      "items.product": productLink.productId,
    }).then(Boolean);
  }
  const verifiedResult = resolveVerifiedPurchase(orderConfirms, mapped.wooVerified);

  const { doc } = buildReviewDoc(mapped, productLink.productId, customerLink, verifiedResult);

  if (existing) {
    ctx.skuToId.set(mapped.sourceId.toLowerCase(), String(existing._id));
    if (ctx.duplicateStrategy === "skip") {
      return { outcome: "skipped", message: `Review "${mapped.sourceId}" already exists.` };
    }

    const protectedReview = isProtectedReview(existing);
    const previousValues: Record<string, unknown> = {};
    const patch: Record<string, unknown> = { ...doc };
    if (protectedReview) {
      delete patch.status;
      delete patch.adminReply;
      delete patch.adminReplyDate;
    }
    for (const key of Object.keys(patch)) previousValues[key] = (existing as any).get?.(key) ?? (existing as any)[key];

    Object.assign(existing, patch);
    await existing.save();
    if (doc.product && doc.status === "approved") await syncProductRating(String(doc.product));
    else if (existing.product && previousValues.status === "approved") await syncProductRating(String(existing.product));

    return {
      outcome: "updated",
      message: protectedReview ? `Updated review data only — "${mapped.sourceId}" has an admin reply/featured flag/manual status override, left untouched.` : undefined,
      snapshot: { identifier: mapped.sourceId, documentId: String(existing._id), previousValues },
    };
  }

  const created = await ReviewModel.create(doc);
  ctx.skuToId.set(mapped.sourceId.toLowerCase(), String(created._id));
  if (created.product && created.status === "approved") await syncProductRating(String(created.product));
  return { outcome: "imported" };
}

export const wooReviewImporter: ImporterModule<WooMappedReview> = {
  key: "reviews",
  label: "Reviews",
  description: "Import product reviews from a WordPress/WooCommerce SQL export (wp_comments + wp_commentmeta).",
  icon: "Star",
  status: "available",
  acceptedExtensions: [".sql"],
  identifierField: "sourceId",
  targetFields: TARGET_FIELDS,
  streamRows: streamReviewRows,
  mapRow,
  validateRow,
  importRow,
};
