// Homepage "Shop By Category" section — curated display order. Same pattern
// as categoryPillOrder.ts: page.tsx filters/sorts the live getCategories()
// list against this order by slug, so a card only renders when that
// category actually exists in the database, in this exact order.
export const SHOP_BY_CATEGORY_ORDER: string[] = [
  "men-s",
  "women-s",
  "unisex",
  "premium",
  "accessories",
];
