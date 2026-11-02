import { getShopByCategory, getActivePromoBanners, getActivePromoMediaItems, getFeaturedReviews, getActiveShopTheLooks, getLuxuryPromoSection, getHomepageCollections, getBestSellingHomeProducts, getTrendingHomeProducts } from "@/lib/data";
import Link from "next/link";
import { HeroSlider } from "@/components/HeroSlider";
import { HomeProductRail } from "@/components/HomeProductRail";
import { BestSellingSection } from "@/components/BestSellingSection";
import { NewsletterForm } from "@/components/NewsletterForm";
import { FAQSection } from "@/components/FAQSection";
import { ShopByCategory } from "@/components/ShopByCategory";
import { PromoBanners } from "@/components/PromoBanners";
import { OnStageSection } from "@/components/OnStageSection";
import { CampaignMediaWall } from "@/components/CampaignMediaWall";
import { LuxuryPromoSection } from "@/components/LuxuryPromoSection";
import { HappyCustomersSection } from "@/components/HappyCustomersSection";
import { ShopTheLookSection } from "@/components/ShopTheLookSection";
import type { Product, PromoBanner, PromoMediaItem, FeaturedReview, ShopTheLook, LuxuryPromoSectionData, HomepageCollectionsData } from "@/lib/types";

export default async function HomePage() {
  let shopByCategory: Awaited<ReturnType<typeof getShopByCategory>> = {
    section: { enabled: true, title: "Shop by Category", subtitle: "Discover our collections", categories: [] },
    cards: [],
  };
  let promoBanners: PromoBanner[] = [];
  let promoMediaItems: PromoMediaItem[] = [];
  let featuredReviews: FeaturedReview[] = [];
  let shopTheLooks: ShopTheLook[] = [];
  let luxuryPromo: LuxuryPromoSectionData | null = null;
  let homepageCollections: HomepageCollectionsData | null = null;
  let featured: Product[] = [];
  try {
    [shopByCategory, promoBanners, promoMediaItems, featuredReviews, shopTheLooks, luxuryPromo, homepageCollections, featured] = await Promise.all([
      getShopByCategory(),
      getActivePromoBanners(),
      getActivePromoMediaItems(),
      getFeaturedReviews(),
      getActiveShopTheLooks(),
      getLuxuryPromoSection(),
      getHomepageCollections(),
      getBestSellingHomeProducts(),
    ]);
  } catch {
    // Keep the public storefront shell renderable during a transient database
    // outage (for example, a MongoDB TLS/Atlas connection interruption).
    // Product rails simply render empty states until the next request works.
  }

  // Trending depends on `featured` resolving first — it excludes those exact
  // products so the two homepage rails never repeat the same items.
  let arrivals: Product[] = [];
  try {
    arrivals = await getTrendingHomeProducts(featured.map((p) => p._id));
  } catch {
    // Same defensive fallback as above — the rail just renders empty.
  }

  const bestSelling = homepageCollections?.bestSelling;
  const trending = homepageCollections?.trending;

  // Curated display order, filtered against the live category list so a
  // card only appears when that category actually exists in the database
  // (same pattern as the old pill row's categoryPillOrder.ts).
  return (
    <>
      {/* HERO — coverflow-style product slider replacing the previous
          3-column copy/image/promo layout. */}
      <HeroSlider />

      {/* SHOP BY CATEGORY — plain static grid over the live category list
          (each Category's own admin-uploaded `image`, falling back to a
          local placeholder when unset). No carousel/rail — every category
          is visible immediately. */}
      <section className="pt-[20px] md:pt-[28px] pb-8 md:pb-12">
        {shopByCategory.section.enabled && shopByCategory.cards.length > 0 ? (
          <ShopByCategory title={shopByCategory.section.title} subtitle={shopByCategory.section.subtitle} categories={shopByCategory.cards} />
        ) : null}
      </section>

      {/* PROMOTIONAL BANNERS — admin-managed two-card campaign section,
          Admin -> Content -> Promotional Banners. Renders nothing when no
          active banners exist. */}
      <PromoBanners banners={promoBanners} />

      {/* BEST SELLING — pixel-match clone of a specific external reference
          (see BestSellingSection.tsx), so this one deliberately does NOT
          share the "Bestsellers" heading style/See-more-link pattern every
          other homepage rail uses. Products + title/subtitle/CTA admin-managed
          via Admin -> Content -> Homepage Collections; falls back to the
          component's own hardcoded defaults when nothing's been saved yet. */}
      <BestSellingSection
        products={featured}
        title={bestSelling?.title || undefined}
        subtitle={bestSelling?.subtitle || undefined}
        ctaEnabled={bestSelling?.ctaEnabled ?? true}
        ctaText={bestSelling?.ctaText || undefined}
        ctaHref={bestSelling?.ctaHref || "/bestsellers"}
      />

      {/* LUXURY CAMPAIGN — full-height 50/50 editorial banner (COS/Toteme-style),
          admin-managed via Admin -> Content -> Luxury Promo Section. Falls back
          to the component's own hardcoded defaults when nothing's been saved yet. */}
      <LuxuryPromoSection left={luxuryPromo?.left} right={luxuryPromo?.right} />

      {/* TRENDING — header matches BestSellingSection's centered
          title+subtitle treatment exactly (same weight/clamp/letter-spacing
          on the heading, same mt-3 subtitle style). Sits between the two
          promo banners as a visual breather. Title/subtitle/CTA admin-managed
          via Admin -> Content -> Homepage Collections. */}
      {arrivals.length > 0 && (
        <section className="px-5 md:px-8 lg:px-12 py-10 md:py-16">
          <div className="text-center mb-10 md:mb-12">
            <h2
              className="font-display text-ink"
              style={{ fontWeight: 700, fontSize: "clamp(32px,2.5vw,44px)", letterSpacing: "-0.01em" }}
            >
              {trending?.title || "Trending"}
            </h2>
            <p className="mt-3 text-[15px] md:text-[16px] text-ink-2">
              {trending?.subtitle || "The styles everyone's reaching for right now."}
            </p>
          </div>
          <HomeProductRail products={arrivals} />
          {(trending?.ctaEnabled ?? true) && (
            <div className="text-center mt-10 md:mt-12">
              <Link href={trending?.ctaHref || "/trending"} className="btn">
                <span>{trending?.ctaText || "View Products"}</span>
              </Link>
            </div>
          )}
        </section>
      )}

      {/* ON STAGE / OFF SCRIPT — full-bleed cinematic promo banner, sitting
          between the two product rails above and the brand-storytelling
          sections below as a visual
          breather, matching where this kind of lifestyle banner typically
          sits on a retail homepage. */}
      <OnStageSection />

      {/* SHOP THE LOOK — admin-managed editorial carousel with shoppable
          hotspots, Admin -> Content -> Shop The Look. See
          ShopTheLookSection.tsx. */}
      <ShopTheLookSection slides={shopTheLooks} />

      {/* HAPPY CUSTOMERS — admin-curated featured reviews, replaces the old
          New Arrivals rail in this slot. See HappyCustomersSection.tsx. */}
      <HappyCustomersSection reviews={featuredReviews} />

      {/* CAMPAIGN WALL — replaces the old stats/copy/single-image "Brand
          Story" section entirely with an infinitely-looping, two-row
          editorial media marquee. See CampaignMediaWall.tsx for the full
          design rationale. */}
      <CampaignMediaWall items={promoMediaItems} />

      {/* FAQ */}
      <FAQSection />


      {/* NEWSLETTER */}
      <Newsletter />
    </>
  );
}

function Newsletter() {
  return (
    <section className="text-center px-5 md:px-12 py-24 md:py-32 border-t border-line">
      <span className="eyebrow block mb-5">MrRework Newsletter</span>
      {/* Plain heading, not wrapped in ClipRise — same stuck-invisible risk
          as the other headings already fixed on this page. */}
      <h2
        className="font-display mx-auto"
        style={{
          fontWeight: 900,
          fontSize: "clamp(34px,3.5vw,96px)",
          lineHeight: 1.05,
          letterSpacing: "-0.01em",
          textTransform: "uppercase",
          color: "var(--ink)",
        }}
      >
        Be first to shop<br />vintage clothing drops
      </h2>
      <p className="max-w-[760px] mx-auto mt-10 text-[15px] md:text-[17px] leading-snug text-ink-2">Discover premium vintage clothing, branded jackets, denim, sportswear, and exclusive wholesale collections before anyone else.</p>
      <NewsletterForm variant="boxed" />
    </section>
  );
}
