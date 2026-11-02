import { Types } from "mongoose";
import { ReviewModel } from "@/models/Review";
import { ProductModel } from "@/models/Product";

// Recomputes a product's denormalized rating/reviewCount from its approved
// reviews — the same two fields ProductCard/ProductDetail already read.
// Extracted from src/app/api/admin/reviews/[id]/route.ts (previously a
// private, unexported copy) so the Review Migration System's importer and
// repair script can call the exact same aggregation the admin moderation
// routes already trust, rather than a second, potentially-divergent one.
//
// Bug fixed during extraction: the original `$match: { product: productId }`
// compared a plain string against the schema's ObjectId-typed `product`
// field. Unlike `.find()`, Mongoose's `.aggregate()` does not cast query
// values against the schema — so this `$match` never matched anything,
// silently zeroing every product's rating/reviewCount on every approve/
// reject/delete action since the admin Reviews module shipped. Found via
// direct testing while wiring the Review Migration System's own dependency
// on this function; fixed by casting explicitly with `new Types.ObjectId(...)`.
export async function syncProductRating(productId: string) {
  const stats = await ReviewModel.aggregate([
    { $match: { product: new Types.ObjectId(productId), status: "approved" } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  const { avg = 0, count = 0 } = stats[0] ?? {};
  await ProductModel.findByIdAndUpdate(productId, { rating: Math.round(avg * 10) / 10, reviewCount: count });
}
