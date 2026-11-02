import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ProductModel } from "@/models/Product";
import { buildSearchFilter, STOREFRONT_VISIBLE, STOREFRONT_EXCLUDE_TEST_PRODUCTS } from "@/lib/search";

export const dynamic = "force-dynamic";

const RESULT_LIMIT = 8;
// Pull a slightly larger candidate pool than we return so relevance scoring
// has something to rank — the regex filter alone doesn't order matches.
const CANDIDATE_LIMIT = 40;

function relevanceScore(product: any, needle: string): number {
  const name = (product.name ?? "").toLowerCase();
  let score = 0;

  if (name === needle) score += 200;
  else if (name.startsWith(needle)) score += 100;
  else if (name.includes(needle)) score += 50;

  if ((product.sku ?? "").toLowerCase().includes(needle)) score += 40;
  if ((product.collection ?? "").toLowerCase().includes(needle)) score += 15;
  if ((product.category ?? "").toLowerCase().includes(needle)) score += 15;
  if ((product.tags ?? []).some((t: string) => t.toLowerCase().includes(needle))) score += 10;
  if ((product.description ?? "").toLowerCase().includes(needle)) score += 5;
  if (product.isBestSeller) score += 3;
  if (product.isNew) score += 2;

  return score;
}

// GET /api/search?q= — the instant typeahead dropdown's endpoint. Returns
// only the top 8 most relevant matches with just the fields the dropdown
// renders; no Product data is duplicated anywhere, this reads live.
export async function GET(req: NextRequest) {
  await dbConnect();
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ items: [] });

  const candidates = await ProductModel.find({ $and: [buildSearchFilter(q), STOREFRONT_VISIBLE, STOREFRONT_EXCLUDE_TEST_PRODUCTS] })
    .select("name slug sku price compareAtPrice priceMax images collection category isNew isBestSeller inStock tags description createdAt")
    .limit(CANDIDATE_LIMIT)
    .lean<any[]>();

  const needle = q.toLowerCase();
  const items = candidates
    .map((p) => ({ p, score: relevanceScore(p, needle) }))
    .sort((a, b) => b.score - a.score || +new Date(b.p.createdAt) - +new Date(a.p.createdAt))
    .slice(0, RESULT_LIMIT)
    .map(({ p }) => ({
      _id: String(p._id),
      name: p.name,
      slug: p.slug,
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      priceMax: p.priceMax,
      image: p.images?.[0] ?? "",
      collection: p.collection,
      isNew: p.isNew,
      inStock: p.inStock,
    }));

  return NextResponse.json({ items });
}
