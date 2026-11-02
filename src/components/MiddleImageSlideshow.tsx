"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import type { StaticImageData } from "next/image";

const SLIDE_MS = 2000;

// Center column of the homepage's 3-image editorial gallery — the only
// piece of that section that's a Client Component (page.tsx and the
// left/right images stay server-rendered). Images are passed in as already-
// imported StaticImageData (see page.tsx), not fetched here, so there's no
// network request driving the cycle — just a plain interval flipping which
// pre-imported image is marked active.
export function MiddleImageSlideshow({ images, alt }: { images: StaticImageData[]; alt: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, SLIDE_MS);
    return () => clearInterval(id);
  }, [images.length]);

  return (
    <>
      {images.map((src, i) => (
        <Image
          key={i}
          src={src}
          alt={`${alt} ${i + 1}`}
          fill
          sizes="(max-width:768px) 100vw, 33vw"
          // Opacity-only crossfade — no slide/scale. The active slide sits
          // above the rest (z-index) so consecutive frames actually cross-
          // fade instead of the stack just reordering visibility.
          className="object-cover object-top md:object-center transition-opacity duration-[250ms] ease-in-out hover:scale-[1.03]"
          style={{
            opacity: i === index ? 1 : 0,
            zIndex: i === index ? 1 : 0,
            transitionProperty: "opacity, transform",
          }}
          priority={i === 0}
        />
      ))}
    </>
  );
}
