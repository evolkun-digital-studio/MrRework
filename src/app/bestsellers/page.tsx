import type { Metadata } from "next";
import { getCategories, getHomepageCollections } from "@/lib/data";
import { SITE_URL } from "@/lib/utils";
import ShopClient from "@/components/ShopClient";

const description = "Our best-selling vintage wholesale bundles and pieces — the styles resellers come back for.";

export const metadata: Metadata = {
  title: "Bestsellers",
  description,
  alternates: { canonical: `${SITE_URL}/bestsellers` },
  openGraph: { title: "Bestsellers", description, url: `${SITE_URL}/bestsellers`, siteName: "MrRework", type: "website" },
  twitter: { card: "summary_large_image", title: "Bestsellers", description },
};

// Same grid/filter/sort UI as /shop ("Wholesale") — just pre-filtered to
// isBestSeller via ShopClient's initialFlag, not a separate page design.
// Title/eyebrow admin-managed via Admin -> Content -> Homepage Collections.
export default async function BestsellersPage() {
  const [categories, collections] = await Promise.all([getCategories(), getHomepageCollections()]);
  const bestSelling = collections?.bestSelling;
  return (
    <ShopClient
      categories={categories}
      initialFlag="isBestSeller"
      heading={bestSelling?.title || "Bestsellers"}
      eyebrow={bestSelling?.subtitle || "Customer favourites"}
    />
  );
}
