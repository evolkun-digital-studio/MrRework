"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ArrowRight } from "lucide-react";

interface FAQItem {
  q: string;
  a: ReactNode;
}

const CATEGORIES = ["MrRework", "Reworked & Vintage", "Shipping", "Orders & Support"] as const;
type Category = (typeof CATEGORIES)[number];

const FAQ_DATA: Record<Category, FAQItem[]> = {
  "MrRework": [
    {
      q: "What is MrRework?",
      a: "MrRework is a fashion brand specializing in reworked, upcycled, vintage, and Y2K clothing. We create unique garments by giving existing pieces a new life through reconstruction and creative design.",
    },
    {
      q: "What makes MrRework different?",
      a: "Every piece at MrRework is carefully curated or reworked to ensure individuality. We focus on sustainability, limited pieces, and one-of-a-kind fashion that stands apart from mass-produced clothing.",
    },
    {
      q: "What products does MrRework offer?",
      a: (
        <ul className="space-y-2 pl-5">
          <li>Reworked garments</li>
          <li>Upcycled fashion</li>
          <li>Vintage clothing</li>
          <li>Y2K apparel</li>
          <li>Handmade one-of-a-kind pieces</li>
          <li>Limited edition collections</li>
          <li>Selected wholesale products</li>
        </ul>
      ),
    },
    {
      q: "Who can shop at MrRework?",
      a: "Everyone. We cater to individual customers, collectors, fashion enthusiasts, resellers, boutiques, and wholesale buyers worldwide.",
    },
  ],
  "Reworked & Vintage": [
    {
      q: "What is reworked clothing?",
      a: "Reworked clothing refers to garments that have been creatively modified, reconstructed, or redesigned using existing materials to create entirely new pieces.",
    },
    {
      q: "Are all products unique?",
      a: "Yes. Due to the nature of vintage and reworked fashion, most products are one-of-a-kind and may not be restocked once sold out.",
    },
    {
      q: "Do you offer custom pieces?",
      a: "Depending on availability, we may offer custom-made and personalized reworked garments. Please contact our team for custom enquiries.",
    },
    {
      q: "Which brands are available?",
      a: "Depending on stock availability, we may source pieces originally produced by brands such as Levi's, Carhartt, Nike, Adidas, Harley-Davidson, Ralph Lauren, Tommy Hilfiger, The North Face, Champion, and more.",
    },
  ],
  Shipping: [
    {
      q: "Do you ship internationally?",
      a: "Yes. We ship worldwide through trusted logistics partners.",
    },
    {
      q: "How long does delivery take?",
      a: (
        <ul className="space-y-2 pl-5">
          <li>India: 2-7 Business Days</li>
          <li>UK & Europe: 5-10 Business Days</li>
          <li>USA & Canada: 7-14 Business Days</li>
          <li>Other Countries: 5-14 Business Days</li>
        </ul>
      ),
    },
    {
      q: "Can I track my order?",
      a: "Yes. Tracking details are provided once your order has been dispatched.",
    },
  ],
  "Orders & Support": [
    {
      q: "How can I place an order?",
      a: "Orders can be placed directly through our website. For wholesale or custom enquiries, please contact our team.",
    },
    {
      q: "What payment methods do you accept?",
      a: "We accept secure payment methods including debit cards, credit cards, bank transfers, and selected digital payment options.",
    },
    {
      q: "Can I return my order?",
      a: "Due to the unique nature of reworked and vintage garments, all sales are generally considered final. Please refer to our Return Policy for complete information.",
    },
    {
      q: "How can I contact your team?",
      a: (
        <div className="space-y-2">
          <p>Website: https://mrrework.com</p>
          <p>Email: support@mrrework.com</p>
          <p>Instagram: @scrap.mafia</p>
        </div>
      ),
    },
  ],
};

// Vertical padding applied to the answer while open — kept as a single flat
// value (rather than a responsive md: pair) because it has to be folded into
// the max-height budget below; a value that changed per breakpoint would
// need a matching breakpoint-aware max-height calculation to avoid clipping
// or extra blank space.
const ANSWER_PADDING = 32;

