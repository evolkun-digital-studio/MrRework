import "server-only";
import { randomUUID } from "crypto";
import { ProductModel } from "@/models/Product";
import { OrderModel } from "@/models/Order";
import { CartModel } from "@/models/Cart";
import { calcTotals, type ShippingMethod } from "@/lib/pricing";
import { getOrCreateCartSessionId } from "@/lib/cartSession";
import { getOrCreateAccountUser } from "@/lib/account";
import { getShippingSettingsDoc, getShippingSettings } from "@/lib/shipping/shippingSettings";
import { getAvailableShippingMethods } from "@/lib/shipping/shippingCalculator";
import { buildCandidateDiscounts, reserveDiscountUsage, releaseDiscountUsage } from "@/lib/promotions/promotionSettings";
import { calculatePromotions } from "@/lib/promotions/promotionEngine";
import type { CartLine } from "@/lib/promotions/promotionValidation";
import { isValidObjectId, asOptionalString } from "@/lib/validation";
import { EMAIL_RE } from "@/lib/customerAuth";
import { isStoredPhoneValid } from "@/lib/phoneValidation";

// Mirrors REQUIRED in checkout/page.tsx exactly — that client-side list is
// the only place these fields were previously enforced, so a script calling
// this API directly could create an order with no shippable address at all.
const REQUIRED_ADDRESS_FIELDS = ["firstName", "lastName", "country", "city", "address", "postalCode", "phone"] as const;

export interface OrderItemInput { productId: string; size?: string; color?: string; quantity: number }

export interface CreatePendingOrderInput {
  email: string;
  items: OrderItemInput[];
  shippingAddress: unknown;
  paymentMethod: string;
  shippingMethod?: ShippingMethod;
  coupon?: string;
  // Client-generated once per checkout attempt (see checkout/page.tsx) —
  // lets a double-click, a retried fetch after a client-side timeout, or two
  // concurrent tabs resolve to the SAME order instead of creating a
  // duplicate and decrementing stock twice. Optional/sparse so nothing that
  // doesn't send one (imports, older clients) is affected.
  idempotencyKey?: string;
}

// Thrown for anything the caller should turn into an HTTP error response —
// keeps this module framework-agnostic (no NextResponse import here) so
// both /api/orders and /api/payments/paypal/create-order can catch it and
// map to their own response shape.
export class OrderCreationError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const SHIPPING_METHODS: ShippingMethod[] = ["standard", "express", "pickup"];

