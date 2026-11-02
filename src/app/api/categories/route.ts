import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { CategoryModel } from "@/models/Category";
import { ProductModel } from "@/models/Product";
import { STOREFRONT_VISIBLE } from "@/lib/search";

// Categories are admin-edited and change rarely — unlike the rest of this
// app's API routes (deliberately force-dynamic: cart/orders/search/auth all
// need every request fresh), this one previously re-ran a full product
// aggregation on every single call even though the header/shop filters hit
// it on nearly every page load. A 5-minute cache is a standard trade-off
// for this kind of low-churn reference data: an admin's edit can take up
// to 5 minutes to show up on the storefront, in exchange for not hitting
// Mongo on every page view. Explicitly scoped to just this route — cart,
// checkout, orders, auth, payments, and search all remain untouched.
export const revalidate = 300;

export async function GET() {
  await dbConnect();
  const cats = await CategoryModel.find().sort({ order: 1 }).lean();
  const counts = await ProductModel.aggregate([
    { $match: STOREFRONT_VISIBLE },
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);
  const map = new Map(counts.map((c: any) => [c._id, c.count]));
  const withCounts = cats.map((c: any) => ({ ...c, count: map.get(c.slug) ?? 0 }));
  return NextResponse.json({ items: withCounts });
}
