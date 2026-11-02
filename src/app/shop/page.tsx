import type { Metadata } from "next";
import { getCategories } from "@/lib/data";
import { SITE_URL } from "@/lib/utils";
import ShopClient from "@/components/ShopClient";

const description = "Browse the MrRework wardrobe — outerwear, knitwear, tailoring, shirting and footwear in limited runs.";

export const metadata: Metadata = {
  title: "Shop",
  description,
  // Canonicalizes every ?category=/?collection= filtered view to the same
  // base /shop URL — those query params drive client-side filtering only
  // (see ShopClient), not a distinct server route, so without this a
  // crawler could otherwise index /shop?category=x and /shop?category=y as
  // separate duplicate-content pages instead of one indexed page.
  alternates: { canonical: `${SITE_URL}/shop` },
  openGraph: { title: "Shop", description, url: `${SITE_URL}/shop`, siteName: "MrRework", type: "website" },
  twitter: { card: "summary_large_image", title: "Shop", description },
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; collection?: string; brand?: string }>;
}) {
  const [categories, sp] = await Promise.all([
    getCategories(),
    searchParams,
  ]);
  return (
    <ShopClient
      categories={categories}
      initialCategory={sp.category}
      initialBrand={sp.brand}
      initialCollection={sp.collection}
      heading="Shop"
    />
  );
}
