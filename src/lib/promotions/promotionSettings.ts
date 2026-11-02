import "server-only";
import { dbConnect } from "@/lib/mongodb";
import { CouponModel } from "@/models/Coupon";
import { OrderModel } from "@/models/Order";
import type { DiscountRecord } from "./promotionValidation";
import type { CandidateDiscount } from "./promotionEngine";

function toDiscountRecord(doc: any): DiscountRecord {
  return {
    _id: String(doc._id),
    code: doc.code || undefined,
    type: doc.type,
    value: doc.value ?? 0,
    description: doc.description || "",
    active: !!doc.active,
    startsAt: doc.startsAt ?? null,
    expiresAt: doc.expiresAt ?? null,
    minimumOrder: doc.minimumOrder ?? 0,
    maximumDiscount: doc.maximumDiscount ?? null,
    usageLimit: doc.usageLimit ?? null,
    usageCount: doc.usageCount ?? 0,
    perCustomerLimit: doc.perCustomerLimit ?? null,
    automatic: !!doc.automatic,
    freeShipping: !!doc.freeShipping,
    stackable: !!doc.stackable,
    priority: doc.priority ?? 0,
    applicableProducts: (doc.applicableProducts ?? []).map(String),
    applicableCategories: doc.applicableCategories ?? [],
    excludedProducts: (doc.excludedProducts ?? []).map(String),
    excludedCategories: doc.excludedCategories ?? [],
    firstOrderOnly: !!doc.firstOrderOnly,
    buyQuantity: doc.buyQuantity ?? null,
    getQuantity: doc.getQuantity ?? null,
    buyGetProduct: doc.buyGetProduct ? String(doc.buyGetProduct) : null,
  };
}

// Every automatic discount is always a candidate; the entered code (if any)
// is added on top — never any OTHER code-based discount, so a customer
// can't accidentally (or deliberately) trigger a coupon meant for someone
// else just by this query being broader than it needs to be.
export async function getCandidateDiscounts(code?: string): Promise<DiscountRecord[]> {
  await dbConnect();
  const or: Record<string, unknown>[] = [{ automatic: true }];
  const trimmed = code?.trim().toUpperCase();
  if (trimmed) or.push({ code: trimmed });

  const docs = await CouponModel.find({ $or: or }).lean();
  return docs.map(toDiscountRecord);
}

// Usage/order counts are based on order *placement*, not payment
// completion — matching how this app already creates an Order (pending)
// as the moment a purchase is committed (see orderCreation.ts;
// paymentStatus for "card" orders in this environment never even
// transitions automatically). A cancelled/refunded order isn't
// automatically un-counted — a deliberately out-of-scope refinement for a
// later pass.
export async function getCustomerPromotionHistory(
  account: { _id: unknown; email?: string },
  candidates: DiscountRecord[]
): Promise<{ customerOrderCount: number; usageByDiscount: Map<string, number> }> {
  await dbConnect();
  const or: Record<string, unknown>[] = [{ user: account._id }];
  if (account.email) or.push({ email: account.email });

  const [customerOrderCount, pastOrders] = await Promise.all([
    OrderModel.countDocuments({ $or: or }),
    OrderModel.find({ $or: or }).select("couponCodes").lean<{ couponCodes?: string[] }[]>(),
  ]);

  const usageByDiscount = new Map<string, number>();
  for (const c of candidates) {
    if (!c.code) continue;
    const count = pastOrders.filter((o) => (o.couponCodes ?? []).includes(c.code!)).length;
    usageByDiscount.set(c._id, count);
  }

  return { customerOrderCount, usageByDiscount };
}

export async function buildCandidateDiscounts(
  code: string | undefined,
  account: { _id: unknown; email?: string }
): Promise<{ candidates: CandidateDiscount[]; customerOrderCount: number }> {
  const discounts = await getCandidateDiscounts(code);
  const { customerOrderCount, usageByDiscount } = await getCustomerPromotionHistory(account, discounts);
  const candidates: CandidateDiscount[] = discounts.map((discount) => ({
    discount,
    customerCodeUsageCount: usageByDiscount.get(discount._id) ?? 0,
  }));
  return { candidates, customerOrderCount };
}

// Atomically reserves usage for each discount BEFORE it's priced into an
// order — called from createPendingOrder() ahead of OrderModel.create(),
// mirroring the stock compare-and-swap-then-rollback pattern used a few
// lines above it in that file.
//
// Each id gets its own conditional updateOne (not a single updateMany) so
// we can tell WHICH ones actually got the last available use: a document
// with a usageLimit only matches (and increments) if its OWN usageCount is
// still below its OWN usageLimit at the moment MongoDB applies the update,
// so two concurrent orders racing for the last remaining use of a limited
// code can't both win. The caller must abort (and release via
// releaseDiscountUsage) if any requested id is missing from the returned
// array — that discount lost the race and must not be priced into an order.
export async function reserveDiscountUsage(discountIds: string[]): Promise<string[]> {
  if (discountIds.length === 0) return [];
  await dbConnect();
  const results = await Promise.all(
    discountIds.map(async (id) => {
      const res = await CouponModel.updateOne(
        {
          _id: id,
          $or: [
            { usageLimit: null },
            { usageLimit: { $exists: false } },
            { $expr: { $lt: ["$usageCount", "$usageLimit"] } },
          ],
        },
        { $inc: { usageCount: 1 } }
      );
      return res.modifiedCount > 0 ? id : null;
    })
  );
  return results.filter((id): id is string => id !== null);
}

// Releases a reservation made by reserveDiscountUsage — used when an order
// that already reserved usage fails to complete for an unrelated reason
// (out of stock, a later validation error, a crash), mirroring
// rollbackDecrements() for stock in the same file.
export async function releaseDiscountUsage(discountIds: string[]) {
  if (discountIds.length === 0) return;
  await dbConnect();
  await CouponModel.updateMany({ _id: { $in: discountIds } }, { $inc: { usageCount: -1 } });
}
