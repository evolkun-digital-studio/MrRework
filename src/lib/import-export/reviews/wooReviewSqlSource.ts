import { streamSqlTables } from "../sqlParser";

// Turns a WordPress/WooCommerce SQL dump's comment-based review tables into
// a stream of flat, CSV-shaped rows — one per product review — mirroring
// wooOrderSqlSource.ts's approach. WooCommerce stores a product review as an
// ordinary `wp_comments` row with `comment_type = "review"`; an admin's
// reply is a *separate* `wp_comments` row whose `comment_parent` is the
// review's own comment_ID. Blog comments (comment_type "" / "comment" /
// "pingback" / "trackback") are never collected — "Only import product
// reviews. Ignore blog comments" is enforced at the source-scan level, not
// downstream, so nothing about a blog comment is ever even held in memory.
//
// Required tables (per the task): wp_comments, wp_commentmeta. One more
// standard WordPress table pair is read opportunistically, purely to
// satisfy the task's PRODUCT LINKING priority order — degrades silently to
// "nothing found" if the dump doesn't include it:
//   - wp_posts + wp_postmeta (`post_type = "product"`, `_sku` meta) builds
//     an in-memory product post ID -> SKU/slug/name index, the same pattern
//     wooOrderSqlSource.ts already established for order line items. No
//     Product document is ever read from or written to here.
//
// No `server-only` guard, same reasoning as the other SQL sources: reused
// as-is by the standalone repair script (scripts/migrateWooReviews.ts).

export interface ProductIndexEntry { sku: string; slug: string; name: string }

/**
 * Pass 1 of 3: streams wp_posts/wp_postmeta once to build the product post
 * ID -> {sku, slug, name} index used for PRODUCT LINKING (see
 * wooReviewMapping.ts's resolveReviewProductLink).
 */
export async function collectProductIndex(filePath: string): Promise<Map<string, ProductIndexEntry>> {
  const titleById = new Map<string, string>();
  const slugById = new Map<string, string>();
  const skuById = new Map<string, string>();
  const productPostIds = new Set<string>();

  for await (const row of streamSqlTables(filePath, ["wp_posts", "wp_postmeta"])) {
    if (row.table === "wp_posts") {
      if (row.values["post_type"] !== "product") continue;
      const id = row.values["ID"];
      if (!id) continue;
      productPostIds.add(id);
      titleById.set(id, row.values["post_title"] ?? "");
      slugById.set(id, row.values["post_name"] ?? "");
      continue;
    }
    if (row.table === "wp_postmeta") {
      if (row.values["meta_key"] !== "_sku") continue;
      const postId = row.values["post_id"];
      if (!postId) continue;
      skuById.set(postId, row.values["meta_value"] ?? "");
    }
  }

  const index = new Map<string, ProductIndexEntry>();
  for (const id of productPostIds) {
    index.set(id, { sku: skuById.get(id) ?? "", slug: slugById.get(id) ?? "", name: titleById.get(id) ?? "" });
  }
  return index;
}

interface RawComment {
  id: string;
  postId: string;
  parent: string;
  type: string;
  approved: string;
  author: string;
  authorEmail: string;
  date: string;
  content: string;
  userId: string;
}

function readComment(row: Record<string, string | null>): RawComment {
  return {
    id: row["comment_ID"] ?? "",
    postId: row["comment_post_ID"] ?? "",
    parent: row["comment_parent"] ?? "0",
    type: row["comment_type"] ?? "",
    approved: row["comment_approved"] ?? "",
    author: row["comment_author"] ?? "",
    authorEmail: row["comment_author_email"] ?? "",
    date: row["comment_date"] ?? "",
    content: row["comment_content"] ?? "",
    userId: row["user_id"] ?? "0",
  };
}

// Meta keys this importer recognizes by exact name (rating/verified are
// WooCommerce core conventions); everything else relevant is detected by
// pattern (helpful-vote counters, an edited-date — neither has a single
// standard key across plugins, same "best-effort" posture as the Customer
// importer's newsletter detection).
const HELPFUL_YES_PATTERN = /helpful.*yes|yes.*helpful|helpful_count|vote_up/i;
const HELPFUL_NO_PATTERN = /helpful.*no|no.*helpful|unhelpful|vote_down/i;
const EDITED_DATE_PATTERN = /edited|modified/i;
const TITLE_PATTERN = /^(review_title|title)$/i;

