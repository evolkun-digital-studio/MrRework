import "server-only";
import { sendMail } from "./mail";
import { generateInvoicePdfBuffer, invoiceNumberFor } from "./invoicePdf";
import {
  orderConfirmationEmailHtml, orderConfirmationEmailText, orderConfirmationEmailSubject,
  orderStatusEmailHtml, orderStatusEmailText, orderStatusEmailSubject,
  type OrderEmailStatus,
} from "./emailTemplates/order";
import type { OrderEmailData } from "./emailTemplates/shell";
import { captureError } from "./errorMonitoring";

// Fired once, from the PayPal capture-order/webhook routes, the moment an
// order's paymentStatus transitions pending -> paid (i.e. "successfully
// placed" — see the plan discussion in orderCreation.ts: creating the Order
// row itself only ever leaves it "pending", awaiting payment). Never throws
// — mirrors sendMail()/logActivity()'s own contract, so every call site can
// fire this without its own try/catch.
export async function sendOrderConfirmation(order: OrderEmailData): Promise<void> {
  try {
    let attachments: { filename: string; content: Buffer; contentType?: string }[] | undefined;
    try {
      const pdf = await generateInvoicePdfBuffer(order);
      attachments = [{ filename: `${invoiceNumberFor(order.orderNumber)}.pdf`, content: pdf, contentType: "application/pdf" }];
    } catch (err) {
      // A broken invoice must never swallow the confirmation email itself —
      // send without the attachment rather than lose the notification.
      captureError(err, { context: "invoice PDF generation", orderNumber: order.orderNumber });
    }

    await sendMail({
      to: order.email,
      subject: orderConfirmationEmailSubject(order.orderNumber),
      text: orderConfirmationEmailText(order),
      html: orderConfirmationEmailHtml(order),
      attachments,
    });
  } catch (err) {
    captureError(err, { context: "sendOrderConfirmation", orderNumber: order.orderNumber });
  }
}

export async function sendOrderStatusEmail(order: OrderEmailData, status: OrderEmailStatus): Promise<void> {
  try {
    await sendMail({
      to: order.email,
      subject: orderStatusEmailSubject(order.orderNumber, status),
      text: orderStatusEmailText(order, status),
      html: orderStatusEmailHtml(order, status),
    });
  } catch (err) {
    captureError(err, { context: "sendOrderStatusEmail", orderNumber: order.orderNumber, status });
  }
}

// The same fulfillmentStatus/paymentStatus -> customer-facing status
// mapping already documented (for imported orders) in
// src/lib/import-export/orders/wooOrderMapping.ts's ORDER_STATUS_MAP,
// reused here so a live status change raises the matching email.
const FULFILLMENT_TO_EMAIL_STATUS: Partial<Record<string, OrderEmailStatus>> = {
  processing: "processing",
  pending: "on-hold",
  delivered: "completed",
  cancelled: "cancelled",
};
const PAYMENT_TO_EMAIL_STATUS: Partial<Record<string, OrderEmailStatus>> = {
  refunded: "refunded",
  failed: "failed",
};

// Diffs the order's fulfillment/payment status against what they were
// immediately before this save and fires the matching status email for
// each field that actually changed into one of the six target values —
// never on a no-op re-save of the same value. Called from the admin
// PATCH route and from the PayPal failure path; never throws.
export async function notifyOrderStatusChange(opts: {
  order: OrderEmailData & { fulfillmentStatus?: string; paymentStatus?: string };
  prevFulfillmentStatus?: string;
  prevPaymentStatus?: string;
}): Promise<void> {
  const { order, prevFulfillmentStatus, prevPaymentStatus } = opts;

  if (order.fulfillmentStatus && order.fulfillmentStatus !== prevFulfillmentStatus) {
    const status = FULFILLMENT_TO_EMAIL_STATUS[order.fulfillmentStatus];
    if (status) await sendOrderStatusEmail(order, status);
  }
  if (order.paymentStatus && order.paymentStatus !== prevPaymentStatus) {
    const status = PAYMENT_TO_EMAIL_STATUS[order.paymentStatus];
    if (status) await sendOrderStatusEmail(order, status);
  }
}
