import Link from "next/link";
import Image from "next/image";
import type { PromoBanner } from "@/lib/types";

// Two-card (or N-card, wrapping in pairs) campaign section — Milano-style
// reference: large rounded photo cards, bottom-anchored copy, pill CTA.
// Reuses the same overlay-scrim + pill-button idiom as OnStageSection
// (.btn/.btn-invert) rather than inventing new banner styling.
export function PromoBanners({ banners }: { banners: PromoBanner[] }) {
  if (banners.length === 0) return null;

  return (
    <section className="px-5 md:px-10 lg:px-16 xl:px-24 py-10 md:py-16">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
        {banners.map((banner) => (
          <PromoBannerCard key={banner._id} banner={banner} />
        ))}
      </div>
    </section>
  );
}

function PromoBannerCard({ banner }: { banner: PromoBanner }) {
  const overlay = Math.min(1, Math.max(0, banner.overlayOpacity ?? 0));

  return (
    <Link
      href={banner.buttonLink || "/shop"}
      className="group relative block h-[480px] md:h-[620px] overflow-hidden rounded-[24px] bg-paper-2"
    >
      {banner.desktopImage && (
        <Image
          src={banner.desktopImage}
          alt={banner.title}
          fill
          sizes="(max-width:768px) 100vw, 50vw"
          className="hidden md:block object-cover transition-transform duration-700 ease-brand group-hover:scale-[1.05]"
        />
      )}
      {(banner.mobileImage || banner.desktopImage) && (
        <Image
          src={banner.mobileImage || banner.desktopImage}
          alt={banner.title}
          fill
          sizes="100vw"
          className="block md:hidden object-cover transition-transform duration-700 ease-brand group-hover:scale-[1.05]"
        />
      )}

      {/* Base overlay — admin-configured opacity, for CTA readability. */}
      <div aria-hidden className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${overlay})` }} />
      {/* Slight extra darkening on hover, on top of the base overlay. */}
      <div aria-hidden className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500" />

      <div className="absolute inset-0 flex flex-col items-center justify-end text-center px-6 pb-12 md:pb-16">
        {banner.subtitle && (
          <span className="block mb-4 text-[11px] md:text-[12px] font-medium uppercase tracking-[0.14em] text-white/85">
            {banner.subtitle}
          </span>
        )}
        <h3
          className="font-display text-white"
          style={{ fontWeight: 700, fontSize: "clamp(28px,1.5vw,44px)", lineHeight: 1.05, letterSpacing: "-0.01em" }}
        >
          {banner.title}
        </h3>
        <span className="btn btn-invert mt-8">
          <span>{banner.buttonText || "Shop Now"}</span>
        </span>
      </div>
    </Link>
  );
}
