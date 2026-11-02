"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Badge } from "@/components/admin/ui";
import { formatPrice } from "@/lib/utils";

interface CustomerDetail {
  customer: {
    _id: string; email: string | null; firstName: string; lastName: string; phone: string; country: string;
    status: string; createdAt: string; lastLoginAt: string | null;
    addresses: { firstName: string; lastName: string; address: string; city: string; country: string; postalCode: string; isDefaultShipping: boolean }[];
  };
  orders: { orderNumber: string; total: number; paymentStatus: string; fulfillmentStatus: string; createdAt: string }[];
  wishlist: { productId: string; name: string; slug: string; price: number; image: string }[];
  activity: { device: string; ip: string; lastSeenAt: string }[];
}

export default function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/customers/${id}`).then(async (res) => {
      const d = await res.json();
      if (!res.ok) { setNotFound(true); return; }
      setData(d);
    }).catch(() => setNotFound(true));
  }, [id]);

  if (notFound) return <p className="text-[13px] text-stone">Customer not found.</p>;
  if (!data) return <div className="h-64 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />;

  const { customer, orders, wishlist, activity } = data;
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Guest";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold">{name}</h1>
          <p className="text-[12.5px] text-stone mt-1">{customer.email ?? "No email on file"}</p>
        </div>
        <Badge tone={customer.status === "active" ? "success" : "danger"}>{customer.status}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card title="Orders">
            {orders.length === 0 ? <p className="text-[12.5px] text-stone">No orders yet.</p> : (
              <ul className="divide-y divide-line dark:divide-[#332e26]">
                {orders.map((o) => (
                  <li key={o.orderNumber} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                    <span className="font-mono text-[13px]">{o.orderNumber}</span>
                    <div className="flex items-center gap-2">
                      <Badge tone={o.fulfillmentStatus === "delivered" ? "success" : "neutral"}>{o.fulfillmentStatus}</Badge>
                      <span className="font-mono text-[13px]">{formatPrice(o.total)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Wishlist">
            {wishlist.length === 0 ? <p className="text-[12.5px] text-stone">Wishlist is empty.</p> : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {wishlist.map((w) => (
                  <Link key={w.productId} href={`/admin/products/${w.productId}`} className="border border-line dark:border-[#332e26] rounded-brand p-2.5 hover:border-ink dark:hover:border-white transition">
                    <div className="text-[12.5px] truncate">{w.name}</div>
                    <div className="text-[11.5px] text-stone font-mono mt-0.5">{formatPrice(w.price)}</div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card title="Addresses">
            {customer.addresses.length === 0 ? <p className="text-[12.5px] text-stone">No saved addresses.</p> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {customer.addresses.map((a, i) => (
                  <div key={i} className="border border-line dark:border-[#332e26] rounded-brand p-3 text-[12.5px]">
                    {a.isDefaultShipping && <Badge tone="info">Default shipping</Badge>}
                    <p className="mt-1.5">{a.firstName} {a.lastName}<br />{a.address}<br />{a.city}, {a.postalCode}<br />{a.country}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Details">
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between"><dt className="text-stone">Phone</dt><dd>{customer.phone || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-stone">Country</dt><dd>{customer.country || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-stone">Member since</dt><dd>{new Date(customer.createdAt).toLocaleDateString()}</dd></div>
              <div className="flex justify-between"><dt className="text-stone">Last login</dt><dd>{customer.lastLoginAt ? new Date(customer.lastLoginAt).toLocaleString() : "—"}</dd></div>
            </dl>
          </Card>

          <Card title="Activity">
            {activity.length === 0 ? <p className="text-[12.5px] text-stone">No recorded activity.</p> : (
              <ul className="space-y-3">
                {activity.slice(0, 5).map((a, i) => (
                  <li key={i} className="text-[12.5px]">
                    <div>{a.device || "Unknown device"}</div>
                    <div className="text-[11px] text-stone">{new Date(a.lastSeenAt).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
