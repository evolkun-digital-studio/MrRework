import Image from "next/image";
import type { StaticImageData } from "next/image";
import Vintage from "@/assets/Vintage.png";
import Girl from "@/assets/Girl.png";
import Boy from "@/assets/Boy.png";
import Jacket from "@/assets/Jacket.png";
import Bag from "@/assets/Bag.png";
import Shorts from "@/assets/Shorts.png";
import Cap from "@/assets/Cap.png";
import Red from "@/assets/Red.png";

// CMS-ready shape — {type, url} only, so pointing `socials` at a fetched
// list later is a data-source swap, not a rewrite of this file. `url`
// accepts a remote string (what a future CMS/API will hand back) or a
// local StaticImageData import (what the hardcoded data below uses today).
export type SocialMediaItem = {
  type: "image" | "video";
  url: string | StaticImageData;
};

// Hardcoded per spec, reusing the same local campaign photography already
// used elsewhere on the site rather than introducing new placeholder
// imagery. No video asset exists in the repo yet — the "video" branch below
// is fully implemented and ready the moment one is added to this array.
const socials: SocialMediaItem[] = [
  { type: "image", url: Vintage },
  { type: "image", url: Girl },
  { type: "image", url: Jacket },
  { type: "image", url: Boy },
  { type: "image", url: Bag },
  { type: "image", url: Shorts },
  { type: "image", url: Cap },
  { type: "image", url: Red },
];

// Duplicated once — animate-marquee's keyframe (tailwind.config.ts) translates
// exactly 0 -> -50%, which is precisely "one full copy-width" when the track
// is two copies back-to-back, landing back on pixel-identical content with
// no visible jump/reset.
const track = [...socials, ...socials];

function SocialCard({ item, index }: { item: SocialMediaItem; index: number }) {
  return (
    <div
      className="group relative shrink-0 w-[150px] sm:w-[200px] md:w-[240px] lg:w-[260px] aspect-[3/4] overflow-hidden rounded-[16px] bg-paper-2 pointer-events-none select-none"
    >
      {item.type === "video" ? (
        <video
          src={typeof item.url === "string" ? item.url : undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <Image
          src={item.url}
          alt=""
          fill
          draggable={false}
          loading={index < 4 ? "eager" : "lazy"}
          sizes="(max-width:640px) 150px, (max-width:768px) 200px, (max-width:1024px) 240px, 260px"
          className="object-cover"
        />
      )}
    </div>
  );
}

// Full-bleed, infinitely-looping single-row media strip — a pure CSS marquee
// with zero interactive JS. Unlike CampaignMediaWall (which intentionally
// pauses on hover/out-of-view), this section must never pause: no hover
// state, no IntersectionObserver, no play/pause logic of any kind — the
// `animate-marquee` utility (linear, infinite, always running) is the only
// thing driving movement, and `pointer-events-none` + `select-none` +
// `draggable={false}` on every card rule out click/drag/touch interaction.
export function SocialsSection() {
  return (
    <section className="overflow-hidden bg-paper py-16 md:py-24">
      <div className="mb-10 px-5 text-center md:mb-14">
        <h2
          className="font-display text-ink"
          style={{ fontWeight: 500, fontSize: "clamp(28px,3.5vw,44px)", letterSpacing: "-0.01em", lineHeight: 1.1 }}
        >
          Socials
        </h2>
        <p className="mt-2 text-[12px] md:text-[13px] tracking-wide text-ink-2">Follow Us</p>
      </div>

      <div
        aria-hidden
        className="flex gap-2 md:gap-3 w-max animate-marquee [animation-duration:40s] md:[animation-duration:30s] pointer-events-none select-none"
        style={{ animationPlayState: "running" }}
      >
        {track.map((item, i) => (
          <SocialCard key={i} item={item} index={i} />
        ))}
      </div>
    </section>
  );
}
