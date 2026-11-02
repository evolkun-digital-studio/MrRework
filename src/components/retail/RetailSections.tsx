"use client";
import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { NewsletterForm } from "@/components/NewsletterForm";

// Presentational sections for Settings > Retail Management content (see
// RetailSettings.ts) — each takes exactly the shape that model stores, so
// the admin form and this render side can never drift on field names.
// Bundled in one file (all small, all Retail-only) rather than six
// near-empty files, matching how e.g. src/components/admin/ui.tsx bundles
// several small primitives together.

export function RetailIntro({ intro }: { intro?: { heading?: string; description?: string; image?: string } | null }) {
  if (!intro || (!intro.heading && !intro.description && !intro.image)) return null;
  return (
    <section className="px-5 md:px-12 py-14 md:py-20">
      <div className="grid md:grid-cols-2 gap-8 md:gap-14 items-center max-w-[1200px] mx-auto">
        {intro.image && (
          <div className="relative aspect-[4/3] rounded-brand-lg overflow-hidden order-2 md:order-1">
            <Image src={intro.image} alt="" fill sizes="(max-width:768px) 100vw, 50vw" className="object-cover" />
          </div>
        )}
        <div className={intro.image ? "order-1 md:order-2" : ""}>
          {intro.heading && (
            <h2 className="font-display" style={{ fontWeight: 800, fontSize: "clamp(26px,3vw,42px)", letterSpacing: "-0.01em" }}>
              {intro.heading}
            </h2>
          )}
          {intro.description && <p className="mt-4 text-stone text-[15px] leading-relaxed">{intro.description}</p>}
        </div>
      </div>
    </section>
  );
}

export interface PromoBlockData {
  _id?: string; image?: string; heading?: string; description?: string;
  buttonText?: string; buttonUrl?: string; order?: number; enabled?: boolean;
}

export function RetailPromoBlocks({ blocks }: { blocks?: PromoBlockData[] }) {
  const visible = (blocks ?? []).filter((b) => b.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!visible.length) return null;
  return (
    <section className="px-5 md:px-12 py-14 md:py-20 space-y-10">
      {visible.map((block, i) => (
        <div key={block._id ?? i} className={`grid md:grid-cols-2 gap-8 items-center max-w-[1200px] mx-auto ${i % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""}`}>
          {block.image && (
            <div className="relative aspect-[16/10] rounded-brand-lg overflow-hidden">
              <Image src={block.image} alt="" fill sizes="(max-width:768px) 100vw, 50vw" className="object-cover" />
            </div>
          )}
          <div>
            {block.heading && (
              <h3 className="font-display" style={{ fontWeight: 700, fontSize: "clamp(22px,2.4vw,32px)", letterSpacing: "-0.01em" }}>{block.heading}</h3>
            )}
            {block.description && <p className="mt-3 text-stone text-[14px] leading-relaxed">{block.description}</p>}
            {block.buttonText && block.buttonUrl && (
              <Link href={block.buttonUrl} className="btn mt-6"><span>{block.buttonText}</span></Link>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

export interface TestimonialData {
  _id?: string; customerName?: string; designation?: string; review?: string;
  rating?: number; customerImage?: string; enabled?: boolean;
}

export function RetailTestimonials({ testimonials }: { testimonials?: TestimonialData[] }) {
  const visible = (testimonials ?? []).filter((t) => t.enabled !== false && t.review);
  if (!visible.length) return null;
  return (
    <section className="px-5 md:px-12 py-14 md:py-20">
      <div className="max-w-[1200px] mx-auto">
        <h2 className="font-display mb-8" style={{ fontWeight: 800, fontSize: "clamp(24px,2.6vw,36px)", letterSpacing: "-0.01em" }}>
          What customers say
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {visible.map((t, i) => (
            <div key={t._id ?? i} className="border border-line rounded-brand-lg p-6">
              <div className="flex gap-0.5 mb-3" aria-label={`${t.rating ?? 5} out of 5 stars`}>
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star key={s} size={13} className={s < (t.rating ?? 5) ? "fill-ink text-ink" : "text-line"} />
                ))}
              </div>
              <p className="text-[13.5px] text-ink-2 leading-relaxed">&ldquo;{t.review}&rdquo;</p>
              <div className="flex items-center gap-3 mt-5">
                {t.customerImage && (
                  <div className="relative w-9 h-9 rounded-full overflow-hidden shrink-0">
                    <Image src={t.customerImage} alt="" fill sizes="36px" className="object-cover" />
                  </div>
                )}
                <div>
                  <div className="text-[13px] font-medium">{t.customerName}</div>
                  {t.designation && <div className="text-[11.5px] text-stone">{t.designation}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function RetailNewsletter({ newsletter }: { newsletter?: { enabled?: boolean; heading?: string; description?: string; buttonText?: string } | null }) {
  if (!newsletter || !newsletter.enabled) return null;
  return (
    <section className="px-5 md:px-12 py-16 md:py-20 bg-ink text-paper text-center">
      <h2 className="font-display" style={{ fontWeight: 800, fontSize: "clamp(24px,2.6vw,36px)", letterSpacing: "-0.01em" }}>
        {newsletter.heading || "Stay in the loop"}
      </h2>
      {newsletter.description && <p className="mt-3 max-w-[480px] mx-auto text-[14px] text-paper/80">{newsletter.description}</p>}
      <NewsletterForm buttonText={newsletter.buttonText || "Subscribe →"} />
    </section>
  );
}
