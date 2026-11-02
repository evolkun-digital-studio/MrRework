import "server-only";
import { ProductModel } from "@/models/Product";

// Shared by the single-product duplicate route
// (src/app/api/admin/products/[id]/duplicate/route.ts) and the bulk engine's
// `duplicate` action — one place for the slug/SKU-uniqueness suffixing so
// bulk-duplicating hundreds of products can't drift from what a single
// duplicate does.
export async function duplicateProduct(id: string): Promise<{ original: any; copy: any } | null> {
  const original = await ProductModel.findById(id).lean<any>();
  if (!original) return null;

  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const { _id, createdAt, updatedAt, ...rest } = original;
  const copy = await ProductModel.create({
    ...rest,
    name: `${original.name} (copy)`,
    slug: `${original.slug}-${suffix}`,
    sku: `${original.sku}-${suffix}`,
    status: "draft",
    salesCount: 0,
    rating: 0,
    reviewCount: 0,
  });

  return { original, copy };
}
