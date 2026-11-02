import "server-only";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { formatPrice } from "./utils";
import { LOGO_URL, SUPPORT_EMAIL, FOOTER_LINKS } from "./orderEmailConfig";
import type { OrderEmailData } from "./emailTemplates/shell";

const INK = "#111111";
const STONE = "#6B6B6B";
const LINE = "#EAEAEA";

export function invoiceNumberFor(orderNumber: string): string {
  return `INV-${orderNumber}`;
}

// Rasterizes the site's hosted SVG logo (sharp already ships with libvips'
// SVG support, so no extra dependency) so pdfkit — which can only embed
// PNG/JPEG, not SVG — can place it in the invoice header. Returns null on
// any failure (host down, network hiccup, unexpected format) rather than
// throwing, so a logo problem never blocks invoice generation; the caller
// falls back to a text wordmark in that case.
async function fetchRasterizedLogo(): Promise<Buffer | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const svgBuffer = Buffer.from(await res.arrayBuffer());
    return await sharp(svgBuffer).resize({ height: 120 }).png().toBuffer();
  } catch {
    return null;
  }
}

function addressLines(addr?: OrderEmailData["shippingAddress"]): string[] {
  if (!addr) return ["—"];
  return [
    [addr.firstName, addr.lastName].filter(Boolean).join(" "),
    [addr.address, addr.apartment].filter(Boolean).join(", "),
    [addr.city, addr.state, addr.postalCode].filter(Boolean).join(", "),
    addr.country,
    addr.phone,
  ].filter(Boolean) as string[];
}

