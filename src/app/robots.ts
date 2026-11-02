import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/utils";

export default function robots(): MetadataRoute.Robots {
  return {
    // /checkout, /cart, and /account are transactional/private pages with no
    // SEO value — crawling them wastes crawl budget and (for /checkout) can
    // index a thin, generic-titled page under a customer-facing URL.
    // /admin requires authentication and has zero public SEO value either —
    // every URL under it would otherwise be crawlable (though not indexable
    // without login) and waste crawl budget the same way.
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/checkout", "/cart", "/account", "/admin"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
