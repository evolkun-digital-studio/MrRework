import { Schema, model, models, type Model } from "mongoose";

// A CMS-editable static page (Home, About, Contact, FAQ, Shipping, Returns,
// Privacy Policy, Terms, or any custom page) — this model didn't exist
// before the Content & SEO Migration System; every one of those routes was
// either absent or hardcoded JSX, never database-driven. Deliberately
// mirrors BlogPost's shape (content/excerpt/featuredImage/status/SEO) and
// Category's `parent` self-ref (for page hierarchy, e.g. "Shipping" nested
// under a "Help" page) rather than inventing a third pattern.
const PageSchema = new Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    content: { type: String, default: "" },
    excerpt: { type: String, default: "" },
    featuredImage: { type: String, default: "" },
    author: { type: Schema.Types.ObjectId, ref: "User" },
    authorName: { type: String },

    // Nesting — null for a top-level page. `order` breaks ties for menu
    // display, same role as Category.order.
    parent: { type: Schema.Types.ObjectId, ref: "Page", default: null, index: true },
    order: { type: Number, default: 0 },

    status: { type: String, enum: ["draft", "scheduled", "published"], default: "draft", index: true },
    // See BlogPost.ts's identical field — read back by isProtectedContent()
    // so a re-import/repair never silently reverts a manual status override.
    wooStatus: { type: String },
    visibility: { type: String, enum: ["public", "private", "password-protected"], default: "public" },
    publishedAt: { type: Date },

    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },
    canonicalUrl: { type: String },
    robots: { type: String },
    ogTitle: { type: String },
    ogDescription: { type: String },
    ogImage: { type: String },
    twitterTitle: { type: String },
    twitterDescription: { type: String },
    twitterImage: { type: String },
    focusKeyword: { type: String },
    // See BlogPost.ts's identical field for why this is `schemaData`, not
    // `schema` (Mongoose Document's own internal property of that name).
    schemaData: { type: Schema.Types.Mixed },
    unsupportedSeoMeta: { type: Schema.Types.Mixed },
    seoSource: { type: String, enum: ["yoast", "rankmath", "aioseo", "none"] },

    sourceSystem: { type: String },
    sourceId: { type: String },
  },
  { timestamps: true }
);

PageSchema.index({ sourceSystem: 1, sourceId: 1 });

export const PageModel: Model<any> = models.Page || model("Page", PageSchema);
