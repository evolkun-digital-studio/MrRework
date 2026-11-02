import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { disconnectPaypal, serializePaypalSettings } from "@/lib/payments/paypalSettings";

export const dynamic = "force-dynamic";

// Triggered by a fetch() from the admin UI — clears the stored PayPal
// credentials and returns the settings page to the editable connect form.
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const settings = await disconnectPaypal();

  logActivity({
    type: "gateway_disabled",
    adminUserId: String(admin._id),
    targetType: "PaymentGateway",
    targetId: "paypal",
    message: `${admin.email} disconnected PayPal.`,
  });

  return NextResponse.json({ paypal: serializePaypalSettings(settings) });
}
