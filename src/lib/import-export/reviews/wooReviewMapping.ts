import { applyMapping } from "../mapping";
import type { TargetField } from "../types";

// Pure review field mapping/normalization/linking-decision logic — no
// database access, no file I/O. Mirrors orders/wooOrderMapping.ts's split
// exactly: the SQL parsing and comment merge (wooReviewSqlSource.ts, this
// same folder) produces a flat "virtual CSV row" per review; everything
// from here on is format-agnostic. The linking decisions (product/customer/
// verified-purchase) live here too, pure functions over already-fetched
// lookup maps, so the live importer, the preview, the analyzer, and the
// repair script can never disagree about what a given review should become.
// No `server-only` guard, same reasoning as the other mapping modules:
// reused as-is by the standalone repair script (scripts/migrateWooReviews.ts).

export const TARGET_FIELDS: TargetField[] = [
  { key: "productSourceId", label: "Product (WordPress post ID)", required: true, aliases: ["comment_post_ID"], description: "See § Product Linking (ADMIN_CMS.md) — matched by ID, then SKU, then slug, then product name." },
  { key: "wooStatus", label: "Approval Status", aliases: ["comment_approved"], description: "WordPress's raw comment_approved value — see § Review Status Mapping (ADMIN_CMS.md)." },
  { key: "author", label: "Reviewer Name", required: true, aliases: ["comment_author"] },
  { key: "email", label: "Reviewer Email", aliases: ["comment_author_email"], description: "Primary customer-linking key." },
  { key: "createdDate", label: "Review Date", aliases: ["comment_date"] },
  { key: "body", label: "Review Text", aliases: ["comment_content"] },
  { key: "customerId", label: "WordPress Customer ID", aliases: ["user_id"], description: "Fallback customer-linking key, used only when no account matches by email. 0 means a guest reviewer." },
  { key: "rating", label: "Rating", required: true, aliases: ["rating"] },
  { key: "wooVerified", label: "Verified (WooCommerce)", aliases: ["verified"] },
  { key: "title", label: "Review Title", aliases: ["title"], description: "Best-effort — WooCommerce core has no title field; only present with certain review plugins." },
  { key: "editedDate", label: "Edited Date", aliases: ["edited_at"], description: "Best-effort — no WordPress core column for this." },
  { key: "helpfulYes", label: "Helpful Votes (Yes)", aliases: ["helpful_yes"] },
  { key: "helpfulNo", label: "Helpful Votes (No)", aliases: ["helpful_no"] },
  { key: "adminReply", label: "Admin Reply", aliases: ["admin_reply"] },
  { key: "adminReplyDate", label: "Admin Reply Date", aliases: ["admin_reply_date"] },
];

export interface WooMappedReview {
  sourceId: string;
  productSourceId: string;
  productSku: string;
  productSlug: string;
  productName: string;
  wooStatus: string;
  author: string;
  email: string;
  createdDate: string;
  body: string;
  customerId: string;
  rating: string;
  wooVerified: string;
  title: string;
  editedDate: string;
  helpfulYes: string;
  helpfulNo: string;
  adminReply: string;
  adminReplyDate: string;
}

export function mapRow(raw: Record<string, string>, mapping: Record<string, string>): WooMappedReview {
  const m = applyMapping(raw, mapping);
  return {
    sourceId: (raw["comment_ID"] ?? "").trim(),
    productSourceId: (m.productSourceId ?? "").trim(),
    // Structural passthrough — already resolved by wooReviewSqlSource.ts
    // (same reasoning as Orders' line_items_json), read straight off `raw`
    // rather than through the column-mapping UI.
    productSku: (raw["product_sku"] ?? "").trim(),
    productSlug: (raw["product_slug"] ?? "").trim(),
    productName: (raw["product_name"] ?? "").trim(),
    wooStatus: (m.wooStatus ?? "").trim(),
    author: (m.author ?? "").trim(),
    email: (m.email ?? "").trim().toLowerCase(),
    createdDate: (m.createdDate ?? "").trim(),
    body: m.body ?? "",
    customerId: (m.customerId ?? "0").trim(),
    rating: (m.rating ?? "").trim(),
    wooVerified: (m.wooVerified ?? "").trim(),
    title: (m.title ?? "").trim(),
    editedDate: (m.editedDate ?? "").trim(),
    helpfulYes: (m.helpfulYes ?? "").trim(),
    helpfulNo: (m.helpfulNo ?? "").trim(),
    adminReply: m.adminReply ?? "",
    adminReplyDate: (m.adminReplyDate ?? "").trim(),
  };
}

