const isProd = process.env.NODE_ENV === "production";

// PayPal's Buttons SDK (@paypal/react-paypal-js, used in checkout/page.tsx)
// injects its own <script>, renders into its own <iframe>s, and calls its
// own API hosts — every PayPal domain below exists because the checkout
// flow genuinely needs it, not as a blanket allowance. Listed once here so
// script-src/frame-src/connect-src/img-src below don't each re-derive it.
const PAYPAL_HOSTS = ["https://www.paypal.com", "https://www.sandbox.paypal.com"];
const PAYPAL_API_HOSTS = ["https://api-m.paypal.com", "https://api-m.sandbox.paypal.com"];
const PAYPAL_ASSET_HOSTS = ["https://www.paypalobjects.com"];

// Postal-code -> city/state autofill on checkout (src/lib/addressLookup.ts)
// calls this directly from the browser — the free, keyless Zippopotam.us API.
const POSTAL_LOOKUP_HOSTS = ["https://api.zippopotam.us"];

// Content-Security-Policy, directive by directive:
//  - default-src 'self'            fallback for any fetch type not listed below.
//  - script-src                    'self' (our own bundles) + 'unsafe-inline'.
//        'unsafe-inline' is a deliberate, documented trade-off, not an
//        oversight: neither Next.js's App Router nor the PayPal SDK it
//        loads use a nonce/hash scheme, and building one is a structural
//        change out of scope for this pass (see the Sprint 2 write-up).
//        The specific inline-script-injection vector this would otherwise
//        block (a JSON-LD `</script>` breakout) is already closed at the
//        source in product/[slug] and blog/[slug] (see Sprint 1) — this
//        directive is defense-in-depth for the OTHER directives below
//        (frame-ancestors, object-src, connect-src, form-action), not the
//        only thing standing between an injected script and executing.
//  - style-src 'self' 'unsafe-inline'   Tailwind/Next.js emit inline styles.
//  - img-src                       our own product imagery host + PayPal's
//        badge/logo asset host + data: URIs (inline SVG placeholders).
//  - media-src                     same host as img-src, for the Campaign
//        Media Wall's <video> items (CampaignMediaWall.tsx) — without this,
//        media-src falls back to default-src 'self' and the browser
//        silently blocks every R2-hosted video (no visible error, just a
//        CSP violation in the console and a video element that never plays).
//  - font-src 'self' data:         no third-party font host is used.
//  - connect-src                   our own origin + PayPal's REST API hosts
//        (the client SDK calls these directly for order status) + the
//        postal-code lookup API (checkout calls it directly from the browser).
//  - frame-src                     PayPal's hosted Buttons/Checkout iframe.
//  - object-src 'none'             no <object>/<embed>/Flash-era content anywhere.
//  - base-uri 'self'               stops a <base> tag from being used to
//        rewrite where relative script/link URLs resolve.
//  - form-action 'self'            our own forms never submit to a third
//        party (checkout with PayPal is a JS/redirect flow, not a raw
//        cross-origin form POST).
//  - frame-ancestors 'none'        this site is never legitimately framed by
//        anyone — the direct fix for the clickjacking gap the audit found
//        on /admin/login and /checkout.
// Next.js's dev-mode Fast Refresh relies on eval() to inject hot-reloaded
// modules — needed only for local development, never in a production
// build, so it's added exactly like the Secure-cookie/HSTS conditionals
// above rather than weakening the production policy to accommodate it.
const scriptSrcExtra = isProd ? "" : " 'unsafe-eval'";

const CSP = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${scriptSrcExtra} ${PAYPAL_HOSTS.join(" ")} ${PAYPAL_ASSET_HOSTS.join(" ")} https://cdn.jsdelivr.net`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: https://riaajvintage.com https://*.riaajvintage.com https://pub-450f5976467a45eeba9242d8017260f7.r2.dev ${PAYPAL_ASSET_HOSTS.join(" ")}`,
  `media-src 'self' https://riaajvintage.com https://*.riaajvintage.com https://pub-450f5976467a45eeba9242d8017260f7.r2.dev`,
  `font-src 'self' data:`,
  `connect-src 'self' ${PAYPAL_HOSTS.join(" ")} ${PAYPAL_API_HOSTS.join(" ")} ${POSTAL_LOOKUP_HOSTS.join(" ")}`,
  `frame-src ${PAYPAL_HOSTS.join(" ")} https://riaaj-vintage-form.vercel.app`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
].join("; ");

const securityHeaders = [
  // Same protection as frame-ancestors above, for the handful of older
  // browsers that honor X-Frame-Options but not CSP frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
  // Stops a browser from re-interpreting a response as a different MIME
  // type than the server declared (e.g. treating an uploaded "image" as
  // executable HTML) — a real building block for the SVG-upload finding.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Sends only the origin (never the full path/query) to a cross-origin
  // request's Referer header, and nothing at all on a downgrade to plain
  // HTTP — keeps order/account URLs out of third-party access logs.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // This storefront never needs camera/microphone/geolocation/USB access,
  // and interest-cohort explicitly opts out of FLoC-style topics tracking.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), usb=(), interest-cohort=()" },
  { key: "Content-Security-Policy", value: CSP },
];

// HSTS instructs the browser to only ever speak HTTPS to this origin for
// the given duration — correct once actually deployed behind TLS, but
// actively wrong for local HTTP development (it would force this exact
// browser to refuse a plain http://localhost re-visit for up to 2 years).
// Gated on NODE_ENV the same way the session cookie's `Secure` flag already
// is in customerAuth.ts, rather than introducing a second toggle for the
// same underlying condition. No `preload` — submitting to browsers'
// built-in preload list is a separate, effectively irreversible step that
// should be a deliberate ops decision, not a side effect of this fix.
if (isProd) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Was a wildcard ("**") accepting images from any https host — the
    // Next.js image optimizer will fetch and process whatever URL is passed
    // to <Image>, so that's an open proxy/SSRF-adjacent surface. The actual
    // product/blog catalog only ever references riaajvintage.com (verified
    // against every stored image URL), so this is scoped to that.
    remotePatterns: [
      { protocol: "https", hostname: "riaajvintage.com" },
      { protocol: "https", hostname: "**.riaajvintage.com" },
      // The "On Stage / Off Script" homepage promo section's background
      // photo lives on this R2 bucket (same host already allow-listed in
      // the CSP's img-src for the hero slider) — needed so next/image can
      // actually optimize it instead of throwing "unconfigured host".
      { protocol: "https", hostname: "pub-450f5976467a45eeba9242d8017260f7.r2.dev" },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
export default nextConfig;
