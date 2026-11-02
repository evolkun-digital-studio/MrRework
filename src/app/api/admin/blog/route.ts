import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { BlogPostModel } from "@/models/BlogPost";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { escapeRegex } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const sp = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};
  const q = sp.get("q")?.trim();
  if (q) filter.title = new RegExp(escapeRegex(q), "i");
  const status = sp.get("status");
  if (status) filter.status = status;

  const items = await BlogPostModel.find(filter).sort({ createdAt: -1 }).populate("author", "firstName lastName email").lean();
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title || !body?.slug) return NextResponse.json({ error: "Title and slug are required." }, { status: 400 });

  await dbConnect();
  if (await BlogPostModel.findOne({ slug: body.slug })) {
    return NextResponse.json({ error: "A post with that slug already exists." }, { status: 409 });
  }

  const post = await BlogPostModel.create({
    ...body,
    author: admin._id,
    publishedAt: body.status === "published" ? new Date() : body.publishedAt,
  });
  logActivity({ type: "blog_create", adminUserId: String(admin._id), targetType: "BlogPost", targetId: String(post._id), message: `${admin.email} created blog post "${post.title}".` });

  return NextResponse.json({ post }, { status: 201 });
}
