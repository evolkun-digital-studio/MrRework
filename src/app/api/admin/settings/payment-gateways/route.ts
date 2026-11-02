import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { OrderModel } from "@/models/Order";
import { getPaypalSettingsDoc, savePaypalSettings, serializePaypalSettings, type PaypalSettingsPatch } from "@/lib/payments/paypalSettings";

export const dynamic = "force-dynamic";

async function getPaypalStats() {
  const [totalOrders, totalPaid, lastPaid, recent] = await Promise.all([
    OrderModel.countDocuments({ paymentMethod: "paypal" }),
    OrderModel.countDocuments({ paymentMethod: "paypal", paymentStatus: "paid" }),
    OrderModel.findOne({ paymentMethod: "paypal", paymentStatus: "paid" }).sort({ paidAt: -1 }).select("paidAt").lean<any>(),
    OrderModel.find({ paymentMethod: "paypal" }).sort({ createdAt: -1 }).limit(5)
      .select("orderNumber total currency paymentStatus paidAt createdAt").lean<any[]>(),
  ]);
  return {
    totalOrders,
    totalPaid,
    lastPaymentAt: lastPaid?.paidAt ?? null,
    recentTransactions: recent.map((o) => ({
      orderNumber: o.orderNumber, total: o.total, currency: o.currency,
      paymentStatus: o.paymentStatus, paidAt: o.paidAt ?? null, createdAt: o.createdAt,
    })),
  };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const settings = await getPaypalSettingsDoc();
  const stats = await getPaypalStats();
  return NextResponse.json({ paypal: serializePaypalSettings(settings), stats });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const patch: PaypalSettingsPatch | undefined = body?.paypal;
  if (!patch || typeof patch !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (patch.environment !== undefined && patch.environment !== "sandbox" && patch.environment !== "live") {
    return NextResponse.json({ error: "Invalid environment." }, { status: 400 });
  }

  const before = await getPaypalSettingsDoc();
  const wasEnabled = !!before.paymentGateways?.paypal?.enabled;

  const settings = await savePaypalSettings(patch);
  const isEnabled = !!settings.paymentGateways?.paypal?.enabled;

  // Never log the secret itself — only that a save happened and, when
  // relevant, the enable/disable transition.
  let type = "gateway_updated";
  let message = `${admin.email} updated PayPal payment gateway settings.`;
  if (patch.enabled !== undefined && isEnabled !== wasEnabled) {
    type = isEnabled ? "gateway_enabled" : "gateway_disabled";
    message = `${admin.email} ${isEnabled ? "enabled" : "disabled"} the PayPal payment gateway.`;
  }
  logActivity({ type, adminUserId: String(admin._id), targetType: "PaymentGateway", targetId: "paypal", message });

  return NextResponse.json({ paypal: serializePaypalSettings(settings) });
}
