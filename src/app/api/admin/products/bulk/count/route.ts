import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ProductModel } from "@/models/Product";
import { requireAdmin } from "@/lib/adminAuth";
import { buildProductFilter } from "@/lib/adminProductFilter";

export const dynamic = "force-dynamic";

// GET — count-only lookup (no documents fetched) backing the "Select all N
// matching current filters" affordance, so showing that number doesn't cost
// as much as actually fetching the list.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const sp = req.nextUrl.searchParams;
  const filter = buildProductFilter({ q: sp.get("q"), status: sp.get("status"), category: sp.get("category") });
  const count = await ProductModel.countDocuments(filter);

  return NextResponse.json({ count });
}
