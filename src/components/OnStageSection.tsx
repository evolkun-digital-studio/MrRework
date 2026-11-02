"use client";
import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";

// Full-bleed cinematic promo banner — same fade-up entrance pattern as
// Reveal.tsx (whileInView, once: true) but inlined here rather than reusing
// that component directly, since this section also needs a scroll-linked
// parallax on the background image itself (useScroll+useTransform), which
// Reveal doesn't do and isn't worth generalizing it for a single caller.
export function OnStageSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  // Subtle — the background drifts ~8% of its own height across the
  // section's scroll range, plus a slow Ken-Burns zoom from 1 -> 1.08.
  const parallaxY = useTransform(scrollYProgress, [0, 1], ["-6%", "6%"]);
  const zoom = useTransform(scrollYProgress, [0, 1], [1, 1.08]);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden min-h-[520px] h-[68vh] md:h-[72vh] max-h-[750px] flex items-center justify-center"
    >
      <motion.div aria-hidden className="absolute inset-0" style={{ y: parallaxY, scale: zoom }}>
        <Image
          src="https://pub-450f5976467a45eeba9242d8017260f7.r2.dev/wp-content/uploads/2026/04/cvcvcvvcv.webp"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-center"
        />
      </motion.div>

      {/* Dark overlay for text readability — 50% flat black per spec's
          45-55% range. */}
      <div aria-hidden className="absolute inset-0 bg-black/50" />

      <motion.div
        initial={{ y: 32, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center text-center px-6 max-w-2xl mx-auto"
      >
        <span className="eyebrow-accent-invert block mb-5"></span>
        <h2
          className="font-display text-white uppercase"
          style={{
            fontWeight: 800,
            fontSize: "clamp(32px,5.5vw,68px)",
            lineHeight: 1.02,
            letterSpacing: "-0.02em",
          }}
        >
          On Stage / Off Script
        </h2>
        <p className="mt-6 text-[15px] md:text-[17px] leading-relaxed text-white/80 max-w-md">
          Tailored Disruption Worn Without Hesitation
        </p>
        <Link href="/shop" className="btn btn-invert mt-10">
          <span>Shop Now</span>
        </Link>
      </motion.div>
    </section>
  );
}
