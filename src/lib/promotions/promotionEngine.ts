// Pure calculation — the one place discount math lives. No DB access; see
// promotionSettings.ts for how candidate discounts and customer-history
// counts are fetched, and orderCreation.ts / /api/promotions/calculate for
// the two (and only two) callers, so there is never a second, divergent
// implementation of this arithmetic anywhere else.
//
// Deliberately does not compute tax or a final tax-inclusive total — that
// stays entirely owned by src/lib/pricing.ts's calcTotals(), which already
// takes a `discount` number; this module just supplies that number (plus
// whether free shipping applies) so nothing duplicates the surrounding
// subtotal+shipping+tax-discount arithmetic.

import { validateDiscount, type DiscountRecord, type CartLine, type ValidationResult } from "./promotionValidation";

export interface CandidateDiscount {
  discount: DiscountRecord;
  customerCodeUsageCount: number;
}

export interface PromotionInput {
  subtotal: number;
  items: CartLine[];
  shipping: number;
  requestedCode?: string;
  customerOrderCount: number;
}

export interface AppliedDiscount {
  discountId: string;
  code?: string;
  type: DiscountRecord["type"];
  description: string;
  amountSaved: number;
}

export interface PromotionResult {
  appliedDiscounts: AppliedDiscount[];
  totalSavings: number;
  freeShippingApplied: boolean;
  finalSubtotal: number;
  finalShipping: number;
  finalTotal: number;
  codeError?: string;
}

export function calculatePromotions(input: PromotionInput, candidates: CandidateDiscount[]): PromotionResult {
  const now = new Date();
  const requestedCode = input.requestedCode?.trim().toUpperCase() || undefined;

  const evaluated = candidates.map(({ discount, customerCodeUsageCount }) => ({
    discount,
    result: validateDiscount(discount, {
      subtotal: input.subtotal, items: input.items, now,
      customerOrderCount: input.customerOrderCount, customerCodeUsageCount,
    }),
  }));

  let codeError: string | undefined;
  if (requestedCode) {
    const match = evaluated.find((e) => e.discount.code === requestedCode);
    if (!match) codeError = "That coupon code isn't valid.";
    else if (!match.result.valid) codeError = match.result.reason;
  }

  // Eligible = passes validation, AND is either automatic or the exact
  // code the customer entered — never any other code-based discount.
  const eligible = evaluated.filter(({ discount, result }) => {
    if (!result.valid) return false;
    return discount.automatic || (!!requestedCode && discount.code === requestedCode);
  });

  // Highest priority first. A candidate joins the applied set only if it
  // AND everything already applied are stackable — otherwise the single
  // highest-priority eligible discount wins alone (matches how Shopify
  // resolves an automatic discount against a coupon code by default).
  const sorted = [...eligible].sort((a, b) => b.discount.priority - a.discount.priority);
  const applied: { discount: DiscountRecord; result: ValidationResult }[] = [];
  for (const candidate of sorted) {
    if (applied.length === 0) { applied.push(candidate); continue; }
    const canStack = candidate.discount.stackable && applied.every((a) => a.discount.stackable);
    if (canStack) applied.push(candidate);
  }

  let remainingSubtotal = input.subtotal;
  let freeShippingApplied = false;
  const appliedDiscounts: AppliedDiscount[] = [];

  for (const { discount, result } of applied) {
    const eligibleBase = result.eligibleLines.reduce((n, l) => n + l.price * l.quantity, 0);
    let amountSaved = 0;

    if (discount.type === "percentage") {
      amountSaved = eligibleBase * (discount.value / 100);
    } else if (discount.type === "fixed") {
      amountSaved = Math.min(discount.value, eligibleBase);
    } else if (discount.type === "buy_x_get_y") {
      const line = result.eligibleLines[0];
      if (line) amountSaved = line.price * Math.min(discount.getQuantity ?? 0, line.quantity);
    }

    // `freeShipping` is an orthogonal modifier, not tied to one type — a
    // dedicated `type: "free_shipping"` discount (no monetary component)
    // grants it too, so either condition sets it.
    if (discount.freeShipping || discount.type === "free_shipping") freeShippingApplied = true;

    // Defense-in-depth: a discount should never INCREASE what the customer
    // owes. Admin-side validation (POST/PATCH /api/admin/coupons) is
    // supposed to keep a fixed discount's `value` positive, but this floor
    // means a corrupt/malicious record can't turn into a negative
    // amountSaved here regardless — the one place this arithmetic actually
    // runs, for both the live preview and the authoritative order total.
    amountSaved = Math.max(0, amountSaved);

    if (discount.maximumDiscount != null) amountSaved = Math.min(amountSaved, discount.maximumDiscount);
    amountSaved = Math.min(amountSaved, Math.max(0, remainingSubtotal));
    amountSaved = Math.round(amountSaved * 100) / 100;
    remainingSubtotal -= amountSaved;

    appliedDiscounts.push({
      discountId: String(discount._id),
      code: discount.code,
      type: discount.type,
      description: discount.code
        ? `Code ${discount.code}`
        : discount.type === "free_shipping" ? "Free shipping" : discount.description || "Automatic discount",
      amountSaved,
    });
  }

  const totalSavings = Math.round(appliedDiscounts.reduce((n, d) => n + d.amountSaved, 0) * 100) / 100;
  const finalSubtotal = Math.max(0, input.subtotal - totalSavings);
  const finalShipping = freeShippingApplied ? 0 : input.shipping;
  const finalTotal = Math.max(0, finalSubtotal + finalShipping);

  return { appliedDiscounts, totalSavings, freeShippingApplied, finalSubtotal, finalShipping, finalTotal, codeError };
}
