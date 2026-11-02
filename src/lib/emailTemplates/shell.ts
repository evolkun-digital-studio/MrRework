import "server-only";
import { formatPrice } from "../utils";
import { LOGO_URL, SUPPORT_EMAIL, FOOTER_LINKS, SOCIAL_LINKS } from "../orderEmailConfig";

// Minimal shape every order-email template/PDF needs — deliberately loose
// (not the full Mongoose Order document) so a plain lean()/toObject() order,
// or the Mongoose document itself (property access works the same way),
// can be passed straight in from any of the three call sites.
export interface OrderEmailItem {
  name: string; sku?: string; size?: string; color?: string; price: number; quantity: number;
}
export interface OrderEmailAddress {
  firstName?: string; lastName?: string; address?: string; apartment?: string;
  city?: string; state?: string; postalCode?: string; country?: string; phone?: string;
}
export interface OrderEmailData {
  orderNumber: string;
  email: string;
  items: OrderEmailItem[];
  subtotal: number; shipping: number; tax: number; discount: number; total: number;
  currency?: string;
  shippingMethod?: string;
  paymentMethod?: string;
  shippingAddress?: OrderEmailAddress;
  billingAddress?: OrderEmailAddress;
  trackingUrl?: string;
  createdAt?: string | Date;
}

// Brand tokens lifted straight from tailwind.config.ts — kept as literal hex
// values here (not a shared import) since Tailwind classes don't exist in
// raw HTML email markup; this is the one place they're transcribed, so any
// future rebrand only needs updating here and in tailwind.config.ts.
const COLOR = {
  paper: "#FFFFFF",
  paper2: "#FAFAFA",
  ink: "#111111",
  ink2: "#2A2A2A",
  stone: "#6B6B6B",
  line: "#EAEAEA",
  green: "#6FAF83",
};

// System sans-serif stack mirroring --font-sans's own fallback — email
// clients strip/ignore @font-face and next/font webfonts almost universally,
// so (as the pre-existing verification-email shell already notes for its
// serif choice) the safe, always-correct move is the system stack, not an
// attempt to load Space Grotesk.
const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function customerName(addr?: OrderEmailAddress): string {
  const name = [addr?.firstName, addr?.lastName].filter(Boolean).join(" ").trim();
  return name || "there";
}

function formatAddress(addr?: OrderEmailAddress): string {
  if (!addr) return "";
  const lines = [
    [addr.firstName, addr.lastName].filter(Boolean).join(" "),
    [addr.address, addr.apartment].filter(Boolean).join(", "),
    [addr.city, addr.state, addr.postalCode].filter(Boolean).join(", "),
    addr.country,
  ].filter(Boolean);
  return lines.join("<br />");
}

export function orderEmailAddressesHtml(order: OrderEmailData): string {
  const shipping = formatAddress(order.shippingAddress);
  const billing = formatAddress(order.billingAddress);
  if (!shipping && !billing) return "";
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
      <tr>
        <td width="50%" style="vertical-align:top;padding-right:12px;">
          <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${COLOR.stone};">Shipping address</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:${COLOR.ink2};">${shipping || "—"}</p>
        </td>
        <td width="50%" style="vertical-align:top;padding-left:12px;">
          <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${COLOR.stone};">Billing address</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:${COLOR.ink2};">${billing || "—"}</p>
        </td>
      </tr>
    </table>`;
}

// The one shared product-list/totals/payment-method block, reused by the
// confirmation email and all six status emails — every template renders the
// same order summary, so it's built exactly once here.
export function renderOrderSummaryHtml(order: OrderEmailData): string {
  const currency = order.currency || "GBP";
  const rows = order.items
    .map((item) => {
      const variant = [item.color, item.size].filter(Boolean).join(" · ");
      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid ${COLOR.line};font-size:13.5px;color:${COLOR.ink};">
            ${item.name}
            ${variant ? `<div style="font-size:11.5px;color:${COLOR.stone};margin-top:2px;">${variant} · Qty ${item.quantity}</div>` : `<div style="font-size:11.5px;color:${COLOR.stone};margin-top:2px;">Qty ${item.quantity}</div>`}
          </td>
          <td align="right" style="padding:12px 0;border-bottom:1px solid ${COLOR.line};font-size:13.5px;color:${COLOR.ink};white-space:nowrap;">
            ${formatPrice(item.price * item.quantity, currency)}
          </td>
        </tr>`;
    })
    .join("");

  const totalRow = (label: string, value: string, emphasis = false) => `
    <tr>
      <td style="padding:${emphasis ? "10px" : "4px"} 0 0 0;font-size:${emphasis ? "14.5px" : "13px"};font-weight:${emphasis ? "700" : "400"};color:${emphasis ? COLOR.ink : COLOR.stone};">${label}</td>
      <td align="right" style="padding:${emphasis ? "10px" : "4px"} 0 0 0;font-size:${emphasis ? "14.5px" : "13px"};font-weight:${emphasis ? "700" : "400"};color:${COLOR.ink};">${value}</td>
    </tr>`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
      ${rows}
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
      ${totalRow("Subtotal", formatPrice(order.subtotal, currency))}
      ${totalRow("Shipping", order.shipping === 0 ? "Free" : formatPrice(order.shipping, currency))}
      ${order.tax > 0 ? totalRow("Tax", formatPrice(order.tax, currency)) : ""}
      ${order.discount > 0 ? totalRow("Discount", `-${formatPrice(order.discount, currency)}`) : ""}
      <tr><td colspan="2" style="padding-top:10px;border-top:1px solid ${COLOR.line};"></td></tr>
      ${totalRow("Total", formatPrice(order.total, currency), true)}
    </table>
    <p style="margin:0 0 28px 0;font-size:12.5px;color:${COLOR.stone};">
      Payment method: <span style="color:${COLOR.ink2};text-transform:capitalize;">${order.paymentMethod || "—"}</span>
    </p>`;
}

function button(href: string, label: string, opts: { outline?: boolean } = {}): string {
  const bg = opts.outline ? COLOR.paper : COLOR.ink;
  const fg = opts.outline ? COLOR.ink : COLOR.paper;
  const border = opts.outline ? `border:1px solid ${COLOR.ink};` : "";
  return `
    <td style="padding:0 8px 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="border-radius:6px;background-color:${bg};${border}">
            <a href="${href}" style="display:inline-block;padding:13px 28px;color:${fg};text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">${label}</a>
          </td>
        </tr>
      </table>
    </td>`;
}

export function actionButtonsHtml(opts: { viewOrderUrl: string; trackOrderUrl?: string }): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
      <tr>
        ${button(opts.viewOrderUrl, "View Order")}
        ${opts.trackOrderUrl ? button(opts.trackOrderUrl, "Track Order", { outline: true }) : ""}
      </tr>
    </table>`;
}