function FAQRow({ item, isOpen, onToggle }: { item: FAQItem; isOpen: boolean; onToggle: () => void }) {
  const answerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  // Same measured-height pattern as WholesaleEditorial — no fixed max-height,
  // so the expand/collapse motion stays smooth and proportional regardless
  // of how long any given answer is.
  useLayoutEffect(() => {
    const el = answerRef.current;
    if (!el) return;
    const measure = () => setHeight(el.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="group">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-6 py-5 text-left md:py-6"
      >
        <span
          className={`font-display uppercase text-[13px] md:text-[14px] tracking-[0.04em] transition-colors duration-300 ease-brand ${isOpen ? "text-green" : "text-white group-hover:text-green"}`}
          style={{ fontWeight: 600 }}
        >
          {item.q}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={1.75}
          className={`shrink-0 transition-[transform,color] duration-300 ease-brand ${isOpen ? "rotate-180 text-green" : "rotate-0 text-white/50 group-hover:text-white"}`}
        />
      </button>

      {/* Height, opacity AND bottom padding all animate together — the
          max-height budget includes the padding so it never clips the text
          or leaves a gap once fully open. */}
      <div
        className="overflow-hidden transition-[max-height,opacity,padding-bottom] duration-500 ease-brand"
        style={{
          maxHeight: isOpen ? height + ANSWER_PADDING : 0,
          opacity: isOpen ? 1 : 0,
          paddingBottom: isOpen ? ANSWER_PADDING : 0,
        }}
      >
        <div ref={answerRef} className="max-w-[640px] text-[14px] leading-loose text-white/60">
          {item.a}
        </div>
      </div>
    </div>
  );
}

export function FAQSection() {
  const [activeCategory, setActiveCategory] = useState<Category>(CATEGORIES[0]);
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  function selectCategory(cat: Category) {
    setActiveCategory(cat);
    setOpenIndex(0); // first question of the newly selected tab opens by default
  }

  function toggleRow(i: number) {
    setOpenIndex((current) => (current === i ? null : i));
  }

  return (
    <section className="bg-ink px-5 py-20 md:px-12 md:py-28">
      <div className="mx-auto max-w-[1200px]">
        <h2 className="font-display uppercase text-white" style={{ fontWeight: 700, fontSize: "clamp(30px,5vw,52px)", lineHeight: 1, letterSpacing: "-0.01em" }}>
          FAQs - MrRework
        </h2>

        {/* Category buttons — one per FAQ section, switching which list of
            questions shows below, rather than every category's questions
            stacked on the page at once. Same horizontal-scroll pattern as
            the Categories carousel so the tabs never wrap, at any
            breakpoint. */}
        <div className="mt-10 overflow-x-auto no-scrollbar md:mt-14">
          <div className="flex w-max flex-nowrap items-center gap-8 border-b border-white/15 md:gap-10">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => selectCategory(cat)}
                aria-pressed={activeCategory === cat}
                className={`relative pb-4 text-[12.5px] uppercase tracking-[0.08em] transition-colors duration-300 ease-brand after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-left after:bg-green after:transition-transform after:duration-300 after:ease-brand after:content-[''] ${
                  activeCategory === cat ? "text-white after:scale-x-100" : "text-white/50 hover:text-white after:scale-x-0"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 divide-y divide-white/15 border-t border-b border-white/15 md:mt-14">
          {FAQ_DATA[activeCategory].map((item, i) => (
            <FAQRow key={`${activeCategory}-${i}`} item={item} isOpen={openIndex === i} onToggle={() => toggleRow(i)} />
          ))}
        </div>

        {/* Points to the full Help Centre (src/app/faq/page.tsx) — this
            section only ever shows these 4 curated categories/questions,
            the dedicated page covers the full 8-category question set. */}
        <div className="mt-10 md:mt-12">
          <Link
            href="/faq"
            className="group inline-flex items-center gap-2 text-[13px] uppercase tracking-[0.08em] text-white transition-colors duration-300 ease-brand hover:text-green"
          >
            View all FAQs
            <ArrowRight size={15} className="transition-transform duration-300 ease-brand group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
