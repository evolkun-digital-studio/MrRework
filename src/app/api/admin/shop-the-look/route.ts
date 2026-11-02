import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ShopTheLookModel } from "@/models/ShopTheLook";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const items = await ShopTheLookModel.find().sort({ order: 1 }).populate("hotspots.product", "name slug images").lean();
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  await dbConnect();
  const slide = await ShopTheLookModel.create(body);
  logActivity({ type: "shop_the_look_create", adminUserId: String(admin._id), targetType: "ShopTheLook", targetId: String(slide._id), message: `${admin.email} created a Shop The Look slide.` });

  return NextResponse.json({ slide }, { status: 201 });
}