export interface RawReviewMeta {
  rating: string;
  verified: string;
  title: string;
  editedAt: string;
  helpfulYes: string;
  helpfulNo: string;
}

/** Pass 2 of 3: streams wp_comments once, collecting only comment_type="review" rows. */
async function collectReviews(filePath: string): Promise<Map<string, RawComment>> {
  const reviews = new Map<string, RawComment>();
  for await (const row of streamSqlTables(filePath, ["wp_comments"])) {
    if (row.values["comment_type"] !== "review") continue;
    const comment = readComment(row.values);
    if (!comment.id) continue;
    reviews.set(comment.id, comment);
  }
  return reviews;
}

/**
 * Pass 3 of 3: one combined scan for the admin-reply search (any comment
 * whose parent is a known review ID, regardless of that reply's own
 * comment_type — WooCommerce doesn't consistently type admin replies) and
 * every relevant commentmeta key, scoped to review IDs only.
 */
async function collectRepliesAndMeta(
  filePath: string,
  reviewIds: Set<string>
): Promise<{ replyByReviewId: Map<string, RawComment>; metaByReviewId: Map<string, RawReviewMeta> }> {
  const replyByReviewId = new Map<string, RawComment>();
  const metaByReviewId = new Map<string, RawReviewMeta>();

  for await (const row of streamSqlTables(filePath, ["wp_comments", "wp_commentmeta"])) {
    if (row.table === "wp_comments") {
      const parent = row.values["comment_parent"] ?? "0";
      if (!reviewIds.has(parent)) continue;
      const reply = readComment(row.values);
      const existing = replyByReviewId.get(parent);
      if (!existing || reply.date > existing.date) replyByReviewId.set(parent, reply); // most recent reply wins
      continue;
    }

    if (row.table === "wp_commentmeta") {
      const commentId = row.values["comment_id"];
      const key = row.values["meta_key"];
      const value = row.values["meta_value"] ?? "";
      if (!commentId || !key || !reviewIds.has(commentId)) continue;

      const meta = metaByReviewId.get(commentId) ?? { rating: "", verified: "", title: "", editedAt: "", helpfulYes: "", helpfulNo: "" };
      if (key === "rating") meta.rating = value;
      else if (key === "verified") meta.verified = value;
      else if (TITLE_PATTERN.test(key)) meta.title = value;
      else if (EDITED_DATE_PATTERN.test(key)) meta.editedAt = value;
      else if (HELPFUL_YES_PATTERN.test(key)) meta.helpfulYes = value;
      else if (HELPFUL_NO_PATTERN.test(key)) meta.helpfulNo = value;
      metaByReviewId.set(commentId, meta);
    }
  }

  return { replyByReviewId, metaByReviewId };
}

export async function* streamReviewRows(filePath: string): AsyncGenerator<Record<string, string>> {
  const reviews = await collectReviews(filePath);
  const { replyByReviewId, metaByReviewId } = await collectRepliesAndMeta(filePath, new Set(reviews.keys()));
  // Resolved here (not left to the importer/mapping layer) for the same
  // reason wooOrderSqlSource.ts resolves each line item's SKU at the source
  // layer: ImporterModule.importRow only ever receives a mapped row + the
  // run context, never the original file path, so a full-file secondary
  // index like this one can only be built once, inside the row source
  // itself, before any row is yielded.
  const productIndex = await collectProductIndex(filePath);

  for (const [id, review] of reviews) {
    const meta = metaByReviewId.get(id) ?? { rating: "", verified: "", title: "", editedAt: "", helpfulYes: "", helpfulNo: "" };
    const reply = replyByReviewId.get(id);
    const product = productIndex.get(review.postId);

    yield {
      comment_ID: id,
      comment_post_ID: review.postId,
      comment_type: review.type,
      comment_approved: review.approved,
      comment_author: review.author,
      comment_author_email: review.authorEmail,
      comment_date: review.date,
      comment_content: review.content,
      user_id: review.userId,
      rating: meta.rating,
      verified: meta.verified,
      title: meta.title,
      edited_at: meta.editedAt,
      helpful_yes: meta.helpfulYes,
      helpful_no: meta.helpfulNo,
      product_sku: product?.sku ?? "",
      product_slug: product?.slug ?? "",
      product_name: product?.name ?? "",
      admin_reply: reply?.content ?? "",
      admin_reply_date: reply?.date ?? "",
    };
  }
}
