import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, serializeAdminUser } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json({ user: serializeAdminUser(admin) });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  if ("firstName" in body) admin.firstName = String(body.firstName ?? "").trim().slice(0, 80);
  if ("lastName" in body) admin.lastName = String(body.lastName ?? "").trim().slice(0, 80);
  await admin.save();

  return NextResponse.json({ user: serializeAdminUser(admin) });
}
