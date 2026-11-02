import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { AdminNotificationSettingModel } from "@/models/AdminNotificationSetting";
import { requireAdmin, isParentAdmin } from "@/lib/adminAuth";
import { NOTIFICATION_TYPE_CUSTOMER_REGISTERED } from "@/lib/adminNotifications";
import { isValidObjectId } from "@/lib/validation";

export const dynamic = "force-dynamic";

// Parent Admin only, both directions — matches the spec's security rule
// ("only Parent Admin can manage child admin notification permissions",
// and there's no separate self-service path for a Child Admin here at
// all, so this single gate covers both GET and PATCH completely).
async function requireParent() {
  const admin = await requireAdmin();
  if (!admin) return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) } as const;
  if (!isParentAdmin(admin)) return { error: NextResponse.json({ error: "Only a Parent Admin can manage notification settings." }, { status: 403 }) } as const;
  return { admin } as const;
}

// GET — the Parent Admin's own preference plus every Child Admin's, for
// the "customer_registered" notification. A missing setting row reads as
// enabled:false (see the model's comment on why rows aren't pre-created).
export async function GET() {
  const gate = await requireParent();
  if ("error" in gate) return gate.error;
  const { admin } = gate;

  await dbConnect();
  const [children, rows] = await Promise.all([
    UserModel.find({ role: "admin", adminRole: "child" }).select("email firstName lastName").sort({ createdAt: -1 }).lean(),
    AdminNotificationSettingModel.find({ type: NOTIFICATION_TYPE_CUSTOMER_REGISTERED }).select("adminUser enabled").lean(),
  ]);

  const enabledByAdminId = new Map(rows.map((r: any) => [String(r.adminUser), !!r.enabled]));

  return NextResponse.json({
    self: {
      _id: String(admin._id),
      email: admin.email,
      firstName: admin.firstName ?? "",
      lastName: admin.lastName ?? "",
      enabled: enabledByAdminId.get(String(admin._id)) ?? false,
    },
    children: children.map((c: any) => ({
      _id: String(c._id),
      email: c.email,
      firstName: c.firstName ?? "",
      lastName: c.lastName ?? "",
      enabled: enabledByAdminId.get(String(c._id)) ?? false,
    })),
  });
}

// PATCH — bulk-save the whole "Email Notifications" form in one request
// (the page has one "Save preferences" button, not a per-row instant
// toggle like the enable/disable actions on the Admin Management table).
// Each entry is an upsert on (adminUser, type) rather than a plain update,
// since a row may not exist yet for an admin who's never had this touched.
export async function PATCH(req: NextRequest) {
  const gate = await requireParent();
  if ("error" in gate) return gate.error;
  const { admin } = gate;

  const body = await req.json().catch(() => null);
  const settings = Array.isArray(body?.settings) ? body.settings : null;
  if (!settings) return NextResponse.json({ error: "settings must be an array." }, { status: 400 });

  for (const entry of settings) {
    if (!isValidObjectId(entry?.adminId) || typeof entry?.enabled !== "boolean") {
      return NextResponse.json({ error: "Each entry needs a valid adminId and a boolean enabled." }, { status: 400 });
    }
  }

  await dbConnect();

  // Every target must be a real admin (self or a Child Admin) — this is
  // what stops the endpoint from being usable to write an arbitrary
  // ObjectId (e.g. a customer's) into this collection.
  const targetIds: string[] = settings.map((s: any) => String(s.adminId));
  const validAdmins = await UserModel.find({ _id: { $in: targetIds }, role: "admin" }).select("_id").lean();
  const validIdSet = new Set(validAdmins.map((a: any) => String(a._id)));
  const invalid = targetIds.filter((id) => !validIdSet.has(id));
  if (invalid.length) return NextResponse.json({ error: "One or more admins in the request were not found." }, { status: 404 });

  await Promise.all(
    settings.map((entry: any) =>
      AdminNotificationSettingModel.updateOne(
        { adminUser: entry.adminId, type: NOTIFICATION_TYPE_CUSTOMER_REGISTERED },
        { $set: { enabled: entry.enabled } },
        { upsert: true }
      )
    )
  );

  return NextResponse.json({ ok: true });
}
