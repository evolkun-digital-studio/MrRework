import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { CategoryModel } from "@/models/Category";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const items = await CategoryModel.find().sort({ order: 1 }).lean();
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.slug) return NextResponse.json({ error: "Name and slug are required." }, { status: 400 });

  await dbConnect();
  if (await CategoryModel.findOne({ slug: body.slug })) {
    return NextResponse.json({ error: "A category with that slug already exists." }, { status: 409 });
  }

  const category = await CategoryModel.create(body);
  logActivity({ type: "category_create", adminUserId: String(admin._id), targetType: "Category", targetId: String(category._id), message: `${admin.email} created category "${category.name}".` });

  return NextResponse.json({ category }, { status: 201 });
}
