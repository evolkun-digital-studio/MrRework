import type { Metadata } from "next";

// checkout/page.tsx (and checkout/success/page.tsx) are client components,
// so they can't export `metadata` themselves — this layout is the minimal
// server-component wrapper needed to attach one. Checkout is a private,
// per-visitor transactional flow with no SEO value; noindex here applies
// even if a crawler ignores the /checkout disallow rule in robots.ts.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
