import "server-only";
import { ProductModel } from "@/models/Product";

// Extracted from paypalAbandonedCheckout.ts's original inline logic so the
// exact same compare-and-swap stock-restore can be reused everywhere an
// Order's reserved stock needs releasing, not just the abandoned-checkout
// sweep — every "stock was decremented at order-creation time, then this
// order ended up NOT completing" path needs the same undo. Before this,
// only two such paths existed (createPendingOrder's own in-request
// rollback, and the abandoned-checkout sweep for orders still "pending");
// an order that reached create-order/capture-order's "failed" branch, or
// an admin-marked refund/cancellation, was never revisited — a real,
// silent inventory leak on ordinary payment failures (see the pre-launch
// certification audit / production hardening sprint).
export async function releaseOrderStock(
  items: { product: unknown; size?: string; color?: string; quantity: number }[]
): Promise<void> {
  const affectedProductIds = new Set<string>();

  await Promise.all(
    items.map(async (item) => {
      if (!item.product) return;
      // Same compare-and-swap shape as the decrement in orderCreation.ts,
      // run in reverse — a no-op (matchedCount 0) for a non-variant
      // (unlimited-stock) line, exactly mirroring that nothing was ever
      // decremented for one of those in the first place.
      await ProductModel.updateOne(
        { _id: item.product, variants: { $elemMatch: { size: item.size, color: item.color } } },
        { $inc: { "variants.$[v].stock": item.quantity } },
        { arrayFilters: [{ "v.size": item.size, "v.color": item.color }] }
      ).catch(() => {});
      affectedProductIds.add(String(item.product));
    })
  );

  // Recompute `inStock` for anything touched — a product that had gone out
  // of stock because of this reservation correctly flips back once it's
  // released.
  if (affectedProductIds.size) {
    const fresh = await ProductModel.find({ _id: { $in: [...affectedProductIds] } });
    await Promise.all(
      fresh.map((p: any) => {
        const newInStock = p.variants.some((v: any) => v.stock > 0);
        if (p.inStock !== newInStock) {
          p.inStock = newInStock;
          return p.save();
        }
        return null;
      })
    );
  }
}
