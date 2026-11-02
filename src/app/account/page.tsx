"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Package, Heart, MapPin, CreditCard, User, LogOut, Clock, Sparkles } from "lucide-react";
import { useAccount } from "@/components/account/AccountProvider";
import { useCustomerAuth } from "@/lib/customerAuthStore";
import { type OrderSummary } from "@/components/account/ui";
import { readRecentlyViewed } from "@/lib/recentlyViewed";
import DashboardHeader from "@/components/account/dashboard/DashboardHeader";
import SummaryCard from "@/components/account/dashboard/SummaryCard";
import RecentOrders from "@/components/account/dashboard/RecentOrders";
import type { Product } from "@/lib/types";

// Deferred out of the main dashboard bundle — it pulls in ProductCard (with
// its framer-motion animation) which only matters once these below-the-fold
// rows actually render.
const ProductRow = dynamic(() => import("@/components/account/dashboard/ProductRow"), {
  loading: () => <div className="h-64 rounded-brand bg-paper-2 animate-pulse" />,
});

export default function AccountDashboardPage() {
  const router = useRouter();
  const { account } = useAccount();
  const setUser = useCustomerAuth((s) => s.setUser);

  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>([]);
  const [recommended, setRecommended] = useState<Product[] | null>(null);

  // One call to the existing /api/orders endpoint — already powers its own
  // dedicated page, reused here rather than adding a new account-scoped
  // variant. Address/payment/notification data needs no fetch at all: it's
  // already on `account` from AccountProvider, seeded once server-side by
  // the account layout.
  useEffect(() => {
    fetch("/api/orders").then((res) => res.json()).then((data) => setOrders(data.items ?? [])).catch(() => setOrders([]));
    setRecentlyViewed(readRecentlyViewed());
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    router.push("/");
  }

  // "Recommended" — products from the same collections as what's been
  // recently viewed, reusing the existing /api/products?collection= filter.
  // A placeholder for real recommendations later (see comment below).
  useEffect(() => {
    if (recentlyViewed.length === 0) {
      setRecommended([]);
      return;
    }
    const collections = [...new Set(recentlyViewed.map((p) => p.collection).filter(Boolean))].slice(0, 3);
    if (collections.length === 0) {
      setRecommended([]);
      return;
    }
    const viewedIds = new Set(recentlyViewed.map((p) => p._id));
    fetch(`/api/products?collection=${collections.map(encodeURIComponent).join(",")}&limit=12`)
      .then((res) => res.json())
      .then((data) => {
        const items: Product[] = (data.items ?? []).filter((p: Product) => !viewedIds.has(p._id));
        setRecommended(items.slice(0, 8));
      })
      .catch(() => setRecommended([]));
  }, [recentlyViewed]);

  return (
    <div className="space-y-10">
      <DashboardHeader account={account} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
        <SummaryCard icon={Package} title="Orders" href="/account/orders" />
        <SummaryCard icon={MapPin} title="Addresses" href="/account/addresses" />
        <SummaryCard icon={CreditCard} title="Payment Methods" href="/account/payment-methods" />
        <SummaryCard icon={User} title="Account Details" href="/account/profile" />
        <SummaryCard icon={Heart} title="Wishlist" href="/wishlist" />
        <SummaryCard icon={LogOut} title="Logout" onClick={logout} />
      </div>

      <RecentOrders orders={orders} />

      <ProductRow title="Recently viewed" products={recentlyViewed} emptyIcon={Clock} emptyText="Products you view will show up here." />
      <ProductRow title="You may also like" products={recommended ?? []} loading={recommended === null} emptyIcon={Sparkles} emptyText="Browse the shop to see recommendations here." />
    </div>
  );
}
