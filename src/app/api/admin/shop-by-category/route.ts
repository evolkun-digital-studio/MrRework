import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ShopByCategorySectionModel } from "@/models/ShopByCategorySection";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
const SLUGS = ["men-s", "women-s", "premium", "accessories", "unisex"];
const defaults = () => SLUGS.map((categorySlug, displayOrder) => ({ categorySlug, customImage: "", enabled: true, displayOrder }));

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  await dbConnect();
  const item = await ShopByCategorySectionModel.findOne().lean();
  return NextResponse.json({ item: item ?? { enabled: true, title: "Shop by Category", subtitle: "Discover our collections", categories: defaults() } });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  await dbConnect();
  const item = await ShopByCategorySectionModel.findOneAndUpdate({}, { $set: {
    enabled: body.enabled !== false,
    title: String(body.title ?? "Shop by Category"),
    subtitle: String(body.subtitle ?? "Discover our collections"),
    categories: Array.isArray(body.categories) ? body.categories.map((entry: any, index: number) => ({ categorySlug: String(entry.categorySlug), customImage: String(entry.customImage ?? ""), enabled: entry.enabled !== false, displayOrder: Number(entry.displayOrder ?? index) })) : defaults(),
  } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  return NextResponse.json({ item });
}
