import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { PromoMediaItemModel } from "@/models/PromoMediaItem";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const items = await PromoMediaItemModel.find().sort({ order: 1 }).lean();
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.url) return NextResponse.json({ error: "URL is required." }, { status: 400 });

  await dbConnect();
  const item = await PromoMediaItemModel.create(body);
  logActivity({ type: "promo_media_create", adminUserId: String(admin._id), targetType: "PromoMediaItem", targetId: String(item._id), message: `${admin.email} added a promo media item.` });

  return NextResponse.json({ item }, { status: 201 });
}
