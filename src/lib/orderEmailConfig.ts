import "server-only";
import { SITE_URL } from "./utils";

// Single configurable source for everything order emails/invoices need
// beyond the order data itself — content that's brand/business
// configuration, not per-order data, so it lives in one place rather than
// hardcoded across seven templates + the PDF generator.

// Same hosted logo already used in the site header (see Header.tsx) — kept
// as a real <img>/rasterized-image reference rather than a text wordmark so
// the email and PDF invoice actually carry the brand mark, not just a
// styled label.
export const LOGO_URL = "https://version2.riaajvintage.com/wp-content/uploads/2026/02/riaaj-logo-.svg";

export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@riaajvintage.com";

export const FOOTER_LINKS = {
  contact: `${SITE_URL}/contact`,
  privacy: `${SITE_URL}/policies/privacy`,
  terms: `${SITE_URL}/policies/terms`,
  website: SITE_URL,
};

// No real social URLs exist anywhere in the codebase today (Footer.tsx's
// icons are unlinked decoration) — left empty so the shell's conditional
// social-icon row renders nothing until real links are added here.
export const SOCIAL_LINKS: { label: string; url: string }[] = [];

export function viewOrderUrl(orderNumber: string): string {
  return `${SITE_URL}/account/orders/${orderNumber}`;
}
