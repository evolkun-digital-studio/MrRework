import type { Metadata } from "next";
import { HelpCentreFaq } from "@/components/HelpCentreFaq";
import { SITE_URL } from "@/lib/utils";

const description =
  "Everything you need to know about shopping, ordering, custom pieces, wholesale enquiries, and shipping with MrRework.";

export const metadata: Metadata = {
  title: "Help Centre — Frequently Asked Questions",
  description,
  alternates: { canonical: `${SITE_URL}/faq` },
  openGraph: { title: "Help Centre — Frequently Asked Questions", description, url: `${SITE_URL}/faq`, siteName: "MrRework", type: "website" },
  twitter: { card: "summary_large_image", title: "Help Centre — Frequently Asked Questions", description },
};

export default function FaqPage() {
  return (
    <div className="px-5 md:px-12 pt-32 pb-24 min-h-[70dvh]">
      <span className="eyebrow-accent">Help Centre</span>
      <h1 className="display mt-3 mb-6" style={{ fontSize: "clamp(34px,5.5vw,76px)" }}>
        Frequently Asked Questions
      </h1>
      <p className="max-w-[620px] text-[16px] text-ink-2 leading-relaxed mb-12 md:mb-16">
        {description}
      </p>
      <HelpCentreFaq />
    </div>
  );
}
