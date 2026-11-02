import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { CategoryModel } from "@/models/Category";
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
  if (body.parent === id) return NextResponse.json({ error: "A category cannot be its own parent." }, { status: 400 });

  await dbConnect();
  const category = await CategoryModel.findByIdAndUpdate(id, { $set: body }, { new: true });
  if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });

  logActivity({ type: "category_update", adminUserId: String(admin._id), targetType: "Category", targetId: id, message: `${admin.email} updated category "${category.name}".` });
  return NextResponse.json({ category });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();

  const hasChildren = await CategoryModel.exists({ parent: id });
  if (hasChildren) return NextResponse.json({ error: "Move or delete its subcategories first." }, { status: 409 });

  const category = await CategoryModel.findByIdAndDelete(id);
  if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });

  logActivity({ type: "category_delete", adminUserId: String(admin._id), targetType: "Category", targetId: id, message: `${admin.email} deleted category "${category.name}".` });
  return NextResponse.json({ ok: true });
}
