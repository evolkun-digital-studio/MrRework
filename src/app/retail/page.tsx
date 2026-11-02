import type { Metadata } from "next";
import { getCategories, getRetailSettings } from "@/lib/data";
import { SITE_URL, serializeJsonLd } from "@/lib/utils";
import ShopClient from "@/components/ShopClient";
import { RetailIntro, RetailPromoBlocks, RetailTestimonials, RetailNewsletter } from "@/components/retail/RetailSections";

const DEFAULT_DESCRIPTION = "Browse MrRework Retail — a dedicated collection curated separately from the main Shop.";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getRetailSettings();
  const seo = (settings?.seo as Record<string, string> | undefined) ?? {};
  const title = seo.seoTitle || "Retail";
  const description = seo.metaDescription || DEFAULT_DESCRIPTION;
  const canonical = seo.canonicalUrl || `${SITE_URL}/retail`;

  return {
    title,
    description,
    keywords: seo.metaKeywords || undefined,
    alternates: { canonical },
    openGraph: {
      title: seo.ogTitle || title,
      description: seo.ogDescription || description,
      url: canonical,
      siteName: "MrRework",
      type: "website",
      images: seo.ogImage ? [seo.ogImage] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.ogTitle || title,
      description: seo.ogDescription || description,
      images: seo.ogImage ? [seo.ogImage] : undefined,
    },
  };
}

export default async function RetailPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; collection?: string; brand?: string }>;
}) {
  const [categories, settings, sp] = await Promise.all([
    getCategories("retail"),
    getRetailSettings(),
    searchParams,
  ]);

  const intro = settings?.intro as Record<string, unknown> | undefined;
  const promoBlocks = settings?.promoBlocks as any[] | undefined;
  const testimonials = settings?.testimonials as any[] | undefined;
  const newsletter = settings?.newsletter as Record<string, unknown> | undefined;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Retail",
    description: DEFAULT_DESCRIPTION,
    url: `${SITE_URL}/retail`,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <div className="pt-32">
        <RetailIntro intro={intro as any} />
      </div>
      <ShopClient
        categories={categories}
        initialCategory={sp.category}
        initialBrand={sp.brand}
        initialCollection={sp.collection}
        productType="retail"
        heading="Retail"
        eyebrow={sp.collection ? "Retail collection" : "Retail catalogue"}
        topPadding={false}
      />
      <RetailPromoBlocks blocks={promoBlocks} />
      <RetailTestimonials testimonials={testimonials} />
      <RetailNewsletter newsletter={newsletter as any} />
    </>
  );
}
