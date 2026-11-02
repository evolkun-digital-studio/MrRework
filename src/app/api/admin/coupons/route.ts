import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { CouponModel } from "@/models/Coupon";
import { OrderModel } from "@/models/Order";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

const DISCOUNT_TYPES = ["percentage", "fixed", "free_shipping", "buy_x_get_y"];

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const [items, savingsAgg] = await Promise.all([
    CouponModel.find().sort({ createdAt: -1 }).lean(),
    // Total savings actually generated per discount, across every order it
    // was applied to — the admin list's "total savings generated" column.
    OrderModel.aggregate([
      { $unwind: "$appliedDiscounts" },
      { $group: { _id: "$appliedDiscounts.discountId", totalSavings: { $sum: "$appliedDiscounts.amountSaved" } } },
    ]),
  ]);
  const savingsByDiscount = new Map(savingsAgg.map((s) => [String(s._id), s.totalSavings]));
  const itemsWithSavings = items.map((item: any) => ({ ...item, totalSavings: savingsByDiscount.get(String(item._id)) ?? 0 }));

  return NextResponse.json({ items: itemsWithSavings });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.type) return NextResponse.json({ error: "Type is required." }, { status: 400 });
  if (!DISCOUNT_TYPES.includes(body.type)) return NextResponse.json({ error: "Invalid discount type." }, { status: 400 });

  // An automatic discount has no customer-entered code; every other kind
  // needs one so a customer has something to type at checkout.
  if (!body.automatic && !body.code) {
    return NextResponse.json({ error: "Code is required unless this is an automatic discount." }, { status: 400 });
  }
  if (body.type === "percentage" && (typeof body.value !== "number" || body.value <= 0 || body.value > 100)) {
    return NextResponse.json({ error: "Percentage value must be between 1 and 100." }, { status: 400 });
  }
  if (body.type === "fixed" && (typeof body.value !== "number" || body.value <= 0)) {
    return NextResponse.json({ error: "Fixed discount value must be greater than 0." }, { status: 400 });
  }
  if (body.type === "buy_x_get_y" && (!body.buyGetProduct || !body.buyQuantity || !body.getQuantity)) {
    return NextResponse.json({ error: "Buy X Get Y requires a product, buy quantity, and get quantity." }, { status: 400 });
  }

  await dbConnect();
  const code = body.code ? String(body.code).trim().toUpperCase() : undefined;
  if (code && (await CouponModel.findOne({ code }))) {
    return NextResponse.json({ error: "That coupon code already exists." }, { status: 409 });
  }

  const coupon = await CouponModel.create({ ...body, code, value: body.value ?? 0 });
  logActivity({
    type: "discount_create",
    adminUserId: String(admin._id),
    targetType: "Coupon",
    targetId: String(coupon._id),
    message: `${admin.email} created discount "${coupon.code || "(automatic)"}".`,
  });

  return NextResponse.json({ coupon }, { status: 201 });
}
