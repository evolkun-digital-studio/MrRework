"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

interface FAQItem {
  q: string;
  a: string;
  // A couple of answers are themselves a short list (product types,
  // contact channels) rather than a single sentence/paragraph — kept as a
  // real <ul> instead of jamming line breaks into `a` so it reads (and is
  // announced by a screen reader) as a list, not one run-on sentence.
  bullets?: string[];
}

const CATEGORIES = [
  "General Questions",
  "Vintage, Reworked & Y2K Clothing",
  "Products & Quality",
  "Custom & Reworked Orders",
  "Wholesale Questions",
  "Orders & Payments",
  "Shipping & Delivery",
  "Returns & Support",
  "Sustainability",
  "Contact Us",
] as const;
type Category = (typeof CATEGORIES)[number];

const FAQ_DATA: Record<Category, FAQItem[]> = {
  "General Questions": [
    {
      q: "What is MrRework?",
      a: "MrRework is a fashion brand specializing in reworked, upcycled, vintage, and Y2K clothing. We create one-of-a-kind garments by transforming existing pieces into unique designs while also curating authentic vintage and Y2K collections.",
    },
    {
      q: "Do you only sell wholesale?",
      a: "No. MrRework serves both individual customers and wholesale buyers. We offer:",
      bullets: ["Retail purchases", "Limited-edition drops", "Custom and made-to-order pieces", "Wholesale vintage and reworked clothing for resellers and boutiques"],
    },
    {
      q: "Where is MrRework located?",
      a: "MrRework is based in India and ships products to customers worldwide.",
    },
    {
      q: "Is MrRework suitable for first-time buyers?",
      a: "Absolutely. Whether you're purchasing your first vintage piece, looking for unique Y2K fashion, or starting a resale business, our team is happy to assist you throughout the process.",
    },
  ],
  "Vintage, Reworked & Y2K Clothing": [
    {
      q: "What is reworked clothing?",
      a: "Reworked clothing refers to garments that have been creatively modified, reconstructed, or redesigned using existing materials. This process gives garments a second life while reducing fashion waste and creating unique pieces that cannot be mass-produced.",
    },
    {
      q: "What is upcycled fashion?",
      a: "Upcycled fashion involves transforming pre-existing garments or textiles into new products with improved design, quality, or functionality. It is one of the most sustainable approaches to fashion production.",
    },
    {
      q: "What is vintage clothing?",
      a: "Vintage clothing refers to pre-owned garments originating from previous fashion eras, typically between 20 and 100 years old. Vintage pieces are valued for their craftsmanship, uniqueness, and cultural significance.",
    },
    {
      q: "Why is Y2K fashion popular?",
      a: "Y2K fashion has become increasingly popular because of its bold aesthetics, nostalgic appeal, and individuality. Many customers appreciate Y2K fashion for its:",
      bullets: ["Unique silhouettes", "Rare designs", "Better garment quality", "Sustainable alternatives to fast fashion"],
    },
    {
      q: "Where can I buy vintage and reworked clothing online?",
      a: "MrRework offers curated collections of vintage apparel, reworked garments, upcycled pieces, Y2K fashion, and limited edition drops through our website and selected social channels.",
    },
  ],
  "Products & Quality": [
    {
      q: "What products do you offer?",
      a: "Our collections may include:",
      bullets: ["Vintage T-Shirts", "Y2K Clothing", "Reworked Denim", "Upcycled Jackets", "Hoodies & Sweatshirts", "Workwear", "Cargo Pants", "Jerseys", "Sportswear", "Custom reconstructed garments", "Handmade one-of-a-kind pieces"],
    },
    {
      q: "Which brands do you stock?",
      a: "Depending on availability, we may source garments originally produced by brands such as Levi's, Carhartt, Nike, Adidas, Harley-Davidson, Ralph Lauren, Tommy Hilfiger, The North Face, Dickies, Champion, and many others.",
    },
    {
      q: "Are all items authentic?",
      a: "We source garments carefully and inspect products before sale. As many items are vintage and pre-owned, customers requiring brand authentication are encouraged to conduct independent verification where necessary.",
    },
    {
      q: "Why might products differ slightly from photographs?",
      a: "Many MrRework products are handmade, reconstructed, or vintage. Minor differences in the following are considered part of the uniqueness of each piece:",
      bullets: ["Stitching", "Fabric placement", "Distressing", "Colour tones", "Wash patterns"],
    },
    {
      q: "Can I request additional photos or measurements?",
      a: "Yes. Our team can provide the following before purchase:",
      bullets: ["Additional photographs", "Measurements", "Close-up condition images", "Product videos (where available)"],
    },
  ],
  "Custom & Reworked Orders": [
    {
      q: "Do you make custom pieces?",
      a: "Yes. Depending on availability and project requirements, MrRework may offer:",
      bullets: ["Custom reworked garments", "Personalized modifications", "Made-to-order pieces", "Exclusive designs"],
    },
    {
      q: "Can I request specific brands or styles?",
      a: "Yes. For wholesale customers and special projects, we may accommodate custom sourcing requests depending on inventory availability.",
    },
  ],
  "Wholesale Questions": [
    {
      q: "Do you offer wholesale?",
      a: "Yes. We work with:",
      bullets: ["Vintage resellers", "Boutiques", "Online stores", "Creative retailers", "Fashion businesses worldwide"],
    },
    {
      q: "What is the minimum order quantity (MOQ)?",
      a: "Minimum order quantities vary depending on product categories and stock availability. Please contact our team for current wholesale requirements.",
    },
    {
      q: "Do you offer handpick sessions?",
      a: "Yes. Selected wholesale customers may request the following, subject to availability:",
      bullets: ["In-person handpick sessions", "Remote handpick appointments", "WhatsApp or video-call selections"],
    },
  ],
  "Orders & Payments": [
    {
      q: "How can I place an order?",
      a: "Orders can be placed:",
      bullets: ["Directly through our website", "Through our customer support team", "Via wholesale enquiries", "Through WhatsApp communication where applicable"],
    },
    {
      q: "Which payment methods do you accept?",
      a: "We accept various secure payment methods, including:",
      bullets: ["Credit & Debit Cards", "Bank Transfers", "Approved Digital Payment Methods"],
    },
    {
      q: "Can I modify or cancel my order?",
      a: "Order changes may be possible if the order has not yet entered production or shipping — please contact us immediately after placing your order. Custom and made-to-order products generally cannot be cancelled once production begins.",
    },
  ],
  "Shipping & Delivery": [
    {
      q: "Do you ship internationally?",
      a: "Yes. MrRework ships worldwide using trusted logistics partners.",
    },
    {
      q: "How long does shipping take?",
      a: "Estimated delivery times (may vary due to customs procedures or courier delays):",
      bullets: ["India: 2–7 business days", "UK & Europe: 5–10 business days", "USA & Canada: 7–14 business days", "Other International Destinations: 5–14 business days"],
    },
    {
      q: "Will I receive tracking information?",
      a: "Yes. Tracking information is provided once your order has been dispatched.",
    },
    {
      q: "Are customs duties included?",
      a: "Custom duties, import taxes, and local fees are generally the responsibility of the customer unless otherwise agreed. We recommend checking local import regulations before ordering.",
    },
  ],
  "Returns & Support": [
    {
      q: "Can I return my order?",
      a: "Due to the unique nature of vintage and reworked products, all sales are generally considered final. Returns may only be accepted if:",
      bullets: ["Incorrect items were received", "Significant undisclosed damage exists", "The shipment is officially confirmed as lost"],
    },
    {
      q: "What should I do if there is a problem with my order?",
      a: "Please contact us within 48 hours of delivery and provide the following — our team will investigate and assist as quickly as possible:",
      bullets: ["Order number", "Clear photographs", "Unboxing video (recommended)"],
    },
  ],
  Sustainability: [
    {
      q: "Why does MrRework focus on reworked and upcycled fashion?",
      a: "We believe fashion should be more sustainable. By extending the life of existing garments, we help:",
      bullets: ["Reduce textile waste", "Encourage conscious consumption", "Promote individuality", "Reduce reliance on mass production"],
    },
  ],
  "Contact Us": [
    {
      q: "How can I contact MrRework?",
      a: "You can reach us through email, Instagram, our website contact form, or WhatsApp where available. Our team aims to respond to all enquiries within 24–48 business hours.",
      bullets: ["Website: https://mrrework.com", "Email: support@mrrework.com", "Instagram: https://www.instagram.com/scrap.mafia"],
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
        className="flex w-full items-center justify-between gap-6 py-6 text-left md:py-7"
      >
        <span
          className={`font-display text-[16px] md:text-[18px] transition-colors duration-300 ease-brand ${isOpen ? "text-green" : "text-ink group-hover:text-green"}`}
          style={{ fontWeight: 600 }}
        >
          {item.q}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={1.75}
          className={`shrink-0 transition-[transform,color] duration-300 ease-brand ${isOpen ? "rotate-180 text-green" : "rotate-0 text-stone group-hover:text-ink"}`}
        />
      </button>

      <div
        className="overflow-hidden transition-[max-height,opacity,padding-bottom] duration-500 ease-brand"
        style={{
          maxHeight: isOpen ? height + ANSWER_PADDING : 0,
          opacity: isOpen ? 1 : 0,
          paddingBottom: isOpen ? ANSWER_PADDING : 0,
        }}
      >
        <div ref={answerRef} className="max-w-[680px] text-[14.5px] leading-loose text-ink-2">
          <p>{item.a}</p>
          {item.bullets && (
            <ul className="mt-3 space-y-1.5">
              {item.bullets.map((b) => (
                <li key={b} className="relative pl-4">
                  <span className="absolute left-0 top-[0.65em] h-[5px] w-[5px] rounded-full bg-ink" />
                  {b}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function HelpCentreFaq() {
  const [activeCategory, setActiveCategory] = useState<Category>(CATEGORIES[0]);
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  function selectCategory(cat: Category) {
    setActiveCategory(cat);
    setOpenIndex(0);
  }

  function toggleRow(i: number) {
    setOpenIndex((current) => (current === i ? null : i));
  }

  return (
    <div>
      {/* Same horizontal-scroll pattern as the homepage's Categories/FAQ
          selectors — a bare overflow-x-auto/no-scrollbar wrapper, so 8
          category tabs never wrap at any breakpoint. */}
      <div className="overflow-x-auto no-scrollbar">
        <div className="flex w-max flex-nowrap items-center gap-8 border-b border-line md:gap-10">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => selectCategory(cat)}
              aria-pressed={activeCategory === cat}
              className={`relative pb-4 text-[12.5px] uppercase tracking-[0.08em] whitespace-nowrap transition-colors duration-300 ease-brand after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-left after:bg-green after:transition-transform after:duration-300 after:ease-brand after:content-[''] ${
                activeCategory === cat ? "text-ink after:scale-x-100" : "text-stone hover:text-ink after:scale-x-0"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10 max-w-[820px] divide-y divide-line border-t border-b border-line md:mt-12">
        {FAQ_DATA[activeCategory].map((item, i) => (
          <FAQRow key={`${activeCategory}-${i}`} item={item} isOpen={openIndex === i} onToggle={() => toggleRow(i)} />
        ))}
      </div>
    </div>
  );
}
