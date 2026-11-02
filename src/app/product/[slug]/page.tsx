import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductBySlug, getAllSlugs } from "@/lib/data";
import { sanitizeContentHtml } from "@/lib/sanitizeContent";
import { normalizeEscapedWhitespace } from "@/lib/normalizeContentWhitespace";
import { serializeJsonLd, SITE_URL } from "@/lib/utils";
import ProductDetail from "@/components/ProductDetail";

export async function generateStaticParams() {
  const slugs = await getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProductBySlug(slug);
  if (!data) return { title: "Not found" };
  const { product } = data;
  const url = `${SITE_URL}/product/${product.slug}`;
  const image = product.images?.[0] ? [product.images[0]] : [];
  return {
    title: product.name,
    description: product.description,
    alternates: { canonical: url },
    openGraph: {
      title: product.name,
      description: product.description,
      url,
      images: image,
      siteName: "MrRework",
      type: "website",
    },
    // Root layout sets a generic site-wide twitter card, but Next only
    // inherits fields a child doesn't specify — since this page's own
    // metadata omits `twitter` entirely today, every product page shares
    // the exact same generic "MrRework" card when shared on Twitter/X
    // instead of that product's own name/description/photo.
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description: product.description,
      images: image,
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getProductBySlug(slug);
  if (!data) notFound();
  const { product, related } = data;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: product.sku,
    image: product.images ?? [],
    url: `${SITE_URL}/product/${product.slug}`,
    brand: { "@type": "Brand", name: "MrRework" },
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/product/${product.slug}`,
      price: product.price,
      priceCurrency: product.currency,
      availability: product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
    ...(product.reviewCount > 0 && {
      aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating, reviewCount: product.reviewCount },
    }),
  };

  // Product.description is imported verbatim from WooCommerce (real HTML,
  // same untrusted-external-source situation as Blog/Page content) —
  // sanitized here at the render boundary with the same sanitizeContentHtml()
  // used for Blog/Page, then rendered as real HTML (not escaped text) in
  // ProductDetail. normalizeEscapedWhitespace() runs first to turn literal
  // escaped whitespace (see src/lib/normalizeContentWhitespace.ts) into real
  // <br> line breaks — a separate concern from HTML sanitization, so the
  // sanitizer itself (shared with Blog/Page) is untouched.
  const descriptionHtml = sanitizeContentHtml(normalizeEscapedWhitespace(product.description || ""));

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <ProductDetail product={product} related={related} descriptionHtml={descriptionHtml} />
    </>
  );
}
