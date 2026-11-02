import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { PromoBannerModel } from "@/models/PromoBanner";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const items = await PromoBannerModel.find().sort({ order: 1 }).lean();
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

  await dbConnect();
  const banner = await PromoBannerModel.create(body);
  logActivity({ type: "promo_banner_create", adminUserId: String(admin._id), targetType: "PromoBanner", targetId: String(banner._id), message: `${admin.email} created promo banner "${banner.title}".` });

  return NextResponse.json({ banner }, { status: 201 });
}
