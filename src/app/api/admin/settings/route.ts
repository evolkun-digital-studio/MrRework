import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { StoreSettingsModel } from "@/models/StoreSettings";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

async function getOrCreateSettings() {
  let settings = await StoreSettingsModel.findOne();
  if (!settings) settings = await StoreSettingsModel.create({});
  return settings;
}

// This is the general-purpose store settings endpoint (name, address,
// currency, SEO, shipping text) — payment-gateway config has its own
// dedicated route (src/app/api/admin/settings/payment-gateways/route.ts)
// that masks the secret via serializePaypalSettings() and only ever writes
// it after a real "Connect" handshake with PayPal succeeds. Stripping
// `paymentGateways` here entirely (both on read and on write) means this
// endpoint can no longer leak the encrypted secret ciphertext to the admin
// browser, nor let a PATCH here set `enabled`/`status` directly and bypass
// that handshake — the dedicated route remains the only path in or out for
// that sub-object.
function omitPaymentGateways(settings: any) {
  const obj = settings.toObject ? settings.toObject() : settings;
  const { paymentGateways, ...rest } = obj;
  return rest;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const settings = await getOrCreateSettings();
  return NextResponse.json({ settings: omitPaymentGateways(settings) });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  // See omitPaymentGateways() above — this generic endpoint must never
  // read or write payment-gateway config, even if a caller includes it.
  const { paymentGateways: _ignoredPaymentGateways, ...safeBody } = body;

  await dbConnect();
  const settings = await getOrCreateSettings();
  Object.assign(settings, safeBody);
  await settings.save();

  logActivity({ type: "settings_update", adminUserId: String(admin._id), targetType: "StoreSettings", message: `${admin.email} updated store settings.` });
  return NextResponse.json({ settings: omitPaymentGateways(settings) });
}