// Builds the invoice PDF entirely in memory (no temp files) — pdfkit
// streams pages as it draws them, so this collects those chunks into a
// single Buffer for sendMail()'s attachments option. Generated fresh at
// send time from the order's own current data, per the "generate the PDF
// dynamically at send time" requirement — nothing is cached/pre-rendered.
export async function generateInvoicePdfBuffer(order: OrderEmailData): Promise<Buffer> {
  const logo = await fetchRasterizedLogo();
  const currency = order.currency || "GBP";

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Header — logo (or text fallback) left, "INVOICE" + meta right.
  const headerTop = doc.y;
  if (logo) {
    doc.image(logo, doc.page.margins.left, headerTop, { height: 32 });
  } else {
    doc.font("Helvetica-Bold").fontSize(16).fillColor(INK)
      .text("MRREWORK", doc.page.margins.left, headerTop + 6);
  }

  doc.font("Helvetica-Bold").fontSize(20).fillColor(INK)
    .text("INVOICE", doc.page.margins.left, headerTop, { width: pageWidth, align: "right" });

  const orderDate = order.createdAt ? new Date(order.createdAt) : new Date();
  const metaLines = [
    ["Invoice Number", invoiceNumberFor(order.orderNumber)],
    ["Order Number", order.orderNumber],
    ["Order Date", orderDate.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })],
    ["Payment Method", order.paymentMethod ? order.paymentMethod[0].toUpperCase() + order.paymentMethod.slice(1) : "—"],
  ];
  // One plain right-aligned string per row (not a continued two-color
  // run) — pdfkit's `continued` + `align:"right"` combo repositions each
  // fragment from its own recalculated line width, which overlaps label and
  // value on top of each other instead of concatenating them.
  let metaY = headerTop + 28;
  for (const [label, value] of metaLines) {
    doc.font("Helvetica").fontSize(9.5).fillColor(STONE)
      .text(`${label}:  ${value}`, doc.page.margins.left, metaY, { width: pageWidth, align: "right" });
    metaY += 14;
  }
  doc.y = metaY;

  doc.moveDown(2);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageWidth, doc.y).strokeColor(LINE).stroke();
  doc.moveDown(1.2);

  // Customer / billing / shipping.
  const colWidth = pageWidth / 2 - 12;
  const blockTop = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(STONE).text("BILLING ADDRESS", doc.page.margins.left, blockTop);
  doc.font("Helvetica").fontSize(10).fillColor(INK)
    .text(addressLines(order.billingAddress).join("\n"), doc.page.margins.left, blockTop + 14, { width: colWidth });

  const rightColX = doc.page.margins.left + colWidth + 24;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(STONE).text("SHIPPING ADDRESS", rightColX, blockTop);
  doc.font("Helvetica").fontSize(10).fillColor(INK)
    .text(addressLines(order.shippingAddress).join("\n"), rightColX, blockTop + 14, { width: colWidth });

  doc.font("Helvetica-Bold").fontSize(9).fillColor(STONE).text("CUSTOMER EMAIL", doc.page.margins.left, doc.y + 16);
  doc.font("Helvetica").fontSize(10).fillColor(INK).text(order.email, doc.page.margins.left, doc.y + 2);

  doc.moveDown(1.5);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageWidth, doc.y).strokeColor(LINE).stroke();
  doc.moveDown(1);

  // Product table.
  const colX = { name: doc.page.margins.left, qty: doc.page.margins.left + pageWidth * 0.5, price: doc.page.margins.left + pageWidth * 0.65, total: doc.page.margins.left + pageWidth * 0.82 };
  const tableTop = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(STONE);
  doc.text("PRODUCT", colX.name, tableTop, { width: colX.qty - colX.name - 8 });
  doc.text("QTY", colX.qty, tableTop, { width: colX.price - colX.qty - 8, align: "right" });
  doc.text("PRICE", colX.price, tableTop, { width: colX.total - colX.price - 8, align: "right" });
  doc.text("TOTAL", colX.total, tableTop, { width: doc.page.margins.left + pageWidth - colX.total, align: "right" });
  doc.moveDown(0.6);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageWidth, doc.y).strokeColor(LINE).stroke();
  doc.moveDown(0.6);

  for (const item of order.items) {
    const rowTop = doc.y;
    const variant = [item.color, item.size].filter(Boolean).join(" · ");
    doc.font("Helvetica").fontSize(10).fillColor(INK)
      .text(item.name, colX.name, rowTop, { width: colX.qty - colX.name - 8 });
    if (variant || item.sku) {
      doc.font("Helvetica").fontSize(8.5).fillColor(STONE)
        .text([variant, item.sku].filter(Boolean).join(" · SKU "), colX.name, doc.y, { width: colX.qty - colX.name - 8 });
    }
    doc.font("Helvetica").fontSize(10).fillColor(INK);
    doc.text(String(item.quantity), colX.qty, rowTop, { width: colX.price - colX.qty - 8, align: "right" });
    doc.text(formatPrice(item.price, currency), colX.price, rowTop, { width: colX.total - colX.price - 8, align: "right" });
    doc.text(formatPrice(item.price * item.quantity, currency), colX.total, rowTop, { width: doc.page.margins.left + pageWidth - colX.total, align: "right" });
    doc.moveDown(1);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageWidth, doc.y).strokeColor(LINE).stroke();
    doc.moveDown(0.6);
  }

  // Totals.
  const totalsX = doc.page.margins.left + pageWidth * 0.6;
  const totalsLabelWidth = colX.total - totalsX - 8;
  const totalsValueWidth = doc.page.margins.left + pageWidth - colX.total;
  function totalRow(label: string, value: string, bold = false) {
    const y = doc.y;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 10).fillColor(bold ? INK : STONE)
      .text(label, totalsX, y, { width: totalsLabelWidth, align: "right" });
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 10).fillColor(INK)
      .text(value, colX.total, y, { width: totalsValueWidth, align: "right" });
    doc.moveDown(0.5);
  }
  doc.moveDown(0.4);
  totalRow("Subtotal", formatPrice(order.subtotal, currency));
  if (order.discount > 0) totalRow("Discount", `-${formatPrice(order.discount, currency)}`);
  if (order.tax > 0) totalRow("Tax", formatPrice(order.tax, currency));
  totalRow("Shipping", order.shipping === 0 ? "Free" : formatPrice(order.shipping, currency));
  doc.moveTo(totalsX, doc.y).lineTo(doc.page.margins.left + pageWidth, doc.y).strokeColor(LINE).stroke();
  doc.moveDown(0.4);
  totalRow("Grand Total", formatPrice(order.total, currency), true);

  // Footer.
  const footerY = doc.page.height - doc.page.margins.bottom - 30;
  doc.font("Helvetica").fontSize(8.5).fillColor(STONE)
    .text(`Questions about this invoice? ${SUPPORT_EMAIL} · ${FOOTER_LINKS.website}`, doc.page.margins.left, footerY, { width: pageWidth, align: "center" });

  doc.end();
  return done;
}
