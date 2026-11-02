import { Schema, model, models, type Model } from "mongoose";

const BlogPostSchema = new Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    excerpt: { type: String, default: "" },
    content: { type: String, default: "" },
    featuredImage: { type: String, default: "" },
    author: { type: Schema.Types.ObjectId, ref: "User" },
    // Additive — a plain-text fallback so an imported post never loses its
    // byline just because its WordPress author couldn't be matched to a
    // real User account (mirrors Order/Review's "preserve the name even
    // when the ObjectId link fails" pattern).
    authorName: { type: String },
    categories: { type: [String], default: [] },
    tags: { type: [String], default: [], index: true },
    status: { type: String, enum: ["draft", "scheduled", "published"], default: "draft", index: true },
    // The WordPress post_status this document's `status` was last derived
    // from, at import/repair time — isProtectedContent() (wooContentMapping.ts)
    // reads this back to detect when an admin has manually overridden
    // `status` through the CMS since the last import, so a re-import/repair
    // never silently reverts a deliberate publish/unpublish decision.
    wooStatus: { type: String },
    // Additive — distinct from `status` (per the Content & SEO Migration
    // System's field list): a "published" post can still be `private`
    // (WordPress's own post_status) or password-protected, both of which
    // are about who can *see* it, not its lifecycle stage.
    visibility: { type: String, enum: ["public", "private", "password-protected"], default: "public" },
    publishedAt: { type: Date },
    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },

    // Additive — the fuller SEO field set the Content & SEO Migration
    // System needs (Yoast/RankMath/AIOSEO all expose these); `seoTitle`/
    // `seoDescription` above are untouched, matching the existing
    // Product/Category convention exactly. See ADMIN_CMS.md § SEO Extraction.
    canonicalUrl: { type: String },
    robots: { type: String },
    ogTitle: { type: String },
    ogDescription: { type: String },
    ogImage: { type: String },
    twitterTitle: { type: String },
    twitterDescription: { type: String },
    twitterImage: { type: String },
    focusKeyword: { type: String },
    // Raw schema.org/JSON-LD data a plugin exported, preserved verbatim —
    // this app doesn't render it anywhere yet, but nothing is lost. Named
    // `schemaData`, not `schema` — Mongoose Documents have their own
    // internal `.schema` property (the compiled Schema object itself); a
    // field literally named `schema` shadows it and corrupts Mongoose's own
    // machinery (confirmed directly: `.create()` throws inside Mongoose's
    // internals with this name).
    schemaData: { type: Schema.Types.Mixed },
    // Any recognized-SEO-plugin meta key this importer doesn't explicitly
    // map, preserved as a key->value bag — "store unsupported fields safely
    // without data loss," not silently dropped.
    unsupportedSeoMeta: { type: Schema.Types.Mixed },
    // Which plugin's data was actually used, if any — informational only.
    seoSource: { type: String, enum: ["yoast", "rankmath", "aioseo", "none"] },

    // Original WordPress identity, for idempotent re-import and
    // traceability — mirrors User/Order/Review's sourceSystem/sourceId.
    sourceSystem: { type: String },
    sourceId: { type: String },
  },
  { timestamps: true }
);

BlogPostSchema.index({ sourceSystem: 1, sourceId: 1 });

export const BlogPostModel: Model<any> = models.BlogPost || model("BlogPost", BlogPostSchema);
