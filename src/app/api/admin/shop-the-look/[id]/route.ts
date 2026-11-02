import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ShopTheLookModel } from "@/models/ShopTheLook";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

// PATCH body may include a full `hotspots` array — a slide's hotspots are
// always replaced wholesale (not individually patched), matching how the
// admin editor manages them as one in-memory list per slide.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  await dbConnect();
  const slide = await ShopTheLookModel.findByIdAndUpdate(id, { $set: body }, { new: true }).populate("hotspots.product", "name slug");
  if (!slide) return NextResponse.json({ error: "Slide not found." }, { status: 404 });

  logActivity({ type: "shop_the_look_update", adminUserId: String(admin._id), targetType: "ShopTheLook", targetId: id, message: `${admin.email} updated a Shop The Look slide.` });
  return NextResponse.json({ slide });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();

  const slide = await ShopTheLookModel.findByIdAndDelete(id);
  if (!slide) return NextResponse.json({ error: "Slide not found." }, { status: 404 });

  logActivity({ type: "shop_the_look_delete", adminUserId: String(admin._id), targetType: "ShopTheLook", targetId: id, message: `${admin.email} deleted a Shop The Look slide.` });
  return NextResponse.json({ ok: true });
}
