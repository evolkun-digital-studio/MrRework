import type { Metadata } from "next";
import { getCategories, getHomepageCollections } from "@/lib/data";
import { SITE_URL } from "@/lib/utils";
import ShopClient from "@/components/ShopClient";

const description = "The newest arrivals in wholesale vintage — just landed.";

export const metadata: Metadata = {
  title: "Latest Drops",
  description,
  alternates: { canonical: `${SITE_URL}/latest-drops` },
  openGraph: { title: "Latest Drops", description, url: `${SITE_URL}/latest-drops`, siteName: "MrRework", type: "website" },
  twitter: { card: "summary_large_image", title: "Latest Drops", description },
};

// Same grid/filter/sort UI as /shop ("Wholesale") — just pre-filtered to
// isNew via ShopClient's initialFlag, matching the exact pattern already
// used by /bestsellers (isBestSeller) and /trending (isTrending). Title/
// eyebrow admin-managed via Admin -> Content -> Homepage Collections.
export default async function LatestDropsPage() {
  const [categories, collections] = await Promise.all([getCategories(), getHomepageCollections()]);
  const latestDrops = collections?.latestDrops;
  return (
    <ShopClient
      categories={categories}
      initialFlag="isNew"
      heading={latestDrops?.title || "Latest Drops"}
      eyebrow={latestDrops?.subtitle || "Just landed"}
    />
  );
}
