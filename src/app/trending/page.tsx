import type { Metadata } from "next";
import { getCategories, getHomepageCollections } from "@/lib/data";
import { SITE_URL } from "@/lib/utils";
import ShopClient from "@/components/ShopClient";

const description = "What's trending right now in wholesale vintage — the newest pieces gaining momentum with resellers.";

export const metadata: Metadata = {
  title: "Trending",
  description,
  alternates: { canonical: `${SITE_URL}/trending` },
  openGraph: { title: "Trending", description, url: `${SITE_URL}/trending`, siteName: "MrRework", type: "website" },
  twitter: { card: "summary_large_image", title: "Trending", description },
};

// Same grid/filter/sort UI as /shop ("Wholesale") — just pre-filtered to
// isTrending via ShopClient's initialFlag, not a separate page design.
// Title/eyebrow admin-managed via Admin -> Content -> Homepage Collections.
export default async function TrendingPage() {
  const [categories, collections] = await Promise.all([getCategories(), getHomepageCollections()]);
  const trending = collections?.trending;
  return (
    <ShopClient
      categories={categories}
      initialFlag="isTrending"
      heading={trending?.title || "Trending"}
      eyebrow={trending?.subtitle || "Gaining momentum"}
    />
  );
}
