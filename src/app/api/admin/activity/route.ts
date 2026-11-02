import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ActivityLogModel } from "@/models/ActivityLog";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// Powers both the topbar notifications dropdown and the dashboard's
// "Recent activity" widget — same query, same shape, used from two places.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const limit = Math.min(50, Number(req.nextUrl.searchParams.get("limit")) || 15);
  const items = await ActivityLogModel.find().sort({ createdAt: -1 }).limit(limit).lean();

  return NextResponse.json({ items });
}
