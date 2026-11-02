import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ProductModel } from "@/models/Product";
import { OrderModel } from "@/models/Order";
import { UserModel } from "@/models/User";
import { requireAdmin } from "@/lib/adminAuth";
import { escapeRegex } from "@/lib/search";

export const dynamic = "force-dynamic";

// Lightweight cross-entity quick-search for the admin topbar — intentionally
// separate from the storefront's /api/search (different fields, different
// audience, no relevance scoring needed for a handful of results each).
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ items: [] });

  await dbConnect();
  const rx = new RegExp(escapeRegex(q), "i");

  const [products, orders, customers] = await Promise.all([
    ProductModel.find({ $or: [{ name: rx }, { sku: rx }] }).select("name sku slug").limit(5).lean(),
    OrderModel.find({ $or: [{ orderNumber: rx }, { email: rx }] }).select("orderNumber email total").limit(5).lean(),
    UserModel.find({ role: "customer", $or: [{ email: rx }, { firstName: rx }, { lastName: rx }] }).select("email firstName lastName").limit(5).lean(),
  ]);

  const items = [
    ...products.map((p: any) => ({ type: "product", label: p.name, sub: p.sku, href: `/admin/products/${p._id}` })),
    ...orders.map((o: any) => ({ type: "order", label: o.orderNumber, sub: o.email, href: `/admin/orders/${o._id}` })),
    ...customers.map((c: any) => ({
      type: "customer",
      label: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email,
      sub: c.email ?? "",
      href: `/admin/customers/${c._id}`,
    })),
  ];

  return NextResponse.json({ items });
}
