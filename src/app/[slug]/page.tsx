import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageBySlug, getAllPageSlugs } from "@/lib/data";
import { sanitizeContentHtml } from "@/lib/sanitizeContent";
import { SITE_URL } from "@/lib/utils";
import { Frame } from "@/components/Frame";
import RichContent from "@/components/RichContent";

// Catch-all for CMS-driven static pages (Home, About, Contact, FAQ,
// Shipping, Returns, Privacy Policy, Terms, or any custom page imported by
// the Content & SEO Migration System). Next.js always resolves a static
// segment (e.g. /shop, /cart) over this dynamic one, so existing top-level
// routes are unaffected — this only ever matches a slug with no dedicated
// route of its own.

export async function generateStaticParams() {
  const slugs = await getAllPageSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) return { title: "Not found" };
  const title = page.seoTitle || page.title;
  const description = page.seoDescription || page.excerpt || undefined;
  return {
    title,
    description,
    // Same fallback as the blog post route — an admin-set canonicalUrl
    // still wins, but a page without one now still gets its own real URL
    // instead of no canonical tag at all.
    alternates: { canonical: page.canonicalUrl || `${SITE_URL}/${slug}` },
    robots: page.robots || undefined,
    openGraph: {
      title: page.ogTitle || title,
      description: page.ogDescription || description,
      images: page.ogImage || page.featuredImage ? [page.ogImage || page.featuredImage!] : [],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: page.twitterTitle || title,
      description: page.twitterDescription || description,
      images: page.twitterImage || page.ogImage || page.featuredImage ? [page.twitterImage || page.ogImage || page.featuredImage!] : [],
    },
  };
}

export default async function StaticPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) notFound();

  return (
    <div className="px-5 md:px-12 pt-32 pb-24 min-h-[70dvh] max-w-3xl mx-auto">
      <h1 className="display mb-8" style={{ fontSize: "clamp(30px,4.5vw,58px)" }}>{page.title}</h1>
      {page.featuredImage && (
        <div className="relative w-full aspect-[16/9] rounded-brand overflow-hidden bg-paper-2 mb-10">
          <Frame src={page.featuredImage} alt={page.title} />
        </div>
      )}
      <RichContent html={sanitizeContentHtml(page.content)} />
    </div>
  );
}
