// Pure validation — no DB access, no framework imports. Every check here is
// a real, server-enforced rule (never a client-trusted flag); see
// promotionEngine.ts for how a passing discount actually gets applied and
// promotionSettings.ts for where the DB-derived context values come from.

export type DiscountType = "percentage" | "fixed" | "free_shipping" | "buy_x_get_y";

export interface DiscountRecord {
  _id: string;
  code?: string;
  type: DiscountType;
  value: number;
  description?: string;
  active: boolean;
  startsAt?: Date | string | null;
  expiresAt?: Date | string | null;
  minimumOrder: number;
  maximumDiscount?: number | null;
  usageLimit?: number | null;
  usageCount: number;
  perCustomerLimit?: number | null;
  automatic: boolean;
  freeShipping: boolean;
  stackable: boolean;
  priority: number;
  applicableProducts: string[];
  applicableCategories: string[];
  excludedProducts: string[];
  excludedCategories: string[];
  firstOrderOnly: boolean;
  buyQuantity?: number | null;
  getQuantity?: number | null;
  buyGetProduct?: string | null;
}

export interface CartLine {
  productId: string;
  category?: string;
  price: number;
  quantity: number;
}

export interface PromotionContext {
  subtotal: number;
  items: CartLine[];
  customerOrderCount: number; // completed/paid orders this customer has, for firstOrderOnly
  customerCodeUsageCount: number; // how many times THIS customer has used THIS discount, for perCustomerLimit
  now?: Date;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  eligibleLines: CartLine[]; // the subset of cart lines this discount actually applies to
}

function isExcluded(line: CartLine, discount: DiscountRecord): boolean {
  if (discount.excludedProducts.includes(line.productId)) return true;
  if (line.category && discount.excludedCategories.includes(line.category)) return true;
  return false;
}

function matchesRestriction(line: CartLine, discount: DiscountRecord): boolean {
  const hasProductRestriction = discount.applicableProducts.length > 0;
  const hasCategoryRestriction = discount.applicableCategories.length > 0;
  if (!hasProductRestriction && !hasCategoryRestriction) return true;
  const matchesProduct = hasProductRestriction && discount.applicableProducts.includes(line.productId);
  const matchesCategory = hasCategoryRestriction && !!line.category && discount.applicableCategories.includes(line.category);
  return matchesProduct || matchesCategory;
}

// The cart lines a discount's percentage/fixed amount actually computes
// against — restricted by applicableProducts/applicableCategories, minus
// anything excluded. An unrestricted discount (no applicable list at all)
// applies to the whole cart.
export function getEligibleLines(items: CartLine[], discount: DiscountRecord): CartLine[] {
  return items.filter((line) => !isExcluded(line, discount) && matchesRestriction(line, discount));
}

export function validateDiscount(discount: DiscountRecord, context: PromotionContext): ValidationResult {
  const now = context.now ?? new Date();
  const noLines: CartLine[] = [];

  if (!discount.active) return { valid: false, reason: "This discount is no longer active.", eligibleLines: noLines };

  if (discount.startsAt && now < new Date(discount.startsAt)) {
    return { valid: false, reason: "This discount isn't active yet.", eligibleLines: noLines };
  }
  if (discount.expiresAt && now > new Date(discount.expiresAt)) {
    return { valid: false, reason: "This discount has expired.", eligibleLines: noLines };
  }
  if (discount.usageLimit != null && discount.usageCount >= discount.usageLimit) {
    return { valid: false, reason: "This discount has reached its usage limit.", eligibleLines: noLines };
  }
  if (discount.perCustomerLimit != null && context.customerCodeUsageCount >= discount.perCustomerLimit) {
    return { valid: false, reason: "You've already used this discount the maximum number of times.", eligibleLines: noLines };
  }
  if (discount.firstOrderOnly && context.customerOrderCount > 0) {
    return { valid: false, reason: "This discount is only valid on your first order.", eligibleLines: noLines };
  }
  if (context.subtotal < discount.minimumOrder) {
    return { valid: false, reason: `A minimum order of ${discount.minimumOrder} is required for this discount.`, eligibleLines: noLines };
  }

  if (discount.type === "buy_x_get_y") {
    const qty = context.items.find((i) => i.productId === discount.buyGetProduct)?.quantity ?? 0;
    if (!discount.buyQuantity || qty < discount.buyQuantity) {
      return { valid: false, reason: "Your bag doesn't yet qualify for this offer.", eligibleLines: noLines };
    }
    return { valid: true, eligibleLines: context.items.filter((i) => i.productId === discount.buyGetProduct) };
  }

  const eligibleLines = getEligibleLines(context.items, discount);
  if (eligibleLines.length === 0 && (discount.applicableProducts.length > 0 || discount.applicableCategories.length > 0)) {
    return { valid: false, reason: "This discount doesn't apply to anything in your bag.", eligibleLines: noLines };
  }

  return { valid: true, eligibleLines: discount.type === "free_shipping" ? context.items : eligibleLines };
}
