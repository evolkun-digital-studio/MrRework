import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { requireAdmin, isParentAdmin, serializeAdminUser } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

// Every route below scopes its target lookup to `adminRole: "child"` — not
// just `role: "admin"` — so a Parent Admin can never disable/delete another
// Parent Admin (or themselves) through this API, matching the spec's "Only
// Parent Admin can manage admin accounts" while keeping parent-to-parent
// management out of scope entirely, not just UI-hidden.

// PATCH — enable/disable a Child Admin. Reuses the existing
// `status: "active"|"suspended"` field (the same one verifyAdminCredentials
// and getAdminSession already gate on), so disabling here immediately kills
// every one of that Child Admin's live sessions too, not just future logins.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!isParentAdmin(admin)) return NextResponse.json({ error: "Only a Parent Admin can manage admin accounts." }, { status: 403 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();

  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (status !== "active" && status !== "suspended") {
    return NextResponse.json({ error: "status must be \"active\" or \"suspended\"." }, { status: 400 });
  }

  await dbConnect();
  const target = await UserModel.findOne({ _id: id, role: "admin", adminRole: "child" });
  if (!target) return NextResponse.json({ error: "Child Admin not found." }, { status: 404 });

  target.status = status;
  await target.save();

  logActivity({
    type: "admin_status_change",
    adminUserId: String(admin._id),
    targetType: "User",
    targetId: String(target._id),
    message: `${admin.email} ${status === "active" ? "enabled" : "disabled"} Child Admin ${target.email}.`,
  });

  return NextResponse.json({ admin: serializeAdminUser(target) });
}

// DELETE — permanently remove a Child Admin account.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!isParentAdmin(admin)) return NextResponse.json({ error: "Only a Parent Admin can manage admin accounts." }, { status: 403 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();

  await dbConnect();
  const target = await UserModel.findOne({ _id: id, role: "admin", adminRole: "child" });
  if (!target) return NextResponse.json({ error: "Child Admin not found." }, { status: 404 });

  await UserModel.deleteOne({ _id: target._id });

  logActivity({
    type: "admin_delete",
    adminUserId: String(admin._id),
    targetType: "User",
    targetId: String(target._id),
    message: `${admin.email} deleted Child Admin ${target.email}.`,
  });

  return NextResponse.json({ ok: true });
}
