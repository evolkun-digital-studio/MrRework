import "server-only";
import { escapeRegex } from "@/lib/search";

// The admin product list's filter (GET /api/admin/products) and the bulk
// endpoints' `filters`-mode selection must build the exact same Mongo query
// from the exact same input shape — otherwise "N products match your
// filters" in the list view could silently disagree with what a bulk job
// actually selects. Both now call this one function instead of each having
// their own copy.
export interface AdminProductFilterInput {
  q?: string | null;
  status?: string | null;
  category?: string | null;
  productType?: string | null;
}

export function buildProductFilter(input: AdminProductFilterInput): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  const q = input.q?.trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: rx }, { sku: rx }, { slug: rx }];
  }
  if (input.status) filter.status = input.status;
  if (input.category) filter.category = input.category;
  // "shop" here means "explicitly shop OR unset" — same reasoning as
  // productTypeFilter() in search.ts (the storefront's isolation
  // boundary) — so filtering the admin list to "Shop" still surfaces every
  // pre-Retail product, not just ones that happen to have the field set.
  if (input.productType === "retail") filter.productType = "retail";
  else if (input.productType === "shop") filter.productType = { $ne: "retail" };

  return filter;
}
