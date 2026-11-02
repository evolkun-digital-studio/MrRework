import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ReviewModel } from "@/models/Review";
import { ProductModel } from "@/models/Product";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";
import { syncProductRating } from "@/lib/reviews";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const status = req.nextUrl.searchParams.get("status");
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;

  // Capped as a safety net against unbounded growth — this list has no
  // pagination UI yet, so the cap is generous rather than a real page size.
  const items = await ReviewModel.find(filter).sort({ createdAt: -1 }).limit(2000).populate("product", "name slug").lean();
  return NextResponse.json({ items });
}

// Manual review creation — separate from the WooCommerce/customer-submitted
// reviews this table otherwise fills with (those only ever arrive via
// import or the storefront, never through this endpoint). Lets an admin
// hand-author additional "Happy Customers" homepage entries without
// needing a real customer submission first. Pre-approved (status:
// "approved") since an admin typing it in has already vetted it — unlike
// imported/customer reviews, which default to needing moderation.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.author || !body?.product || !body?.rating) {
    return NextResponse.json({ error: "Author, product, and rating are required." }, { status: 400 });
  }
  if (!isValidObjectId(body.product)) return invalidIdResponse();
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be a whole number from 1 to 5." }, { status: 400 });
  }

  await dbConnect();
  const product = await ProductModel.findById(body.product).select("_id").lean();
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

  const review = await ReviewModel.create({
    product: body.product,
    author: body.author,
    rating,
    body: body.body ?? "",
    verified: !!body.verified,
    featured: !!body.featured,
    photo: body.photo ?? "",
    status: "approved",
  });
  await syncProductRating(String(review.product));

  logActivity({ type: "review_create", adminUserId: String(admin._id), targetType: "Review", targetId: String(review._id), message: `${admin.email} added a review by "${review.author}".` });
  return NextResponse.json({ review }, { status: 201 });
}
