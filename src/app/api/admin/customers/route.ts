import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { requireAdmin } from "@/lib/adminAuth";
import { escapeRegex } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const sp = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = { role: "customer" };

  const q = sp.get("q")?.trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ email: rx }, { firstName: rx }, { lastName: rx }];
  }
  const status = sp.get("status");
  if (status) filter.status = status;

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(100, Number(sp.get("limit")) || 20);

  const [items, total] = await Promise.all([
    UserModel.find(filter).select("email firstName lastName status country createdAt lastLoginAt").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    UserModel.countDocuments(filter),
  ]);

  return NextResponse.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
}
