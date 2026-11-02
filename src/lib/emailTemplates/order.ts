import "server-only";
import {
  orderEmailShell, renderOrderSummaryHtml, orderEmailAddressesHtml, actionButtonsHtml,
  statusBadgeHtml, customerName, type OrderEmailData,
} from "./shell";
import { viewOrderUrl } from "../orderEmailConfig";

// The six WooCommerce-style order statuses this app raises customer emails
// for — see src/lib/orderNotifications.ts for how live fulfillmentStatus/
// paymentStatus transitions map onto these (the same mapping already used
// for imported orders in src/lib/import-export/orders/wooOrderMapping.ts).
export type OrderEmailStatus = "processing" | "on-hold" | "completed" | "cancelled" | "refunded" | "failed";

interface StatusCopy {
  subject: string;
  headline: string;
  badgeColor: string;
  explanation: string;
}

const STATUS_COPY: Record<OrderEmailStatus, StatusCopy> = {
  processing: {
    subject: "Your order is being processed",
    headline: "Your order is being processed",
    badgeColor: "#2A2A2A",
    explanation: "We've received your order and our team is now preparing your items. We'll let you know as soon as it ships.",
  },
  "on-hold": {
    subject: "Your order is on hold",
    headline: "Your order is on hold",
    badgeColor: "#B08900",
    explanation: "Your order is currently on hold — this usually means we're awaiting payment confirmation or verifying a detail before we continue. We'll update you as soon as it moves forward.",
  },
  completed: {
    subject: "Your order is complete",
    headline: "Your order is complete",
    badgeColor: "#5B9A70",
    explanation: "Your order has been fulfilled and delivered. We hope you love your new pieces — thank you for shopping with us.",
  },
  cancelled: {
    subject: "Your order has been cancelled",
    headline: "Your order has been cancelled",
    badgeColor: "#B23B3B",
    explanation: "Your order has been cancelled and will not be processed further. If a payment was taken, it will be refunded automatically to your original payment method.",
  },
  refunded: {
    subject: "Your order has been refunded",
    headline: "Your order has been refunded",
    badgeColor: "#2A2A2A",
    explanation: "We've processed a refund for this order. Please allow a few business days for it to appear on your original payment method.",
  },
  failed: {
    subject: "There was a problem with your order",
    headline: "We couldn't process your payment",
    badgeColor: "#B23B3B",
    explanation: "We weren't able to process payment for this order, so no charge has been made. Please try again, or get in touch if you'd like a hand.",
  },
};

export function orderStatusEmailSubject(orderNumber: string, status: OrderEmailStatus): string {
  return `${STATUS_COPY[status].subject} · Order #${orderNumber}`;
}

export function orderStatusEmailHtml(order: OrderEmailData, status: OrderEmailStatus): string {
  const copy = STATUS_COPY[status];
  const name = customerName(order.shippingAddress);
  return orderEmailShell(`
    <p style="margin:0 0 16px 0;">${statusBadgeHtml(status.replace("-", " "), copy.badgeColor)}</p>
    <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:800;letter-spacing:-0.01em;color:#111111;">${copy.headline}</h1>
    <p style="margin:0 0 8px 0;">Hi ${name},</p>
    <p style="margin:0 0 28px 0;">${copy.explanation}</p>
    <p style="margin:0 0 28px 0;font-size:13px;color:#6B6B6B;">Order <strong style="color:#111111;">#${order.orderNumber}</strong></p>
    <h2 style="margin:0 0 16px 0;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;color:#6B6B6B;">Order summary</h2>
    ${renderOrderSummaryHtml(order)}
    ${actionButtonsHtml({ viewOrderUrl: viewOrderUrl(order.orderNumber), trackOrderUrl: order.trackingUrl })}
  `, { preheader: copy.explanation });
}

export function orderStatusEmailText(order: OrderEmailData, status: OrderEmailStatus): string {
  const copy = STATUS_COPY[status];
  const name = customerName(order.shippingAddress);
  const currency = order.currency || "GBP";
  const itemLines = order.items.map((i) => `  - ${i.name}${i.size || i.color ? ` (${[i.color, i.size].filter(Boolean).join(" · ")})` : ""} x${i.quantity}`).join("\n");
  return `${copy.headline}\n\nHi ${name},\n\n${copy.explanation}\n\nOrder #${order.orderNumber}\n\nItems:\n${itemLines}\n\nTotal: ${order.total} ${currency}\n\nView your order: ${viewOrderUrl(order.orderNumber)}${order.trackingUrl ? `\nTrack your order: ${order.trackingUrl}` : ""}`;
}

export function orderConfirmationEmailSubject(orderNumber: string): string {
  return `Order Confirmed · #${orderNumber}`;
}

export function orderConfirmationEmailHtml(order: OrderEmailData): string {
  const name = customerName(order.shippingAddress);
  return orderEmailShell(`
    <p style="margin:0 0 16px 0;">${statusBadgeHtml("Order confirmed", "#5B9A70")}</p>
    <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:800;letter-spacing:-0.01em;color:#111111;">Thank you for your order</h1>
    <p style="margin:0 0 8px 0;">Hi ${name},</p>
    <p style="margin:0 0 28px 0;">We've received your order and payment — it's confirmed and will move to processing shortly. Your invoice is attached to this email.</p>
    <p style="margin:0 0 28px 0;font-size:13px;color:#6B6B6B;">Order <strong style="color:#111111;">#${order.orderNumber}</strong> · Placed ${order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" }) : ""}</p>
    <h2 style="margin:0 0 16px 0;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;color:#6B6B6B;">Order summary</h2>
    ${renderOrderSummaryHtml(order)}
    ${orderEmailAddressesHtml(order)}
    ${actionButtonsHtml({ viewOrderUrl: viewOrderUrl(order.orderNumber), trackOrderUrl: order.trackingUrl })}
  `, { preheader: "Your order is confirmed — invoice attached." });
}

export function orderConfirmationEmailText(order: OrderEmailData): string {
  const name = customerName(order.shippingAddress);
  const currency = order.currency || "GBP";
  const itemLines = order.items.map((i) => `  - ${i.name}${i.size || i.color ? ` (${[i.color, i.size].filter(Boolean).join(" · ")})` : ""} x${i.quantity}`).join("\n");
  return `Thank you for your order\n\nHi ${name},\n\nWe've received your order and payment — it's confirmed and will move to processing shortly. Your invoice is attached to this email.\n\nOrder #${order.orderNumber}\n\nItems:\n${itemLines}\n\nTotal: ${order.total} ${currency}\n\nView your order: ${viewOrderUrl(order.orderNumber)}`;
}
