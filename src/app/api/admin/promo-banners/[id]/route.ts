import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { PromoBannerModel } from "@/models/PromoBanner";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  await dbConnect();
  const banner = await PromoBannerModel.findByIdAndUpdate(id, { $set: body }, { new: true });
  if (!banner) return NextResponse.json({ error: "Promo banner not found." }, { status: 404 });

  logActivity({ type: "promo_banner_update", adminUserId: String(admin._id), targetType: "PromoBanner", targetId: id, message: `${admin.email} updated promo banner "${banner.title}".` });
  return NextResponse.json({ banner });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();

  const banner = await PromoBannerModel.findByIdAndDelete(id);
  if (!banner) return NextResponse.json({ error: "Promo banner not found." }, { status: 404 });

  logActivity({ type: "promo_banner_delete", adminUserId: String(admin._id), targetType: "PromoBanner", targetId: id, message: `${admin.email} deleted promo banner "${banner.title}".` });
  return NextResponse.json({ ok: true });
}
