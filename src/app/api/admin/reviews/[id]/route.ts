import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ReviewModel } from "@/models/Review";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";
import { syncProductRating } from "@/lib/reviews";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  await dbConnect();
  const review = await ReviewModel.findByIdAndUpdate(id, { $set: body }, { new: true });
  if (!review) return NextResponse.json({ error: "Review not found." }, { status: 404 });

  if ("status" in body) await syncProductRating(String(review.product));

  logActivity({ type: "review_moderate", adminUserId: String(admin._id), targetType: "Review", targetId: id, message: `${admin.email} set review by "${review.author}" to ${review.status}.` });
  return NextResponse.json({ review });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const review = await ReviewModel.findByIdAndDelete(id);
  if (!review) return NextResponse.json({ error: "Review not found." }, { status: 404 });

  await syncProductRating(String(review.product));
  logActivity({ type: "review_delete", adminUserId: String(admin._id), targetType: "Review", targetId: id, message: `${admin.email} deleted a review by "${review.author}".` });
  return NextResponse.json({ ok: true });
}
