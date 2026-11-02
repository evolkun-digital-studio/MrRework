import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { PromoBannerModel } from "@/models/PromoBanner";

// Admin-edited, low-churn — same reasoning/window as /api/categories.
export const revalidate = 300;

export async function GET() {
  await dbConnect();
  const items = await PromoBannerModel.find({ isActive: true }).sort({ order: 1 }).lean();
  return NextResponse.json({ items });
}
