// Single source of truth for the two homepage horizontal product rails
// ("Shop Vintage Bestsellers" and "Trending" in src/app/page.tsx, both
// rendered via the shared ProductRail.tsx). Both rails render the same
// ProductCard, but each previously sized its own slide independently (fixed
// w-[280px]/w-[360px] vs. a calc()-based percentage width, different gaps,
// different inner padding) — pixel-different cards despite sharing a
// component. Every
// value either rail needs for slide width/gap/padding is defined exactly
// once here so they can't drift apart again.
//
// Tighter gap on mobile only (12px vs. the 28px used from md up) — at 3
// cards per row on a phone-width screen, the original 28px gap ate too much
// of each card's already-small share of the viewport.
export const RAIL_GAP_CLASS = "gap-3 md:gap-4";
// Base (mobile) shows exactly 2 cards per view — one RAIL_GAP between them
// — while md/lg/xl keep their existing 3/5/6-card values unchanged.
export const RAIL_ITEM_WIDTH_CLASS =
  "w-[calc((100%-12px)/2)] md:w-[calc((100%-32px)/3)] lg:w-[calc((100%-64px)/5)] xl:w-[calc((100%-80px)/6)]";
// Shared bleed + inner padding so both rails' edges/gutters line up
// identically at every breakpoint.
export const RAIL_BLEED_CLASS = "-mx-5 md:-mx-12";
export const RAIL_PADDING_CLASS = "px-5 md:px-8 lg:px-12";

// Shared slide width/gap for the homepage's "Best Selling" and "Trending"
// rails specifically (both render BestSellingCard) — kept as one constant
// so the two sections stay pixel-identical instead of drifting the way
// RAIL_ITEM_WIDTH_CLASS above once did.
//
// Below `md` (768px): exactly 2 full cards fit the viewport, no partial
// third card peeking in — was a "1 card + peek" layout (w-[62%]) that only
// showed ~1.5 cards on phones; changed per explicit request. `100%` here is
// the rail's own content-box width (RAIL_PADDING_CLASS's padding is already
// excluded from it), so `(100%-24px)/2` is "two equal slices with exactly
// one CARD_GAP_CLASS (24px) between them" — the same N-columns formula the
// md/lg tiers already use, just without their extra *0.8 peek shrink.
//
// From `md` up: unchanged — 3 on md, 4 from lg up, each *0.8 so the next
// card still peeks in (desktop/tablet peek behavior is intentionally kept).
export const CARD_GAP_CLASS = "gap-6";
export const CARD_ITEM_WIDTH_CLASS =
  "w-[calc((100%-24px)/2)] md:w-[calc((100%-2*24px)/3*0.8)] lg:w-[calc((100%-3*24px)/4*0.8)]";
