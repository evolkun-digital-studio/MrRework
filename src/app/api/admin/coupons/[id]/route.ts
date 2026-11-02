import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { CouponModel } from "@/models/Coupon";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

const DISCOUNT_TYPES = ["percentage", "fixed", "free_shipping", "buy_x_get_y"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  if (body.code) body.code = String(body.code).trim().toUpperCase();
  if (body.type !== undefined && !DISCOUNT_TYPES.includes(body.type)) {
    return NextResponse.json({ error: "Invalid discount type." }, { status: 400 });
  }
  if (body.type === "percentage" && body.value !== undefined && (body.value <= 0 || body.value > 100)) {
    return NextResponse.json({ error: "Percentage value must be between 1 and 100." }, { status: 400 });
  }

  await dbConnect();

  // Mirrors the same check already enforced on create (POST /api/admin/coupons)
  // — was missing here, so a coupon's fixed value could be set to 0 or
  // negative via PATCH, and the pricing engine has no floor of its own on
  // amountSaved, so a negative value would *increase* the customer's total
  // instead of discounting it. `effectiveType` accounts for a PATCH that
  // changes `value` without also resending `type`.
  const effectiveType = body.type ?? (await CouponModel.findById(id).select("type").lean<{ type?: string }>())?.type;
  if (effectiveType === "fixed" && body.value !== undefined && (typeof body.value !== "number" || body.value <= 0)) {
    return NextResponse.json({ error: "Fixed discount value must be greater than 0." }, { status: 400 });
  }

  const coupon = await CouponModel.findByIdAndUpdate(id, { $set: body }, { new: true });
  if (!coupon) return NextResponse.json({ error: "Coupon not found." }, { status: 404 });

  logActivity({ type: "discount_update", adminUserId: String(admin._id), targetType: "Coupon", targetId: id, message: `${admin.email} updated discount "${coupon.code || "(automatic)"}".` });
  return NextResponse.json({ coupon });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const coupon = await CouponModel.findByIdAndDelete(id);
  if (!coupon) return NextResponse.json({ error: "Coupon not found." }, { status: 404 });

  logActivity({ type: "coupon_delete", adminUserId: String(admin._id), targetType: "Coupon", targetId: id, message: `${admin.email} deleted coupon "${coupon.code}".` });
  return NextResponse.json({ ok: true });
}
