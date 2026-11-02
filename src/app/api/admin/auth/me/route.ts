import { NextResponse } from "next/server";
import { getAdminSession, serializeAdminUser } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAdminSession();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  return NextResponse.json({ user: serializeAdminUser(user) });
}
