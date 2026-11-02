import type { MetadataRoute } from "next";
import { getAllSlugs, getAllBlogSlugs, getAllPageSlugs } from "@/lib/data";
import { SITE_URL as base } from "@/lib/utils";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [slugs, blogSlugs, pageSlugs] = await Promise.all([
    getAllSlugs().catch(() => []),
    getAllBlogSlugs().catch(() => []),
    getAllPageSlugs().catch(() => []),
  ]);
  // "/cart" is a per-visitor, usually-empty transactional page with no
  // unique content — it has no place in a sitemap (see also robots.ts,
  // which now disallows crawling it entirely).
  const staticRoutes = ["", "/shop", "/blog"].map((r) => ({ url: `${base}${r}`, lastModified: new Date() }));
  const products = slugs.map((s) => ({ url: `${base}/product/${s}`, lastModified: new Date() }));
  const blogPosts = blogSlugs.map((s) => ({ url: `${base}/blog/${s}`, lastModified: new Date() }));
  const pages = pageSlugs.map((s) => ({ url: `${base}/${s}`, lastModified: new Date() }));
  return [...staticRoutes, ...products, ...blogPosts, ...pages];
}
