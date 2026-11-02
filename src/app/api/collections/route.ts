import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { CollectionModel } from "@/models/Collection";

// Same reasoning as /api/categories/route.ts — admin-edited, low-churn
// reference data, explicitly scoped out of this app's otherwise-blanket
// force-dynamic policy. Cart/checkout/orders/auth/payments/search are all
// untouched.
export const revalidate = 300;

export async function GET() {
  await dbConnect();
  const items = await CollectionModel.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json({ items });
}
