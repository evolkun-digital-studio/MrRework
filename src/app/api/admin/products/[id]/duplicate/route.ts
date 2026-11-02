import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { duplicateProduct } from "@/lib/duplicateProduct";

export const dynamic = "force-dynamic";

// POST — duplicate a product as a new draft, with a unique slug/SKU so it
// never collides with the original.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  await dbConnect();
  const result = await duplicateProduct(id);
  if (!result) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  const { original, copy } = result;

  logActivity({
    type: "product_duplicate", adminUserId: String(admin._id), targetType: "Product", targetId: String(copy._id),
    message: `${admin.email} duplicated product "${original.name}".`,
  });

  return NextResponse.json({ product: copy }, { status: 201 });
}
