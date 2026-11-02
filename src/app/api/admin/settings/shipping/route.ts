import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { getShippingSettingsDoc, getShippingSettings, saveShippingSettings, type ShippingSettingsPatch } from "@/lib/shipping/shippingSettings";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const settings = await getShippingSettingsDoc();
  return NextResponse.json({ shipping: getShippingSettings(settings) });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const patch: ShippingSettingsPatch | undefined = body?.shipping;
  if (!patch || typeof patch !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const settings = await saveShippingSettings(patch);
  logActivity({
    type: "shipping_settings_updated",
    adminUserId: String(admin._id),
    targetType: "StoreSettings",
    message: `${admin.email} updated shipping settings.`,
  });

  return NextResponse.json({ shipping: getShippingSettings(settings) });
}
