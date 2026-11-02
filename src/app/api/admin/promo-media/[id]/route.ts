import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { PromoMediaItemModel } from "@/models/PromoMediaItem";
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
  const item = await PromoMediaItemModel.findByIdAndUpdate(id, { $set: body }, { new: true });
  if (!item) return NextResponse.json({ error: "Media item not found." }, { status: 404 });

  logActivity({ type: "promo_media_update", adminUserId: String(admin._id), targetType: "PromoMediaItem", targetId: id, message: `${admin.email} updated a promo media item.` });
  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();

  const item = await PromoMediaItemModel.findByIdAndDelete(id);
  if (!item) return NextResponse.json({ error: "Media item not found." }, { status: 404 });

  logActivity({ type: "promo_media_delete", adminUserId: String(admin._id), targetType: "PromoMediaItem", targetId: id, message: `${admin.email} deleted a promo media item.` });
  return NextResponse.json({ ok: true });
}
