// Shared design tokens for every customer-facing product card (the single
// reusable ProductCard component, used everywhere: shop grid, search
// results, search overlay, PDP related products, homepage rails, account
// dashboard rows) plus the wishlist page's own card (distinct component —
// it needs persistent size/colour pickers a hover-reveal card can't host —
// which draws on these same tokens purely for visual consistency).
//
// Retail-catalog aesthetic (Adidas/Nike-style grid): no rounded corners, no
// shadows, no borders, no floating/lift effects. Image sits on a flat gray
// tile; the caption below it (price, name, category) is ALWAYS visible —
// not hover-revealed — so it reads correctly on touch devices too, with no
// `group-hover` gating anywhere in the caption.

export const IMAGE_ASPECT = "aspect-[4/5]";
// A restrained resting crop reduces whitespace baked into source images;
// hover adds only a small increment and remains transform-only.
export const IMAGE_HOVER_ZOOM = "scale-[1.08] transition-transform duration-300 ease-brand group-hover:scale-[1.12]";

// Small rectangle, sharp corners, minimal — top-LEFT (see CAPTION_HEIGHT
// comment below for why the wishlist icon owns top-right instead).
export const BADGE =
  "text-paper text-[10px] font-medium tracking-[0.12em] uppercase px-2.5 py-1";

// Plain icon, no backing chip/circle, no hover-reveal — always visible,
// matching the reference grid's bare corner heart.
export const WISHLIST_BUTTON_BASE = "w-7 h-7 grid place-items-center text-ink/70 hover:text-ink transition-colors";
export const WISHLIST_BUTTON_ACTIVE = "text-ink";
export const WISHLIST_ICON_SIZE = 16;

// Quick-add (bag icon) stays hover-only — unlike the wishlist heart, the
// reference grid this card now matches doesn't show it at rest at all, but
// the feature itself is still worth keeping as a hover affordance rather
// than removing outright. `[@media(hover:hover)]:` scopes that to devices
// with a real hover state; touch devices get it always-visible (same
// reasoning as the old WISHLIST_BUTTON_BASE had) since there's no other way
// to reach it there.
export const QUICK_ADD_BUTTON_BASE =
  "w-9 h-9 grid place-items-center bg-white/90 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition-opacity [@media(hover:hover)]:duration-300 [@media(hover:hover)]:ease-brand [@media(hover:hover)]:group-hover:opacity-100";

// Caption block below the image — always visible, no reserved-but-hidden
// hover panel. Height is auto (not fixed) since price/name/category text
// wraps naturally; cards in the same row can differ slightly in height,
// same as the reference grid.
export const CAPTION_HEIGHT = "mt-2";
export const CAPTION_PANEL = "";
export const CAPTION_TEXT = "flex min-w-0 flex-col items-start gap-0.5 text-left";

// "Brand" in the spec sense — this catalog has no separate brand field, so
// the product's category/collection fills that role.
export const BRAND_CLASS = "text-[9px] uppercase tracking-[0.1em] leading-tight text-stone";
export const TITLE_CLASS = "block min-w-0 text-[11px] font-normal leading-[1.3] line-clamp-2 text-[#1B4965] hover:underline";
export const PRICE_CLASS = "text-[12px] font-bold leading-none text-ink";
export const OLD_PRICE_CLASS = "text-[11px] font-normal leading-none text-stone line-through";
export const DISCOUNT_CLASS = "text-[11px] font-bold leading-none text-[#C92A2A]";
