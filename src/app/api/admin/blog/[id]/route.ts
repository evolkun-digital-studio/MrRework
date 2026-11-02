import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { BlogPostModel } from "@/models/BlogPost";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const post = await BlogPostModel.findById(id).lean();
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  return NextResponse.json({ post });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  await dbConnect();
  if (body.slug) {
    const clash = await BlogPostModel.findOne({ slug: body.slug, _id: { $ne: id } });
    if (clash) return NextResponse.json({ error: "A post with that slug already exists." }, { status: 409 });
  }
  if (body.status === "published" && !body.publishedAt) body.publishedAt = new Date();

  const post = await BlogPostModel.findByIdAndUpdate(id, { $set: body }, { new: true });
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  logActivity({ type: "blog_update", adminUserId: String(admin._id), targetType: "BlogPost", targetId: id, message: `${admin.email} updated blog post "${post.title}".` });
  return NextResponse.json({ post });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const post = await BlogPostModel.findByIdAndDelete(id);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  logActivity({ type: "blog_delete", adminUserId: String(admin._id), targetType: "BlogPost", targetId: id, message: `${admin.email} deleted blog post "${post.title}".` });
  return NextResponse.json({ ok: true });
}
