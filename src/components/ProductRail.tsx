"use client";
import ProductCard from "./ProductCard";
import { RAIL_GAP_CLASS, RAIL_ITEM_WIDTH_CLASS, RAIL_BLEED_CLASS, RAIL_PADDING_CLASS } from "@/lib/productRailLayout";
import type { Product } from "@/lib/types";

// Prev/next arrows for the homepage's product rails ("Shop Vintage
// Bestsellers" and "Trending" in page.tsx) — one implementation so both stay
// pixel-identical instead of drifting apart the way two independently-styled
// rails did before. Pure native scrolling (overflow-x + CSS scroll-snap, no
// carousel library and none was added, no hand-rolled touch/drag JS either
// — see below for why); data (`products`) is fetched server-side in
// page.tsx and passed in unchanged, this component only handles the
// interactive rail.
//
// Touch handling: earlier versions of this file drove the rail's scrollLeft
// manually from onPointerDown/Move/Up handlers (to hand-roll drag + momentum
// + snap), which is exactly backwards for mobile feel — it opts every touch
// gesture out of the browser's native, compositor-threaded scroll physics
// (the thing that gives Zara/Nike/Apple/COS-style rails their effortless
// feel) in favor of a main-thread rAF loop that can only ever approximate
// it, and in practice read as laggy/sticky/"needs excessive force" no matter
// how much the approximation was tuned. There is nothing left to hand-roll:
// this is a plain horizontally-scrolling div with CSS scroll-snap, so the
// browser's own touch scrolling — real momentum, 60fps off the main thread,
// GPU-accelerated — drives the whole gesture.
//
// Layout note: the negative-margin "bleed" that cancels the parent
// <section>'s own px-5 md:px-12 lives on THIS OUTER wrapper, not on the
// rail — the fade masks are `position: absolute` against this wrapper, so
// they need to share the rail's true-viewport coordinate space. Putting the
// bleed only on the rail (an earlier version of this file) left the wrapper
// itself inset by the section's own padding while the rail bled past it —
// meaning left-0/right-0 on the fade resolved to the *wrapper's* inset edge,
// which is exactly where the first/last card also starts, so it covered
// real card content. Confirmed via direct getBoundingClientRect()
// measurement, not assumed.
export function ProductRail({ products }: { products: Product[] }) {
  return (
    <div className={`relative ${RAIL_BLEED_CLASS}`}>
      <div
        // No touch-action override here (left at its default `auto`) — that
        // default is exactly what lets a single finger swipe feel native:
        // the browser looks at which axis this element can actually scroll
        // (horizontal, since overflow-y is hidden below) and drives that
        // axis itself off the compositor thread, while a vertical/diagonal
        // swipe is recognized as belonging to the page and handed off
        // immediately with zero JS in the loop. An earlier version set
        // `touch-action: pan-y` here specifically to turn OFF the browser's
        // native horizontal panning (so a hand-rolled JS drag handler could
        // take over instead) — that was the root cause of the "hard to
        // swipe"/sticky feel this rework removes; there's no reason left to
        // ever disable native panning on a plain scrollable div.
        //
        // Explicit overflow-y-hidden, not left to default: per the CSS
        // overflow spec, an axis left at `visible` while the other axis is
        // auto/scroll/hidden gets *computed* to auto too — so
        // overflow-x-auto alone secretly made this track vertically
        // scrollable as well. On iOS that surfaced as a small elastic
        // rubber-band bounce the instant you touch-held a card, clipping
        // its top edge for a frame before settling back. Pinning
        // overflow-y removes that hidden second scroll axis entirely.
        //
        // overscroll-behavior-x: contain stops a fling that reaches either
        // end of the rail from chaining into the page's own horizontal
        // rubber-band/swipe-navigation gesture (mainly an iOS Safari
        // concern) — the overscroll bounce stays local to the rail.
        //
        // -webkit-overflow-scrolling: touch turns on momentum scrolling on
        // older iOS/WebKit (modern Safari does this by default for
        // overflow:auto, but the property is a harmless, cheap guarantee
        // rather than an assumption).
        //
        // scroll-snap-type: x mandatory (not proximity): mandatory still
        // lets the browser glide through several partially-visible cards
        // during the actual momentum/drag — it only forces a final snap
        // once the gesture fully settles, which is exactly "gentle, not
        // rigid, but never stuck between two cards." Proximity was
        // considered and rejected: it can leave the rail resting halfway
        // between cards if a swipe doesn't carry it close enough to either
        // snap point, which is precisely the "stuck between products" this
        // needs to never do.
        //
        // No `scroll-smooth` class: scroll-behavior: smooth only applies to
        // *programmatic* scrolls (scrollTo/scrollBy/anchor jumps) — it has
        // no effect on user-driven touch/wheel scrolling either way, so
        // omitting it changes nothing for touch.
        style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
        className={`flex ${RAIL_GAP_CLASS} overflow-x-auto overflow-y-hidden no-scrollbar snap-x snap-mandatory pb-2 ${RAIL_PADDING_CLASS} scroll-pl-5 md:scroll-pl-8 lg:scroll-pl-12 scroll-pr-5 md:scroll-pr-8 lg:scroll-pr-12`}
      >
        {products.map((p, i) => (
          <div
            key={p._id}
            // Every card snaps to the start of the scrollport EXCEPT the
            // last one, which snaps to the end instead — with only
            // snap-start, there's no valid snap point that brings the final
            // card's own trailing edge flush with the padded end, so it
            // could get stuck partly cut off past the viewport even at max
            // scroll (confirmed by scrolling programmatically to scrollWidth
            // - clientWidth and finding the last card still overflowed the
            // right edge). snap-end on just that one card gives the browser
            // a reachable snap point that fully seats it.
            className={`shrink-0 ${i === products.length - 1 ? "snap-end" : "snap-start"} ${RAIL_ITEM_WIDTH_CLASS}`}
          >
            <ProductCard product={p} index={i} />
          </div>
        ))}
      </div>

      {/* Fade masks — width matches the rail's own inline padding exactly
          at each breakpoint, so they only ever cover the gutter the rail
          already reserves, never card content. pointer-events: none. */}
      <div className="absolute left-0 top-0 bottom-2 w-5 md:w-8 lg:w-12 bg-gradient-to-r from-[var(--paper)] to-transparent pointer-events-none z-30" />
      <div className="absolute right-0 top-0 bottom-2 w-5 md:w-8 lg:w-12 bg-gradient-to-l from-[var(--paper)] to-transparent pointer-events-none z-30" />
    </div>
  );
}
