import { dbConnect } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { ProductModel } from "@/models/Product";
import { OrderModel } from "@/models/Order";
import { ReviewModel } from "@/models/Review";
import { streamReviewRows } from "./wooReviewSqlSource";
import {
  buildReviewDoc,
  classifyReviewRow,
  isMalformedRating,
  isProtectedReview,
  mapRow,
  resolveReviewCustomerLink,
  resolveReviewProductLink,
  resolveVerifiedPurchase,
  type ProductLookups,
  type WooMappedReview,
} from "./wooReviewMapping";

// The review counterpart of orders/wooOrderPreview.ts — "source row -> mapped
// fields -> the exact document a real import would create," entirely
// read-only. Calls the exact same mapRow()/resolveReviewCustomerLink()/
// resolveReviewProductLink()/resolveVerifiedPurchase()/buildReviewDoc()/
// isProtectedReview() the live importer uses — no re-implementation of any
// mapping, linking, or merge logic. For a protected review (admin reply,
// featured, or a manually-overridden status), `after` shows the existing,
// unchanged status/adminReply/adminReplyDate — mirroring the same accuracy
// fix the Customer and Order Migration Assistants needed for their own
// protected-record previews, applied here from the start.

const PREVIEW_CAP = 300;

export interface ReviewPreviewSide {
  sourceId: string;
  productId: string | null;
  productMatchMethod: string;
  author: string;
  email: string;
  isGuestReview: boolean;
  rating: number;
  title: string;
  body: string;
  verified: boolean;
  verifiedSource: string;
  status: string;
  wooStatus: string;
  createdAt: string | null;
  editedAt: string | null;
  adminReply: string;
  adminReplyDate: string | null;
  helpfulYes: number | null;
  helpfulNo: number | null;
}

export interface ReviewPreviewRow {
  row: number;
  sourceId: string;
  isDuplicateInFile: boolean;
  existsInDb: boolean;
  isProtected: boolean;
  /** false for a row with no rating (a WooCommerce product comment, not a
   *  star review — see wooReviewMapping.ts's classifyReviewRow) — this row
   *  will be skipped, not created/updated as a Review. `after` still shows
   *  every other mapped field for transparency, but `rating` is left `0`
   *  (never invented) and `classification` explains why. */
  willImport: boolean;
  classification: "review" | "product-comment" | "spam" | "trash";
  before: ReviewPreviewSide | null;
  after: ReviewPreviewSide;
  warnings: string[];
}

export interface ReviewPreviewResult {
  rows: ReviewPreviewRow[];
  totalRows: number;
  truncated: boolean;
}

function existingToSide(existing: any, productMatchMethod: string): ReviewPreviewSide {
  return {
    sourceId: existing.sourceId ?? "",
    productId: existing.product ? String(existing.product) : null,
    productMatchMethod,
    author: existing.author ?? "",
    email: existing.email ?? "",
    isGuestReview: !!existing.isGuestReview,
    rating: existing.rating ?? 0,
    title: existing.title ?? "",
    body: existing.body ?? "",
    verified: !!existing.verified,
    verifiedSource: existing.verifiedSource ?? "",
    status: existing.status ?? "",
    wooStatus: existing.wooStatus ?? "",
    createdAt: existing.createdAt ? new Date(existing.createdAt).toISOString() : null,
    editedAt: existing.editedAt ? new Date(existing.editedAt).toISOString() : null,
    adminReply: existing.adminReply ?? "",
    adminReplyDate: existing.adminReplyDate ? new Date(existing.adminReplyDate).toISOString() : null,
    helpfulYes: existing.helpfulYes ?? null,
    helpfulNo: existing.helpfulNo ?? null,
  };
}

