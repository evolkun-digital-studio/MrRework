import type { Metadata, Viewport } from "next";
import "./globals.css";
import ConditionalChrome from "@/components/ConditionalChrome";
import UnhandledRejectionLogger from "@/components/UnhandledRejectionLogger";
import { SITE_URL } from "@/lib/utils";

// Only two fonts site-wide: Satoshi (--font-display, loaded via the
// Fontshare @import in globals.css) for headings/hero/buttons/important
// labels, and the plain system sans-serif fallback stack (no webfont file
// at all) for body copy/forms/secondary content. See globals.css, where
// `--font-sans` is defined directly as that stack rather than a next/font
// variable, and `--font-mono`/`--font-highlight` are both aliased to one of
// the two above so no third font is ever introduced.

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "MrRework | Premium Vintage Clothing", template: "%s | MrRework" },
  description: "Discover authentic vintage clothing, premium streetwear, and carefully curated fashion at MrRework.",
  openGraph: {
    type: "website",
    title: "MrRework | Premium Vintage Clothing",
    description: "Discover authentic vintage clothing, premium streetwear, and carefully curated fashion at MrRework.",
    siteName: "MrRework",
  },
  twitter: { card: "summary_large_image", title: "MrRework", description: "Discover authentic vintage clothing, premium streetwear, and carefully curated fashion at MrRework." },
};

// `viewportFit: "cover"` is the prerequisite for `env(safe-area-inset-*)` to
// resolve to anything but 0 on iOS — without it, Safari never extends the
// layout under the notch/Dynamic Island/home-indicator area, so those CSS
// variables (see globals.css) stay inert everywhere they're used (AuthModal,
// Header, CartDrawer, MobileNav). No `maximumScale`/`userScalable` override —
// leaving pinch-zoom enabled is the accessible default (WCAG 1.4.4).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* suppressHydrationWarning: browser extensions (ColorZilla's
          cz-shortcut-listen, Grammarly's data-gr-*, etc.) inject attributes
          onto <body> before React hydrates, which React then reports as a
          hydration mismatch even though nothing in this app wrote them.
          Scoped to just this element, not a blanket suppression — a real
          mismatch anywhere else still warns normally. */}
      <body suppressHydrationWarning>
        <UnhandledRejectionLogger />
        <ConditionalChrome>{children}</ConditionalChrome>
      </body>
    </html>
  );
}
