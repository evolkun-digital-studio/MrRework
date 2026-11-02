import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { SubscriberModel } from "@/models/Subscriber";
import { requireAdmin } from "@/lib/adminAuth";
import { escapeRegex } from "@/lib/search";

export const dynamic = "force-dynamic";

// GET — the admin-visibility half of newsletter persistence: a paginated,
// searchable list, mirroring the exact shape /api/admin/customers already
// returns ({items, total, page, limit, pages}).
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const sp = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};

  const q = sp.get("q")?.trim();
  if (q) filter.email = new RegExp(escapeRegex(q), "i");

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(100, Number(sp.get("limit")) || 25);

  const [items, total] = await Promise.all([
    SubscriberModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    SubscriberModel.countDocuments(filter),
  ]);

  return NextResponse.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
}