export function statusBadgeHtml(label: string, color: string): string {
  return `<span style="display:inline-block;padding:5px 14px;border-radius:999px;background-color:${color}1a;color:${color};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">${label}</span>`;
}

// The shared visual shell for every order email — header (real logo image),
// body slot, and a footer with support/legal/website links plus an optional
// social-icon row (empty today, see SOCIAL_LINKS). Distinct from the older
// emailShell() in emailTemplates.ts, which intentionally keeps its
// Georgia/cream look for the auth emails it already serves; this one tracks
// the site's *current* ink/stone/paper palette and sans-serif stack.
export function orderEmailShell(bodyHtml: string, opts: { preheader?: string } = {}): string {
  const socialRow = SOCIAL_LINKS.length
    ? `<tr><td align="center" style="padding-top:16px;">
        ${SOCIAL_LINKS.map((s) => `<a href="${s.url}" style="display:inline-block;margin:0 6px;color:${COLOR.stone};text-decoration:none;font-size:11px;">${s.label}</a>`).join("")}
      </td></tr>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <style>
      @media (prefers-color-scheme: dark) {
        .oe-bg { background-color: #15130f !important; }
        .oe-card { background-color: #1c1a15 !important; border-color: #33302a !important; }
        .oe-ink { color: #f3efe8 !important; }
        .oe-stone { color: #a39d8f !important; }
        .oe-line { border-color: #33302a !important; }
      }
      @media (max-width: 480px) {
        .oe-container { width: 100% !important; }
        .oe-pad { padding-left:20px !important; padding-right:20px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${COLOR.paper2};font-family:${FONT_STACK};">
    ${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="oe-bg" style="background-color:${COLOR.paper2};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="oe-container oe-card" style="max-width:600px;background-color:${COLOR.paper};border-radius:16px;overflow:hidden;border:1px solid ${COLOR.line};">
            <tr>
              <td class="oe-pad oe-line" align="center" style="padding:32px 40px 24px 40px;border-bottom:1px solid ${COLOR.line};">
                <img src="${LOGO_URL}" alt="MrRework" height="40" style="height:40px;width:auto;display:inline-block;" />
              </td>
            </tr>
            <tr>
              <td class="oe-pad oe-ink" style="padding:40px;color:${COLOR.ink2};font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td class="oe-pad oe-line oe-stone" style="padding:28px 40px;background-color:${COLOR.paper2};border-top:1px solid ${COLOR.line};text-align:center;color:${COLOR.stone};font-size:12px;line-height:1.8;">
                Need help? <a href="mailto:${SUPPORT_EMAIL}" style="color:${COLOR.ink2};">${SUPPORT_EMAIL}</a><br />
                <a href="${FOOTER_LINKS.contact}" style="color:${COLOR.stone};text-decoration:underline;">Contact Support</a> ·
                <a href="${FOOTER_LINKS.privacy}" style="color:${COLOR.stone};text-decoration:underline;">Privacy Policy</a> ·
                <a href="${FOOTER_LINKS.terms}" style="color:${COLOR.stone};text-decoration:underline;">Terms &amp; Conditions</a> ·
                <a href="${FOOTER_LINKS.website}" style="color:${COLOR.stone};text-decoration:underline;">Website</a>
              </td>
            </tr>
            ${socialRow}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
