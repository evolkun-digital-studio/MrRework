import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const items = (admin.adminSessions ?? [])
    .map((s: any) => ({ id: String(s._id), userAgent: s.userAgent, ip: s.ip, createdAt: s.createdAt, expiresAt: s.expiresAt }))
    .sort((a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return NextResponse.json({ items });
}

// DELETE — revoke one session by its subdocument id (?sessionId=).
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId is required." }, { status: 400 });

  admin.adminSessions = admin.adminSessions.filter((s: any) => String(s._id) !== sessionId);
  await admin.save();

  return NextResponse.json({ ok: true });
}