export function isValidRating(rating: string): boolean {
  const n = Number(rating);
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

// ---------------------------------------------------------------------------
// Row Classification — WooCommerce's own comment/review model, confirmed
// against its code reference: "Reviews are almost identical to comments with
// the exception of optional 'rating' meta data." Any comment left on a
// product page gets comment_type="review" regardless of whether it went
// through the star-rating form — a missing `rating` postmeta is therefore a
// normal, valid WooCommerce data shape (a plain product comment), not
// corrupted review data. Real exports confirm this in practice: spam bots
// and plain-text comments on product pages routinely carry comment_type
// "review" with zero rating meta at all.
//
// This classification is the single source of truth every stage below
// (validation, import, analyzer, preview, repair script) uses to decide
// whether a row is a genuine star review or something else — so "no rating"
// is a data fact recorded and reported everywhere, never a validation
// failure, and never a reason to invent a rating just to satisfy
// Review.rating's required 1-5 field (there is no coherent "0-star"/"unrated"
// review — WooCommerce's own aggregate rating calculation only ever
// averages *rated* reviews).
// ---------------------------------------------------------------------------

export type ReviewRowClassification = "review" | "product-comment" | "spam" | "trash";

/**
 * - "review": has a valid 1-5 rating — a genuine product review, imported
 *   exactly as before.
 * - "spam" / "trash": WordPress's own moderation state says so (regardless
 *   of rating) — informational buckets, distinct from "product-comment" so
 *   an admin can see *why* a given unrated row isn't a review.
 * - "product-comment": everything else with no valid rating — a real,
 *   valid WooCommerce comment on a product page that was never a star
 *   review. Not imported as a Review, but never silently dropped either:
 *   every non-"review" row is still counted and surfaced as a warning.
 */
export function classifyReviewRow(mapped: { rating: string; wooStatus: string }): ReviewRowClassification {
  if (isValidRating(mapped.rating)) return "review";
  const approved = mapped.wooStatus.trim().toLowerCase();
  if (approved === "spam") return "spam";
  if (approved === "trash") return "trash";
  return "product-comment";
}

/** A rating value that's present but malformed (not blank, not 1-5) — the
 *  one case that's still genuinely unusable data, distinct from a
 *  legitimately absent rating. Blank means "no rating meta existed at
 *  all" — expected and valid; a non-blank value that doesn't parse to 1-5
 *  means the source's own rating field is corrupted. */
export function isMalformedRating(rating: string): boolean {
  return rating.trim() !== "" && !isValidRating(rating);
}

function truthy(v: string): boolean {
  const n = v.trim().toLowerCase();
  return n === "1" || n === "yes" || n === "true";
}

// ---------------------------------------------------------------------------
// Security — strip HTML tags and decode common entities from every field
// that ever came from the source dump, before it's ever written to Mongo.
// Not a rich-text sanitizer (nothing here needs to preserve formatting —
// WooCommerce reviews are plain text) — this is defense in depth so no
// consumer of Review data (today's plain-JSX admin table, or a future
// storefront listing) has to be the one place that must remember to escape
// it. Dependency-free, same "no new library for a well-known small
// technique" posture as the Media Migration Manager's format sniffers.
// ---------------------------------------------------------------------------
const HTML_ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#039;": "'", "&apos;": "'", "&nbsp;": " " };

export function sanitizeText(input: string): string {
  if (!input) return "";
  const withoutTags = input.replace(/<[^>]*>/g, "");
  return withoutTags.replace(/&(amp|lt|gt|quot|#039|apos|nbsp);/g, (m) => HTML_ENTITIES[m] ?? m).trim();
}

// ---------------------------------------------------------------------------
// Status Mapping — comment_approved -> Review.status. Review's enum only
// has three values (pending/approved/rejected — pre-existing, shared with
// the admin moderation UI), so "spam" and "trash" both land on "rejected"
// rather than inventing new enum values; the raw value is always preserved
// verbatim as Review.wooStatus, so "which of the two it actually was" is
// never lost even though the normalized field can't distinguish them.
// ---------------------------------------------------------------------------

export type ReviewStatus = "pending" | "approved" | "rejected";
const STATUS_MAP: Record<string, ReviewStatus> = { "1": "approved", "0": "pending", spam: "rejected", trash: "rejected" };

export function resolveReviewStatus(commentApproved: string): { status: ReviewStatus; recognized: boolean } {
  const key = commentApproved.trim().toLowerCase();
  const status = STATUS_MAP[key];
  return status ? { status, recognized: true } : { status: "pending", recognized: false };
}

// ---------------------------------------------------------------------------
// Customer Linking — identical shape to orders/wooOrderMapping.ts's
// resolveOrderCustomerLink: email primary, WordPress user ID fallback, else
// a guest review. A separate, non-shared implementation (not an import from
// the orders module) since a review and an order are different mapped-row
// shapes — the *decision* is the same, the input type isn't.
// ---------------------------------------------------------------------------

export interface CustomerLinkResult { userId: string | null; isGuest: boolean; matchMethod: "email" | "wp-id" | "guest" }

export function resolveReviewCustomerLink(
  mapped: { email: string; customerId: string },
  lookups: { userIdByEmail: Map<string, string>; userIdBySourceId: Map<string, string> }
): CustomerLinkResult {
  const emailKey = mapped.email.trim().toLowerCase();
  if (emailKey) {
    const byEmail = lookups.userIdByEmail.get(emailKey);
    if (byEmail) return { userId: byEmail, isGuest: false, matchMethod: "email" };
  }
  if (mapped.customerId && mapped.customerId !== "0") {
    const byId = lookups.userIdBySourceId.get(mapped.customerId);
    if (byId) return { userId: byId, isGuest: false, matchMethod: "wp-id" };
  }
  return { userId: null, isGuest: true, matchMethod: "guest" };
}

// ---------------------------------------------------------------------------
// Product Linking — ID -> SKU -> slug -> name, in that priority order (per
// the task). The "ID" hop already happened in wooReviewSqlSource.ts (the
// WordPress post ID -> SKU/slug/name resolution, via collectProductIndex,
// baked into productSku/productSlug/productName on the mapped row) — Product
// has no field remembering its original WordPress post ID (see ADMIN_CMS.md
// § Order Items — Product Linking for the identical constraint orders hit
// first), so SKU is the actual bridge to the live collection. `lookups`
// resolves the already-known sku/slug/name against it.
// ---------------------------------------------------------------------------

export interface ProductLookups { bySku: Map<string, string>; bySlug: Map<string, string>; byName: Map<string, string> }
export interface ProductLinkResult { productId: string | null; matched: boolean; matchMethod: "sku" | "slug" | "name" | "unmatched" }

export function resolveReviewProductLink(
  product: { sku: string; slug: string; name: string },
  lookups: ProductLookups
): ProductLinkResult {
  if (product.sku) {
    const hit = lookups.bySku.get(product.sku.trim().toLowerCase());
    if (hit) return { productId: hit, matched: true, matchMethod: "sku" };
  }
  if (product.slug) {
    const hit = lookups.bySlug.get(product.slug.trim().toLowerCase());
    if (hit) return { productId: hit, matched: true, matchMethod: "slug" };
  }
  if (product.name) {
    // "Safe fallback detection" — exact, case-insensitive name match only,
    // never fuzzy/partial. A false product link is worse than an unmatched
    // review (which still imports with nothing lost).
    const hit = lookups.byName.get(product.name.trim().toLowerCase());
    if (hit) return { productId: hit, matched: true, matchMethod: "name" };
  }
  return { productId: null, matched: false, matchMethod: "unmatched" };
}

// ---------------------------------------------------------------------------
// Order Verification — a review's `verified` flag becomes authoritatively
// `true` only when an already-imported (or organic) Order proves the linked
// customer bought the linked product; otherwise WooCommerce's own `verified`
// commentmeta flag is trusted as-is, whatever it says. Pure: `orderConfirms`
// is a pre-computed boolean the caller derives from a single Order query
// (see wooReviewImporter.ts) — this function only decides what to do with it.
// ---------------------------------------------------------------------------

export interface VerifiedResult { verified: boolean; verifiedSource: "order-confirmed" | "source-flag" }

export function resolveVerifiedPurchase(orderConfirmsPurchase: boolean, wooVerifiedFlag: string): VerifiedResult {
  if (orderConfirmsPurchase) return { verified: true, verifiedSource: "order-confirmed" };
  return { verified: truthy(wooVerifiedFlag), verifiedSource: "source-flag" };
}

// ---------------------------------------------------------------------------
// Review Migration Security — never let a re-import (or the repair script)
// silently undo a deliberate admin moderation decision. Mirrors
// isProtectedOrder's philosophy (orders/wooOrderMapping.ts): once real,
// deliberate admin action has happened on this review, a data migration
// must never silently revert it — only rating/text/dates/verified-purchase
// stay eligible for correction on re-import.
// ---------------------------------------------------------------------------

export function isProtectedReview(existing: { status?: string; wooStatus?: string; adminReply?: string; featured?: boolean } | null | undefined): boolean {
  if (!existing) return false;
  if (existing.featured) return true;
  if (existing.adminReply) return true; // any existing reply is protected wholesale — see ADMIN_CMS.md § Review Migration Security
  if (existing.wooStatus) {
    const derived = resolveReviewStatus(existing.wooStatus).status;
    if (existing.status && existing.status !== derived) return true; // status was manually overridden away from its own source-derived value
  }
  return false;
}

// ---------------------------------------------------------------------------
// Document assembly — pure, no database access, no side effects.
// ---------------------------------------------------------------------------

export interface ReviewBuildResult { doc: Record<string, unknown> }

/**
 * Callers must only invoke this for rows `classifyReviewRow()` returns
 * "review" for (a real, valid 1-5 rating) — see wooReviewImporter.ts,
 * wooReviewPreview.ts, and scripts/migrateWooReviews.ts, which all gate on
 * that classification before ever reaching here. `mapped.rating` is
 * therefore trusted as already-valid; this never invents a rating for a
 * row that didn't have one (Review.rating has no "0"/"unrated" concept to
 * fall back to — see the classification note above `classifyReviewRow()`).
 */
export function buildReviewDoc(
  mapped: WooMappedReview,
  productId: string | null,
  customerLink: CustomerLinkResult,
  verifiedResult: VerifiedResult
): ReviewBuildResult {
  const status = resolveReviewStatus(mapped.wooStatus);
  const createdAt = mapped.createdDate ? new Date(mapped.createdDate) : undefined;
  const validCreatedAt = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : undefined;
  const editedAt = mapped.editedDate ? new Date(mapped.editedDate) : undefined;
  const validEditedAt = editedAt && !Number.isNaN(editedAt.getTime()) ? editedAt : undefined;
  const adminReplyDate = mapped.adminReplyDate ? new Date(mapped.adminReplyDate) : undefined;
  const validAdminReplyDate = adminReplyDate && !Number.isNaN(adminReplyDate.getTime()) ? adminReplyDate : undefined;

  const doc: Record<string, unknown> = {
    author: sanitizeText(mapped.author) || "Anonymous",
    rating: Number(mapped.rating),
    body: sanitizeText(mapped.body),
    verified: verifiedResult.verified,
    verifiedSource: verifiedResult.verifiedSource,
    status: status.status,
    wooStatus: mapped.wooStatus,
    sourceSystem: "woocommerce",
    sourceId: mapped.sourceId,
    email: mapped.email || undefined,
    isGuestReview: customerLink.isGuest,
  };
  if (productId) doc.product = productId;
  if (customerLink.userId) doc.user = customerLink.userId;
  const title = sanitizeText(mapped.title);
  if (title) doc.title = title;
  const adminReply = sanitizeText(mapped.adminReply);
  if (adminReply) doc.adminReply = adminReply;
  if (validAdminReplyDate) doc.adminReplyDate = validAdminReplyDate;
  if (validCreatedAt) doc.createdAt = validCreatedAt;
  if (validEditedAt) doc.editedAt = validEditedAt;
  if (mapped.helpfulYes && Number.isFinite(Number(mapped.helpfulYes))) doc.helpfulYes = Number(mapped.helpfulYes);
  if (mapped.helpfulNo && Number.isFinite(Number(mapped.helpfulNo))) doc.helpfulNo = Number(mapped.helpfulNo);

  return { doc };
}
