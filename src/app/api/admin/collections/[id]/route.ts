import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { CollectionModel } from "@/models/Collection";
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
  const collection = await CollectionModel.findByIdAndUpdate(id, { $set: body }, { new: true });
  if (!collection) return NextResponse.json({ error: "Collection not found." }, { status: 404 });

  logActivity({ type: "collection_update", adminUserId: String(admin._id), targetType: "Collection", targetId: id, message: `${admin.email} updated collection "${collection.name}".` });
  return NextResponse.json({ collection });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const collection = await CollectionModel.findByIdAndDelete(id);
  if (!collection) return NextResponse.json({ error: "Collection not found." }, { status: 404 });

  logActivity({ type: "collection_delete", adminUserId: String(admin._id), targetType: "Collection", targetId: id, message: `${admin.email} deleted collection "${collection.name}".` });
  return NextResponse.json({ ok: true });
}
