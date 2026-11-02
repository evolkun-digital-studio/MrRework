import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { requireAdmin, isParentAdmin, generateTempPassword } from "@/lib/adminAuth";
import { sendAdminCredentialsEmail } from "@/lib/mail";
import { logActivity } from "@/lib/activityLog";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";
import { SITE_URL } from "@/lib/utils";

export const dynamic = "force-dynamic";

// POST — Parent Admin forces a new temporary password onto a Child Admin
// (lost/forgotten password, offboarding a device, etc.). Mirrors the invite
// flow: generates + hashes a new temp password, sets mustChangePassword so
// they're forced through Change Password again, and emails it via the same
// template. Also clears every existing session for that account, since a
// password reset that left old sessions alive would defeat the point.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!isParentAdmin(admin)) return NextResponse.json({ error: "Only a Parent Admin can manage admin accounts." }, { status: 403 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();

  await dbConnect();
  const target = await UserModel.findOne({ _id: id, role: "admin", adminRole: "child" });
  if (!target) return NextResponse.json({ error: "Child Admin not found." }, { status: 404 });
  if (!target.email) return NextResponse.json({ error: "This admin has no email on file." }, { status: 400 });

  const tempPassword = generateTempPassword();
  target.passwordHash = await bcrypt.hash(tempPassword, 12);
  target.passwordChangedAt = new Date();
  target.mustChangePassword = true;
  target.adminSessions = [];
  await target.save();

  const loginUrl = new URL("/admin/login", SITE_URL).toString();
  await sendAdminCredentialsEmail({ to: target.email, tempPassword, loginUrl, isReset: true });

  logActivity({
    type: "admin_password_reset",
    adminUserId: String(admin._id),
    targetType: "User",
    targetId: String(target._id),
    message: `${admin.email} reset the password for Child Admin ${target.email}.`,
  });

  return NextResponse.json({ ok: true });
}
