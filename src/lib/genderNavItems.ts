import type { NavDropdownItem } from "@/components/NavDropdown";

// Header nav dropdowns (Women's / Men's / Unisex) — same /shop?category=
// pattern every other nav dropdown already uses.
export const WOMENS_NAV_ITEMS: NavDropdownItem[] = [
  { label: "Skirt", slug: "skirt" },
  { label: "Top", slug: "top" },
  { label: "Shorts", slug: "shorts" },
  { label: "Co-ords Sets", slug: "co-ords-sets" },
  { label: "Outerwear", slug: "outerwear" },
];

export const MENS_NAV_ITEMS: NavDropdownItem[] = [
  { label: "Outerwear", slug: "outerwear" },
  { label: "Bottoms", slug: "bottoms" },
];

export const UNISEX_NAV_ITEMS: NavDropdownItem[] = [
  { label: "Bottoms", slug: "bottoms" },
  { label: "Outerwear", slug: "outerwear" },
  { label: "Shorts", slug: "shorts" },
];
