import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { CollectionModel } from "@/models/Collection";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const items = await CollectionModel.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.slug) return NextResponse.json({ error: "Name and slug are required." }, { status: 400 });

  await dbConnect();
  if (await CollectionModel.findOne({ slug: body.slug })) {
    return NextResponse.json({ error: "A collection with that slug already exists." }, { status: 409 });
  }

  const collection = await CollectionModel.create(body);
  logActivity({ type: "collection_create", adminUserId: String(admin._id), targetType: "Collection", targetId: String(collection._id), message: `${admin.email} created collection "${collection.name}".` });

  return NextResponse.json({ collection }, { status: 201 });
}
