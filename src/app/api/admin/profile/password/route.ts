import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";

export const dynamic = "force-dynamic";

// Same shape as /api/account/security/password, but always requires the
// current password — an admin always has one already (created at seed
// time or first login), unlike a fresh guest account.
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { currentPassword, newPassword } = body ?? {};

  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }
  if (typeof currentPassword !== "string" || !currentPassword) {
    return NextResponse.json({ error: "Current password is required." }, { status: 400 });
  }
  const matches = await bcrypt.compare(currentPassword, admin.passwordHash);
  if (!matches) return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });

  admin.passwordHash = await bcrypt.hash(newPassword, 12);
  admin.passwordChangedAt = new Date();
  // No-op for an admin who wasn't forced through this (already false) —
  // but this is also the endpoint the forced Change Password screen posts
  // to (see /admin/change-password), so clearing it here is what actually
  // lets that admin back into the dashboard afterward.
  admin.mustChangePassword = false;
  await admin.save();

  logActivity({ type: "admin_password_change", adminUserId: String(admin._id), targetType: "User", targetId: String(admin._id), message: `${admin.email} changed their password.` });
  return NextResponse.json({ ok: true });
}
