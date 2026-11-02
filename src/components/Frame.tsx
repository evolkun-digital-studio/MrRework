"use client";
import Image from "next/image";
import { useState } from "react";

/** Renders product imagery: a relative-fill next/image with object-cover.
 *  Falls back to a flat neutral panel only when there's genuinely no image
 *  (missing src, or a failed load), so a product without photography yet
 *  doesn't render broken/empty space.
 *
 *  While the image downloads, shows a subtle neutral pulse skeleton in its
 *  place, then fades the image in over ~280ms once loaded (see
 *  .animate-image-fade-in in globals.css). No layout shift either way,
 *  since every caller already renders Frame inside a fixed-aspect-ratio
 *  container and Frame itself fills that box via `fill`.
 *
 *  `showLoadingState` (default true) can be turned off for a second Frame
 *  stacked on top of a first one purely as a hover-swap image — that one is
 *  already invisible at rest via the caller's own opacity classes, and
 *  fading it in on load would make it flash visible before its own
 *  hover-driven opacity-0 rule ever gets a chance to apply. */
export function Frame({
  src, alt, className = "", priority = false, showLoadingState = true,
}: { src?: string; alt: string; tone?: number; className?: string; priority?: boolean; showLoadingState?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const pending = showLoadingState && !loaded;

  if (!src || failed) {
    return <div className={className} style={{ background: "#D9D9D9" }} aria-label={alt} role="img" />;
  }

  return (
    <>
      {pending && <div className={`${className} bg-paper-2 animate-pulse`} aria-hidden="true" />}
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width:1000px) 50vw, 25vw"
        className={loaded && showLoadingState ? `${className} animate-image-fade-in` : className}
        style={{ objectFit: "cover", opacity: pending ? 0 : undefined }}
        onError={() => setFailed(true)}
        onLoad={() => setLoaded(true)}
        priority={priority}
      />
    </>
  );
}