export async function previewReviews(filePath: string, columnMapping: Record<string, string>): Promise<ReviewPreviewResult> {
  await dbConnect();

  const mapped_rows: { rowIndex: number; mapped: WooMappedReview }[] = [];
  let totalRows = 0;
  const seenIds = new Set<string>();

  const emails = new Set<string>();
  const wpCustomerIds = new Set<string>();
  const sourceIds = new Set<string>();
  const skus = new Set<string>();
  const slugs = new Set<string>();
  const names = new Set<string>();

  for await (const raw of streamReviewRows(filePath)) {
    totalRows++;
    if (mapped_rows.length >= PREVIEW_CAP) continue;
    const mapped = mapRow(raw, columnMapping);
    mapped_rows.push({ rowIndex: totalRows, mapped });

    if (mapped.email) emails.add(mapped.email);
    if (mapped.customerId && mapped.customerId !== "0") wpCustomerIds.add(mapped.customerId);
    if (mapped.sourceId) sourceIds.add(mapped.sourceId);
    if (mapped.productSku) skus.add(mapped.productSku);
    if (mapped.productSlug) slugs.add(mapped.productSlug);
    if (mapped.productName) names.add(mapped.productName);
  }

  const [users, usersBySourceId, existingReviews, skuProducts, slugProducts, nameProducts] = await Promise.all([
    emails.size ? UserModel.find({ email: { $in: [...emails] } }).select("email").lean<{ email: string }[]>() : Promise.resolve([]),
    wpCustomerIds.size ? UserModel.find({ sourceSystem: "woocommerce", sourceId: { $in: [...wpCustomerIds] } }).select("sourceId").lean<{ sourceId: string }[]>() : Promise.resolve([]),
    sourceIds.size ? ReviewModel.find({ sourceSystem: "woocommerce", sourceId: { $in: [...sourceIds] } }).lean<any[]>() : Promise.resolve([]),
    skus.size ? ProductModel.find({ sku: { $in: [...skus] } }).select("sku").lean<{ _id: unknown; sku: string }[]>() : Promise.resolve([]),
    slugs.size ? ProductModel.find({ slug: { $in: [...slugs] } }).select("slug").lean<{ _id: unknown; slug: string }[]>() : Promise.resolve([]),
    names.size ? ProductModel.find({ name: { $in: [...names] } }).select("name").lean<{ _id: unknown; name: string }[]>() : Promise.resolve([]),
  ]);

  const userEmailSet = new Set(users.map((u) => u.email.toLowerCase()));
  const userSourceIdSet = new Set(usersBySourceId.map((u) => u.sourceId));
  const existingBySourceId = new Map(existingReviews.map((r) => [String(r.sourceId).toLowerCase(), r]));

  const bySku = new Map(skuProducts.map((p) => [String(p.sku).toLowerCase(), String(p._id)]));
  const bySlug = new Map(slugProducts.map((p) => [String(p.slug).toLowerCase(), String(p._id)]));
  const byName = new Map(nameProducts.map((p) => [String(p.name).toLowerCase(), String(p._id)]));
  const productLookups: ProductLookups = { bySku, bySlug, byName };

  // Batched order-verification check: every (email, product) pair this
  // preview needs, resolved in one query rather than one per row. Only
  // email-based matching is batchable this way (WP-ID-linked reviewers
  // without an email can't be cheaply batched via $or on Order.email) — the
  // live importer's per-row check additionally covers that case directly.
  const productLinks = mapped_rows.map(({ mapped }) => resolveReviewProductLink({ sku: mapped.productSku, slug: mapped.productSlug, name: mapped.productName }, productLookups));
  const verifyConditions: { email: string; "items.product": string }[] = [];
  mapped_rows.forEach(({ mapped }, i) => {
    const productId = productLinks[i].productId;
    if (productId && mapped.email) verifyConditions.push({ email: mapped.email, "items.product": productId });
  });
  const confirmedOrders = verifyConditions.length
    ? await OrderModel.find({ $or: verifyConditions }).select("email items.product").lean<any[]>()
    : [];
  const confirmedSet = new Set(confirmedOrders.flatMap((o) => (o.items ?? []).map((i: any) => `${(o.email ?? "").toLowerCase()}::${String(i.product ?? "")}`)));

  const rows: ReviewPreviewRow[] = mapped_rows.map(({ rowIndex, mapped }, i) => {
    const warnings: string[] = [];
    const key = mapped.sourceId.toLowerCase();

    if (!mapped.sourceId) warnings.push("Missing review ID — this row cannot be imported.");
    const isDuplicateInFile = !!mapped.sourceId && seenIds.has(key);
    if (mapped.sourceId) seenIds.add(key);
    if (isDuplicateInFile) warnings.push("Duplicate review ID within this file — a later row will overwrite this one.");

    if (!mapped.productSourceId) warnings.push("No product reference — this review cannot be linked to anything.");
    const classification = classifyReviewRow(mapped);
    if (isMalformedRating(mapped.rating)) {
      warnings.push(`"${mapped.rating}" is not a valid rating.`);
    } else if (classification !== "review") {
      // Blank rating — a valid WooCommerce comment_type="review" row
      // without a rating (see wooReviewMapping.ts's classifyReviewRow doc
      // comment), not an error. Not imported as a review.
      warnings.push(`No rating found — classified as "${classification}" (a WooCommerce product comment, not a star review). This row will not be imported as a review.`);
    }
    if (!mapped.body.trim()) warnings.push("No review text — rating-only review.");

    const existing = existingBySourceId.get(key);
    const protectedReview = isProtectedReview(existing);
    if (protectedReview) warnings.push("Matches an existing review with an admin reply, featured flag, or manually-overridden status — only rating/text/dates will be updated.");

    const customerLink = resolveReviewCustomerLink(mapped, {
      userIdByEmail: mapped.email && userEmailSet.has(mapped.email.toLowerCase()) ? new Map([[mapped.email, "1"]]) : new Map(),
      userIdBySourceId: mapped.customerId && userSourceIdSet.has(mapped.customerId) ? new Map([[mapped.customerId, "1"]]) : new Map(),
    });
    const productLink = productLinks[i];
    if (!productLink.matched && classification === "review") warnings.push("Product couldn't be matched in the catalog by SKU, slug, or name.");

    const orderConfirms = !!productLink.productId && !!mapped.email && confirmedSet.has(`${mapped.email.toLowerCase()}::${productLink.productId}`);
    const verifiedResult = resolveVerifiedPurchase(orderConfirms, mapped.wooVerified);

    // buildReviewDoc() is only ever called for a genuine "review" row — it
    // trusts mapped.rating as already-valid and never invents one. A
    // non-review row's `after` is built by hand below instead, so its
    // rating is honestly `0` (never a fabricated value) and every other
    // field still shows what the row actually contains, for transparency.
    const after: ReviewPreviewSide = classification === "review"
      ? (() => {
          const { doc } = buildReviewDoc(mapped, productLink.productId, customerLink, verifiedResult);
          return {
            sourceId: String(doc.sourceId ?? ""),
            productId: (doc.product as string | undefined) ?? null,
            productMatchMethod: productLink.matchMethod,
            author: String(doc.author ?? ""),
            email: String(doc.email ?? ""),
            isGuestReview: !!doc.isGuestReview,
            rating: Number(doc.rating) || 0,
            title: String(doc.title ?? ""),
            body: String(doc.body ?? ""),
            verified: !!doc.verified,
            verifiedSource: String(doc.verifiedSource ?? ""),
            status: protectedReview ? (existing?.status ?? "") : String(doc.status ?? ""),
            wooStatus: String(doc.wooStatus ?? ""),
            createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : null,
            editedAt: doc.editedAt instanceof Date ? doc.editedAt.toISOString() : null,
            adminReply: protectedReview ? (existing?.adminReply ?? "") : String(doc.adminReply ?? ""),
            adminReplyDate: protectedReview ? (existing?.adminReplyDate ? new Date(existing.adminReplyDate).toISOString() : null) : doc.adminReplyDate instanceof Date ? doc.adminReplyDate.toISOString() : null,
            helpfulYes: (doc.helpfulYes as number | undefined) ?? null,
            helpfulNo: (doc.helpfulNo as number | undefined) ?? null,
          };
        })()
      : {
          sourceId: mapped.sourceId,
          productId: productLink.productId,
          productMatchMethod: productLink.matchMethod,
          author: mapped.author,
          email: mapped.email,
          isGuestReview: customerLink.isGuest,
          rating: 0, // never invented — this row has no rating and will not become a Review
          title: mapped.title,
          body: mapped.body,
          verified: false,
          verifiedSource: "",
          status: "",
          wooStatus: mapped.wooStatus,
          createdAt: mapped.createdDate || null,
          editedAt: mapped.editedDate || null,
          adminReply: mapped.adminReply,
          adminReplyDate: mapped.adminReplyDate || null,
          helpfulYes: mapped.helpfulYes ? Number(mapped.helpfulYes) : null,
          helpfulNo: mapped.helpfulNo ? Number(mapped.helpfulNo) : null,
        };

    return {
      row: rowIndex,
      sourceId: mapped.sourceId,
      isDuplicateInFile,
      existsInDb: !!existing,
      isProtected: protectedReview,
      willImport: classification === "review",
      classification,
      before: existing ? existingToSide(existing, productLink.matchMethod) : null,
      after,
      warnings,
    };
  });

  return { rows, totalRows, truncated: totalRows > PREVIEW_CAP };
}
