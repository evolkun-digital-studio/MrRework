import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBlogPostBySlug, getAllBlogSlugs } from "@/lib/data";
import { sanitizeContentHtml } from "@/lib/sanitizeContent";
import { serializeJsonLd, SITE_URL } from "@/lib/utils";
import { Frame } from "@/components/Frame";
import RichContent from "@/components/RichContent";

export async function generateStaticParams() {
  const slugs = await getAllBlogSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) return { title: "Not found" };
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || undefined;
  return {
    title,
    description,
    // Falls back to this post's own URL when the admin hasn't set an
    // explicit canonical — previously left entirely unset in that case
    // (the common case: canonicalUrl is an opt-in override field), so most
    // posts had no canonical tag at all.
    alternates: { canonical: post.canonicalUrl || `${SITE_URL}/blog/${slug}` },
    robots: post.robots || undefined,
    openGraph: {
      title: post.ogTitle || title,
      description: post.ogDescription || description,
      images: post.ogImage || post.featuredImage ? [post.ogImage || post.featuredImage!] : [],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: post.twitterTitle || title,
      description: post.twitterDescription || description,
      images: post.twitterImage || post.ogImage || post.featuredImage ? [post.twitterImage || post.ogImage || post.featuredImage!] : [],
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seoDescription || post.excerpt,
    url: `${SITE_URL}/blog/${slug}`,
    ...(post.featuredImage && { image: [post.featuredImage] }),
    datePublished: post.publishedAt || post.createdAt,
    ...(post.authorName && { author: { "@type": "Person", name: post.authorName } }),
  };

  return (
    <div className="px-5 md:px-12 pt-32 pb-24 min-h-[70dvh] max-w-3xl mx-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      {post.categories?.length > 0 && (
        <div className="font-mono text-[11px] text-stone mb-3 uppercase tracking-wide">{post.categories.join(" · ")}</div>
      )}
      <h1 className="display mb-4" style={{ fontSize: "clamp(30px,4.5vw,58px)" }}>{post.title}</h1>
      <div className="font-mono text-[12px] text-stone mb-8">
        {post.authorName && <span>{post.authorName} · </span>}
        <span>{new Date(post.publishedAt || post.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
      </div>
      {post.featuredImage && (
        <div className="relative w-full aspect-[16/9] rounded-brand overflow-hidden bg-paper-2 mb-10">
          <Frame src={post.featuredImage} alt={post.title} />
        </div>
      )}
      <RichContent html={sanitizeContentHtml(post.content)} />
      {post.tags?.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-12 pt-8 border-t border-line">
          {post.tags.map((tag) => (
            <span key={tag} className="font-mono text-[11px] text-stone border border-line rounded-full px-3 py-1">{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}
