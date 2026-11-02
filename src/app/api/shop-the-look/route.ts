import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ShopTheLookModel } from "@/models/ShopTheLook";

// Admin-edited, low-churn — same reasoning/window as /api/categories.
export const revalidate = 300;

export async function GET() {
  await dbConnect();
  const items = await ShopTheLookModel.find({ isActive: true }).sort({ order: 1 }).populate("hotspots.product", "name slug price priceMax images rating").lean();
  return NextResponse.json({ items });
}
