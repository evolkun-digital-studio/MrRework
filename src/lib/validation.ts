import "server-only";
import { isValidObjectId as mongooseIsValidObjectId } from "mongoose";
import { NextResponse } from "next/server";

// Re-exported from mongoose rather than reimplemented with a hand-rolled
// regex — this is the exact same check the driver runs internally before
// casting a query condition to ObjectId, so "valid according to this
// helper" and "valid according to whatever's about to query the DB" can
// never drift apart into two subtly different definitions of "valid".
export const isValidObjectId = mongooseIsValidObjectId;

// Shared 400 response for a malformed :id path param — every admin [id]
// route below returns byte-identical shape for this case instead of
// letting Mongoose's CastError surface as an unhandled 500.
export function invalidIdResponse() {
  return NextResponse.json({ error: "Invalid id." }, { status: 400 });
}

// No project-wide inventory cap existed before the Stock Quantity field —
// this is that ceiling, shared by the product form's "Custom" input and
// both product API routes so the two can never drift apart. Configurable
// in the sense that changing this one constant changes the limit
// everywhere it's enforced.
export const MAX_STOCK_QUANTITY = 10_000;

// Shared by POST /api/admin/products (required) and PATCH
// /api/admin/products/[id] (only when `stock` is present in the body) —
// this is the authoritative check; the product form's own client-side
// validation (digit-only input, min/max on the number field) is only a UX
// convenience, never trusted on its own. Accepts a numeric string too,
// since the form always sends a JS number, but this can be reached with
// any JSON value.
export function validateStockQuantity(value: unknown): { ok: true; value: number } | { ok: false; error: string } {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return { ok: false, error: "Stock quantity is required and must be a number." };
  }
  if (!Number.isInteger(n)) {
    return { ok: false, error: "Stock quantity must be a whole number, with no decimals." };
  }
  if (n < 1) {
    return { ok: false, error: "Stock quantity must be greater than 0." };
  }
  if (n > MAX_STOCK_QUANTITY) {
    return { ok: false, error: `Stock quantity must be ${MAX_STOCK_QUANTITY.toLocaleString()} or fewer.` };
  }
  return { ok: true, value: n };
}

// Shared by POST /api/admin/products (required) and PATCH
// /api/admin/products/[id] (only when `productType` is present in the
// body) — the Retail catalog's isolation boundary starts here: an invalid
// value can never reach the database in the first place.
export function validateProductType(value: unknown): { ok: true; value: "shop" | "retail" } | { ok: false; error: string } {
  if (value !== "shop" && value !== "retail") {
    return { ok: false, error: 'Product type is required and must be "shop" or "retail".' };
  }
  return { ok: true, value };
}

// Coerces a value to a string only when it actually already is one —
// `undefined` for anything else (array, number, plain object, null).
// Several routes accept an optional code/token field and previously called
// .trim()/.toUpperCase() on it without checking its type first, which
// throws a TypeError (→ unhandled 500) for a non-string JSON value instead
// of failing validation with a clean 400.
export function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
