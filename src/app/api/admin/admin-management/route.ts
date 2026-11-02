import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { dbConnect } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { requireAdmin, isParentAdmin, generateTempPassword, serializeAdminUser } from "@/lib/adminAuth";
import { sendAdminCredentialsEmail } from "@/lib/mail";
import { logActivity } from "@/lib/activityLog";
import { SITE_URL } from "@/lib/utils";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET — every Child Admin, for the Settings > Admin Management table.
// Parent Admin only; a Child Admin gets 403 even though they're
// authenticated, since this whole surface is off-limits to them.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!isParentAdmin(admin)) return NextResponse.json({ error: "Only a Parent Admin can access Admin Management." }, { status: 403 });

  await dbConnect();
  const items = await UserModel.find({ role: "admin", adminRole: "child" })
    .select("email firstName lastName status mustChangePassword lastLoginAt createdAt createdBy")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({
    items: items.map((u: any) => ({
      _id: String(u._id),
      email: u.email,
      firstName: u.firstName ?? "",
      lastName: u.lastName ?? "",
      status: u.status,
      mustChangePassword: !!u.mustChangePassword,
      lastLoginAt: u.lastLoginAt ?? null,
      createdAt: u.createdAt,
    })),
  });
}

// POST — invite a new Child Admin. Generates and hashes a temporary
// password server-side (never accepted from the client), creates the
// account with mustChangePassword:true, and emails the temp password via
// the existing SMTP system. Parent Admin only.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!isParentAdmin(admin)) return NextResponse.json({ error: "Only a Parent Admin can invite admins." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "First name and last name are required." }, { status: 400 });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  await dbConnect();

  // Email is globally unique across every user (the schema enforces this
  // too), so this catches a customer account with the same address, not
  // just an existing admin — the friendly 409 here beats a raw E11000
  // duplicate-key error surfacing as a 500.
  const existing = await UserModel.findOne({ email }).select("_id").lean();
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const child = await UserModel.create({
    email,
    firstName,
    lastName,
    passwordHash,
    role: "admin",
    adminRole: "child",
    status: "active",
    mustChangePassword: true,
    createdBy: admin._id,
  });

  const loginUrl = new URL("/admin/login", SITE_URL).toString();
  await sendAdminCredentialsEmail({ to: email, tempPassword, loginUrl, isReset: false });

  logActivity({
    type: "admin_invite",
    adminUserId: String(admin._id),
    targetType: "User",
    targetId: String(child._id),
    message: `${admin.email} invited ${email} as a Child Admin.`,
  });

  return NextResponse.json({ admin: serializeAdminUser(child) }, { status: 201 });
}