// The single place that re-prices, re-validates stock, and creates the
// pending Order document — extracted from what used to be inline in
// POST /api/orders/route.ts so the PayPal create-order route can reuse the
// exact same validation instead of duplicating it. Behavior is unchanged
// from the original inline version; only the "assign email/paymentMethod
// error into an HTTP response" part moved to each caller.
export async function createPendingOrder(input: CreatePendingOrderInput) {
  const { email, items, shippingAddress, paymentMethod, shippingMethod, coupon, idempotencyKey } = input;

  // Handles the common case (a genuine resubmission arriving after the
  // first one already committed) before anything else runs — no stock
  // check, no decrement, no second Order. The rarer true-concurrent race
  // (two requests both reaching here before either has committed) is
  // closed below by the unique index on idempotencyKey at the actual
  // OrderModel.create() call.
  if (idempotencyKey) {
    const existing = await OrderModel.findOne({ idempotencyKey });
    if (existing) return existing;
  }

  if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    throw new OrderCreationError("A valid contact email is required.", 400);
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new OrderCreationError("Your bag is empty.", 400);
  }
  if (shippingMethod !== undefined && !SHIPPING_METHODS.includes(shippingMethod)) {
    throw new OrderCreationError("Invalid shipping method.", 400);
  }
  for (const i of items) {
    if (!i.productId || !isValidObjectId(i.productId) || typeof i.quantity !== "number" || i.quantity <= 0) {
      throw new OrderCreationError("Invalid item quantity in your bag.", 400);
    }
  }

  // Server-side enforcement of the same required-field list the checkout
  // form already enforces client-side — that client check is trivially
  // bypassed by calling this API directly, which previously let an order be
  // created with no shippable address at all (shippingAddress is
  // Schema.Types.Mixed with nothing marked `required`).
  const addrInput = (shippingAddress ?? {}) as Record<string, unknown>;
  for (const field of REQUIRED_ADDRESS_FIELDS) {
    if (!String(addrInput[field] ?? "").trim()) {
      throw new OrderCreationError("Please provide a complete shipping address.", 400);
    }
  }

  // Mirrors the client's isPhoneValid() check in checkout/page.tsx. Checkout
  // itself always sends E.164 (PhoneField + toE164()), but this API can be
  // called directly, so a plausible-but-wrong string ("phone": "abc") is
  // still caught here rather than stored as-is.
  if (!isStoredPhoneValid(String(addrInput.phone ?? ""))) {
    throw new OrderCreationError("Please provide a valid phone number.", 400);
  }

  // A non-string coupon code (array/number/object) previously reached
  // buildCandidateDiscounts()/calculatePromotions() and threw a TypeError
  // (.trim() on a non-string) instead of failing validation cleanly.
  const safeCoupon = asOptionalString(coupon);

  // Re-price and re-validate stock against live product data — never trust
  // amounts or availability sent by the client.
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await ProductModel.find({ _id: { $in: productIds } });
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const orderItems: any[] = [];
  for (const i of items) {
    const product = byId.get(i.productId);
    if (!product) {
      throw new OrderCreationError("One of the items in your bag is no longer available.", 409);
    }
    const variant = product.variants?.length
      ? product.variants.find((v: any) => v.size === i.size && v.color === i.color)
      : null;
    const stock = product.variants?.length ? variant?.stock ?? 0 : product.inStock ? Infinity : 0;

    if (!product.inStock || stock < i.quantity) {
      throw new OrderCreationError(`${product.name} (${i.color ?? ""} ${i.size ?? ""}) is out of stock.`, 409);
    }

    orderItems.push({
      product: product._id, name: product.name, sku: variant?.sku ?? product.sku,
      size: i.size, color: i.color, price: product.price, quantity: i.quantity,
      image: product.images?.[0],
    });
  }

  // Atomically decrement stock for variant-tracked items. The check above
  // (reading `products` once, up front) can be stale by the time this runs —
  // a plain read-then-`.save()` here would let two concurrent requests both
  // read the same stock value and both "succeed", overselling the last unit.
  // Each decrement is its own compare-and-swap (only applies if enough stock
  // is still there); a later item failing rolls back any earlier decrements
  // from this same request, so a multi-item order never partially commits.
  const decremented: { productId: string; size?: string; color?: string; quantity: number }[] = [];
  async function rollbackDecrements() {
    await Promise.all(decremented.map((d) =>
      ProductModel.updateOne(
        { _id: d.productId },
        { $inc: { "variants.$[v].stock": d.quantity } },
        { arrayFilters: [{ "v.size": d.size, "v.color": d.color }] }
      )
    ));
  }

  // Populated once discount usage is reserved (see below) so the catch
  // block can release it if anything later fails — the discount analogue
  // of `decremented`/rollbackDecrements() above.
  let reservedDiscountIds: string[] = [];

  let order;
  try {
    for (const i of items) {
      const product = byId.get(i.productId)!;
      if (!product.variants?.length) continue; // unlimited-stock products have nothing to decrement
      const res = await ProductModel.updateOne(
        { _id: product._id, variants: { $elemMatch: { size: i.size, color: i.color, stock: { $gte: i.quantity } } } },
        { $inc: { "variants.$[v].stock": -i.quantity } },
        { arrayFilters: [{ "v.size": i.size, "v.color": i.color }] }
      );
      if (res.matchedCount === 0) {
        throw new OrderCreationError(`${product.name} (${i.color ?? ""} ${i.size ?? ""}) is out of stock.`, 409);
      }
      decremented.push({ productId: i.productId, size: i.size, color: i.color, quantity: i.quantity });
    }

    const resolvedShippingMethod: ShippingMethod = shippingMethod ?? "standard";

    // Authoritative shipping cost — reads live, admin-configured settings
    // (src/lib/shipping/shippingSettings.ts) rather than the env-var
    // defaults, and cross-checks the requested method is actually sellable
    // for this destination (never trusts the client's choice of method).
    const addr = shippingAddress as { country?: string; state?: string; city?: string; firstName?: string; lastName?: string; phone?: string } | undefined;
    const shippingSettingsDoc = await getShippingSettingsDoc();
    const shippingSettings = getShippingSettings(shippingSettingsDoc);
    const subtotalForShipping = orderItems.reduce((n, i) => n + i.price * i.quantity, 0);
    const availableMethods = getAvailableShippingMethods(
      { subtotal: subtotalForShipping, country: addr?.country, state: addr?.state, city: addr?.city },
      shippingSettings
    );
    const selectedMethod = availableMethods.find((m) => m.id === resolvedShippingMethod);
    if (!selectedMethod) {
      throw new OrderCreationError("The selected shipping method isn't available for this address.", 400);
    }

    // Link the order to this browser's account (see /account/orders) without
    // changing anything about how the order itself is priced/created. Also
    // opportunistically fills in account profile fields that are still empty —
    // never overwrites anything the user already set on their Profile page.
    // This is best-effort: if it fails (e.g. that email already belongs to a
    // different account), the order still gets created normally below.
    // Resolved before pricing since the promotion engine needs this
    // customer's order/coupon-usage history.
    const account = await getOrCreateAccountUser();
    try {
      if (!account.email) account.email = email.trim().toLowerCase();
      if (!account.firstName && addr?.firstName) account.firstName = addr.firstName;
      if (!account.lastName && addr?.lastName) account.lastName = addr.lastName;
      if (!account.phone && addr?.phone) account.phone = addr.phone;
      await account.save();
    } catch {
      // Non-fatal — order linkage below still uses account._id regardless.
    }

    // Authoritative discount calculation — never trusts a client-sent
    // amount; recomputed here from the server-validated cart/customer/
    // coupon-code exactly like shipping above. See src/lib/promotions/.
    const cartLines: CartLine[] = items.map((i) => {
      const product = byId.get(i.productId)!;
      return { productId: i.productId, category: product.category, price: product.price, quantity: i.quantity };
    });
    const { candidates, customerOrderCount } = await buildCandidateDiscounts(safeCoupon, account);
    const promo = calculatePromotions(
      { subtotal: subtotalForShipping, items: cartLines, shipping: selectedMethod.cost, requestedCode: safeCoupon, customerOrderCount },
      candidates
    );
    // A coupon the customer explicitly typed must actually apply — if it
    // became invalid between the checkout preview and this submission
    // (expired, just hit its usage limit, etc.), reject rather than
    // silently charging a different total than what was shown.
    if (safeCoupon && promo.codeError) {
      throw new OrderCreationError(promo.codeError, 400);
    }

    // Reserve usage for every discount about to be priced into this order
    // BEFORE it's baked into totals/OrderModel.create() — closes the race
    // where two concurrent checkouts both read the same stale usageCount,
    // both get the discount priced in, and only afterward would a
    // post-creation increment (correctly, but too late) cap the counter.
    // If any requested discount lost the race for its last remaining use,
    // abort before the order is created — same shape as the stock
    // out-of-stock rejection just above.
    if (promo.appliedDiscounts.length) {
      const requestedDiscountIds = promo.appliedDiscounts.map((d) => d.discountId);
      reservedDiscountIds = await reserveDiscountUsage(requestedDiscountIds);
      if (reservedDiscountIds.length !== requestedDiscountIds.length) {
        throw new OrderCreationError(
          "One of your discount codes just reached its usage limit. Please refresh and try again.",
          409
        );
      }
    }

    const totals = calcTotals(
      orderItems.map((i) => ({ price: i.price, quantity: i.quantity })),
      {
        shippingMethod: resolvedShippingMethod,
        shippingSettings,
        destination: { country: addr?.country, state: addr?.state, city: addr?.city },
        discount: promo.totalSavings,
        forceFreeShipping: promo.freeShippingApplied,
      }
    );
    const orderNumber = `EP-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;

    order = await OrderModel.create({
      orderNumber,
      idempotencyKey,
      user: account._id,
      email,
      items: orderItems,
      subtotal: totals.subtotal, shipping: totals.shipping, tax: totals.tax, discount: totals.discount, total: totals.total,
      shippingMethod: resolvedShippingMethod,
      coupon: safeCoupon?.trim() ? safeCoupon.trim() : undefined,
      couponCodes: promo.appliedDiscounts.filter((d) => d.code).map((d) => d.code as string),
      appliedDiscounts: promo.appliedDiscounts,
      shippingAddress, billingAddress: shippingAddress,
      paymentMethod: paymentMethod ?? "card",
      paymentStatus: "pending",
      fulfillmentStatus: "unfulfilled",
    });
    // Discount usage was already reserved atomically, before pricing, above —
    // nothing left to record here now that the order exists.
  } catch (err) {
    // Whatever failed — insufficient stock on a later item, a discount
    // losing its usage-reservation race, or the Order document itself
    // failing to create — no stock decrement or discount-usage reservation
    // from this request should survive it.
    await rollbackDecrements();
    await releaseDiscountUsage(reservedDiscountIds);

    // The narrow true-concurrency case the upfront findOne() above can't
    // catch: two requests with the same idempotencyKey both passed that
    // check before either had committed. The unique index lets exactly one
    // OrderModel.create() succeed; this one lost the race — its own stock
    // decrements are already rolled back above, so return the winning
    // order instead of surfacing a duplicate-key error to the customer.
    if (idempotencyKey && (err as any)?.code === 11000 && (err as any)?.keyPattern?.idempotencyKey) {
      const winner = await OrderModel.findOne({ idempotencyKey });
      if (winner) return winner;
    }
    throw err;
  }

  // Recompute inStock from each affected product's now-current variant
  // stocks — the in-memory `products` copies are stale after the atomic
  // decrements above, so this re-reads rather than trusting them.
  const affectedIds = [...new Set(decremented.map((d) => d.productId))];
  if (affectedIds.length) {
    const fresh = await ProductModel.find({ _id: { $in: affectedIds } });
    await Promise.all(fresh.map((p) => {
      const newInStock = p.variants.some((v: any) => v.stock > 0);
      if (p.inStock !== newInStock) { p.inStock = newInStock; return p.save(); }
      return null;
    }));
  }

  const sessionId = await getOrCreateCartSessionId();
  await CartModel.findOneAndUpdate({ sessionId }, { items: [] });

  return order;
}
