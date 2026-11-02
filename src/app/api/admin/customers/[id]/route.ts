import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
import { OrderModel } from "@/models/Order";
import { WishlistModel } from "@/models/Wishlist";
import { ProductModel } from "@/models/Product";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

// GET — full customer profile for the admin detail view: addresses (already
// embedded on User), orders (existing Order model, matched the same way the
// customer's own /account/orders does — by linked user id, falling back to
// email), wishlist (existing Wishlist model, keyed by the same guest session
// cookie that already identifies this customer — see src/lib/account.ts),
// and activity (the customer's own device/session log).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const customer = await UserModel.findOne({ _id: id, role: "customer" }).lean<any>();
  if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });

  const orOrders: Record<string, unknown>[] = [{ user: customer._id }];
  if (customer.email) orOrders.push({ email: customer.email });

  const [orders, wishlist] = await Promise.all([
    OrderModel.find({ $or: orOrders }).sort({ createdAt: -1 }).select("orderNumber total paymentStatus fulfillmentStatus createdAt").lean(),
    customer.sessionId ? WishlistModel.findOne({ sessionId: customer.sessionId }).lean<any>() : null,
  ]);

  let wishlistItems: { productId: string; name: string; slug: string; price: number; image: string }[] = [];
  if (wishlist?.items?.length) {
    const productIds = wishlist.items.map((i: any) => i.product);
    const products = await ProductModel.find({ _id: { $in: productIds } }).select("name slug price images").lean();
    const byId = new Map(products.map((p: any) => [String(p._id), p]));
    wishlistItems = wishlist.items
      .map((i: any) => byId.get(String(i.product)))
      .filter(Boolean)
      .map((p: any) => ({ productId: String(p._id), name: p.name, slug: p.slug, price: p.price, image: p.images?.[0] ?? "" }));
  }

  return NextResponse.json({
    customer: {
      _id: String(customer._id), email: customer.email, firstName: customer.firstName, lastName: customer.lastName,
      phone: customer.phone, country: customer.country, status: customer.status,
      createdAt: customer.createdAt, lastLoginAt: customer.lastLoginAt,
      addresses: customer.addresses ?? [],
    },
    orders,
    wishlist: wishlistItems,
    activity: (customer.sessions ?? []).sort((a: any, b: any) => +new Date(b.lastSeenAt) - +new Date(a.lastSeenAt)),
  });
}
