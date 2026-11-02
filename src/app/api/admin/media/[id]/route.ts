import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { dbConnect } from "@/lib/mongodb";
import { MediaModel } from "@/models/Media";
import { ProductModel } from "@/models/Product";
import { CategoryModel } from "@/models/Category";
import { CollectionModel } from "@/models/Collection";
import { BlogPostModel } from "@/models/BlogPost";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

// Every image field across the app stores a plain URL string (see
// src/models/Media.ts's own header comment) rather than an ObjectId
// reference back to this Media doc — so there's no foreign-key Mongo could
// enforce for us. This is a best-effort application-level check instead:
// look for the URL directly on the handful of collections that can hold it.
async function findUsages(url: string) {
  const [products, categories, collections, posts] = await Promise.all([
    ProductModel.find({ $or: [{ images: url }, { hoverImage: url }] }, { name: 1 }).limit(10).lean(),
    CategoryModel.find({ image: url }, { name: 1 }).limit(10).lean(),
    CollectionModel.find({ heroImage: url }, { name: 1 }).limit(10).lean(),
    BlogPostModel.find({ featuredImage: url }, { title: 1 }).limit(10).lean(),
  ]);
  const usages: string[] = [
    ...products.map((p: any) => `Product "${p.name}"`),
    ...categories.map((c: any) => `Category "${c.name}"`),
    ...collections.map((c: any) => `Collection "${c.name}"`),
    ...posts.map((p: any) => `Blog post "${p.title}"`),
  ];
  return usages;
}

// PATCH — edit the metadata fields that already exist on the schema
// (populated automatically for migrated assets, but previously had no route
// at all for a directly-uploaded file to ever set them).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const update: Record<string, string> = {};
  for (const field of ["altText", "title", "caption", "description"] as const) {
    if (typeof body[field] === "string") update[field] = body[field].trim().slice(0, 500);
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });

  await dbConnect();
  const media = await MediaModel.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
  if (!media) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({ media });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const media = await MediaModel.findById(id).lean();
  if (!media) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Guard against silently breaking a live product/category/collection/post
  // — deleting used to happen unconditionally with zero warning, since these
  // fields store a plain URL rather than an ObjectId ref Mongo could protect
  // for us. `?force=true` skips the check for an admin who's already seen
  // the warning and wants to delete anyway.
  const force = req.nextUrl.searchParams.get("force") === "true";
  if (!force) {
    const usages = await findUsages((media as any).url);
    if (usages.length) {
      return NextResponse.json({ error: "This image is still in use.", inUse: true, usages }, { status: 409 });
    }
  }

  await MediaModel.findByIdAndDelete(id);

  // Best-effort file removal — a missing file on disk shouldn't block
  // removing the (now-orphaned) database record.
  try {
    await unlink(path.join(process.cwd(), "public", (media as any).url));
  } catch {}

  logActivity({ type: "media_delete", adminUserId: String(admin._id), targetType: "Media", targetId: id, message: `${admin.email} deleted "${(media as any).filename}".` });

  return NextResponse.json({ ok: true });
}
