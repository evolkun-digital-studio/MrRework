"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import Image from "next/image";
import { motion, useInView } from "framer-motion";
import { ArrowUp } from "lucide-react";

export type LuxuryPromoCard = {
  eyebrow: string;
  heading: string;
  /** Optional editorial photo — falls back to a warm gradient wash when omitted. */
  image?: string;
  imageAlt?: string;
  /** e.g. "center 30%" to keep a face/garment in frame on tall crops. */
  objectPosition?: string;
  /** Tailwind gradient classes used when `image` isn't supplied. */
  fallbackGradient?: string;
};

const DEFAULT_LEFT: LuxuryPromoCard = {
  eyebrow: "Breezy and Relaxed",
  heading: "Effortless Style",
  image: "https://pub-450f5976467a45eeba9242d8017260f7.r2.dev/wp-content/uploads/2026/05/Screenshot-2026-05-04-153933.webp",
  fallbackGradient: "from-[#EDE6DA] via-[#E2D6C4] to-[#D3C1A7]",
};

const DEFAULT_RIGHT: LuxuryPromoCard = {
  eyebrow: "Bold and Unique",
  heading: "Modern Edge",
  image: "https://pub-450f5976467a45eeba9242d8017260f7.r2.dev/wp-content/uploads/2026/05/Screenshot-2026-05-04-154904.webp",
  fallbackGradient: "from-[#3C2C21] via-[#2A1F18] to-[#1B140F]",
};

// Slow, editorial curves — image reveal/zoom uses the "brand" ease already
// used sitewide (OnStageSection etc.); the text block's fade-up entrance
// uses a slightly snappier out-curve per this section's own spec, so the
// two aren't conflated even though both read as "slow luxury" motion.
const EASE = [0.22, 1, 0.36, 1] as const;
const EASE_ENTRANCE = [0.16, 1, 0.3, 1] as const;

export function LuxuryPromoSection({
  left = DEFAULT_LEFT,
  right = DEFAULT_RIGHT,
}: {
  left?: LuxuryPromoCard;
  right?: LuxuryPromoCard;
}) {
  const sectionRef = useRef<HTMLElement>(null);

  return (
    <section ref={sectionRef} className="relative w-full py-10 md:py-16">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px h-auto md:h-[85vh] lg:h-[90vh]">
        <PromoCard {...left} />
        <PromoCard {...right} />
      </div>
      <ScrollToTopButton watchRef={sectionRef} />
    </section>
  );
}

function PromoCard({
  eyebrow,
  heading,
  image,
  imageAlt,
  objectPosition = "center",
  fallbackGradient,
}: LuxuryPromoCard) {
  const cardRef = useRef<HTMLDivElement>(null);
  const inView = useInView(cardRef, { once: true, margin: "-100px" });

  return (
    <div ref={cardRef} className="group relative h-[540px] md:h-full overflow-hidden bg-[#111]">
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 1.08 }}
        animate={inView ? { scale: 1 } : {}}
        transition={{ duration: 1.2, ease: EASE }}
      >
        <motion.div
          className="absolute inset-0"
          whileHover={{ scale: 1.06 }}
          transition={{ duration: 1.2, ease: EASE }}
        >
          {image ? (
            <Image
              src={image}
              alt={imageAlt || heading}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
              style={{ objectPosition }}
              priority={false}
            />
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${fallbackGradient || "from-neutral-300 to-neutral-700"}`} />
          )}
        </motion.div>
      </motion.div>

      {/* Bottom scrim — kept light (peaks at 28% black) so it reads as
          quiet-luxury color grading rather than a heavy overlay; text
          legibility comes mostly from the type weight/size below. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.12) 30%, rgba(0,0,0,0) 60%)" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
        transition={{ duration: 0.9, ease: EASE_ENTRANCE }}
        className="absolute left-6 bottom-6 md:left-10 md:bottom-10 right-6 md:right-16 z-10"
      >
        <span className="block mb-3 text-white/85 text-[11px] md:text-xs font-medium uppercase tracking-[0.14em]">
          {eyebrow}
        </span>
        <h2
          className="font-display text-white"
          style={{ fontWeight: 700, fontSize: "clamp(28px, 2.4vw, 48px)", lineHeight: 1.05, letterSpacing: "-0.01em" }}
        >
          {heading}
        </h2>
      </motion.div>
    </div>
  );
}

function ScrollToTopButton({ watchRef }: { watchRef: RefObject<HTMLElement | null> }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = watchRef.current;
    if (!el) return;
    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      // Show once the section has scrolled at least halfway past the top of the viewport.
      setVisible(rect.top < -200);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [watchRef]);

  return (
    <motion.button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Scroll to top"
      initial={false}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 12, pointerEvents: visible ? "auto" : "none" }}
      transition={{ duration: 0.3, ease: EASE }}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.95 }}
      className="fixed bottom-6 right-6 md:bottom-10 md:right-10 z-50 flex h-14 w-14 items-center justify-center
                 rounded-full bg-white text-black shadow-[0_6px_18px_rgba(0,0,0,0.15)] transition-shadow
                 hover:shadow-[0_8px_22px_rgba(0,0,0,0.2)]"
    >
      <ArrowUp className="h-5 w-5" strokeWidth={2.25} />
    </motion.button>
  );
}
