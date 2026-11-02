"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { PromoMediaItem } from "@/lib/types";

// Cycled per-card aspect ratio so the row reads as an editorial contact
// sheet (varied heights) rather than a uniform product grid.
const ASPECT_CYCLE = ["aspect-[3/4]", "aspect-[4/5]", "aspect-square", "aspect-[4/5]"];

function MediaCard({ item, index }: { item: PromoMediaItem; index: number }) {
  return (
    <div
      className={`group relative shrink-0 w-[150px] sm:w-[190px] md:w-[220px] overflow-hidden rounded-[18px] bg-paper-2 ${ASPECT_CYCLE[index % ASPECT_CYCLE.length]}`}
    >
      {item.type === "video" ? (
        // preload="metadata" (not "none") — autoplay needs at least enough
        // buffered to start; "auto" would eagerly fetch the whole file for
        // every card in the row before the user ever scrolls this far,
        // which is the exact opposite of "optimize videos".
        <video
          src={item.url}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover transition-[transform,filter] duration-500 ease-brand group-hover:scale-[1.06] group-hover:brightness-110"
        />
      ) : (
        <Image
          src={item.url}
          alt=""
          fill
          loading="lazy"
          sizes="(max-width:768px) 50vw, 220px"
          className="object-cover transition-[transform,filter] duration-500 ease-brand group-hover:scale-[1.06] group-hover:brightness-110"
        />
      )}
    </div>
  );
}

// Full-bleed, infinitely-looping single-row editorial media wall. No
// hover-pause — the marquee keeps running while the cursor sits over it;
// the only pause is while the section is scrolled fully out of view (a real
// perf/battery concern for something that otherwise animates and plays
// video forever), driven purely by IntersectionObserver, never by mouse
// state.
export function CampaignMediaWall({ items }: { items: PromoMediaItem[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (items.length === 0) return null;

  // Duplicated once — the shared `animate-marquee` keyframe (tailwind.config.ts)
  // translates exactly 0 -> -50%, which is precisely "one full copy-width"
  // when the track is two copies back-to-back, landing back on
  // pixel-identical content with no visible jump.
  const track = [...items, ...items];

  return (
    <section ref={sectionRef} className="overflow-hidden bg-paper py-16 md:py-24">
      <div className="mb-10 px-5 text-center md:mb-14">
        <span className="eyebrow-accent mb-4 block">The Archive</span>
        <h2
          className="font-display text-ink"
          style={{ fontWeight: 800, fontSize: "clamp(28px,4vw,52px)", letterSpacing: "-0.01em", lineHeight: 1.05 }}
        >
          Mr Rework
        </h2>
      </div>

      <div
        className="flex gap-3 md:gap-4 w-max animate-marquee [animation-duration:44s] md:[animation-duration:34s]"
        style={{ animationPlayState: inView ? "running" : "paused" }}
      >
        {track.map((item, i) => (
          <MediaCard key={i} item={item} index={i} />
        ))}
      </div>
    </section>
  );
}
