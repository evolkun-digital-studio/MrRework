import type { Metadata } from "next";

// cart/page.tsx is a client component, so it can't export `metadata` itself
// — this layout is the minimal server-component wrapper needed to attach
// one. The cart is a per-visitor, usually-empty transactional page with no
// SEO value; noindex here applies even if a crawler ignores the /cart
// disallow rule in robots.ts.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
