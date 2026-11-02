"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid, User, Package, Truck, Heart, MapPin, CreditCard, Bell, ShieldCheck, Settings, LogOut,
} from "lucide-react";
import { useAccount } from "./AccountProvider";
import { useCustomerAuth } from "@/lib/customerAuthStore";

const NAV = [
  { href: "/account", label: "Dashboard", icon: LayoutGrid, exact: true },
  { href: "/account/profile", label: "Profile", icon: User, exact: false },
  { href: "/account/orders", label: "Orders", icon: Package, exact: false },
  { href: "/account/orders", label: "Track Order", icon: Truck, exact: false },
  { href: "/wishlist", label: "Wishlist", icon: Heart, exact: true },
  { href: "/account/addresses", label: "Addresses", icon: MapPin, exact: false },
  { href: "/account/payment-methods", label: "Payment Methods", icon: CreditCard, exact: false },
  { href: "/account/notifications", label: "Notifications", icon: Bell, exact: false },
  { href: "/account/security", label: "Security", icon: ShieldCheck, exact: false },
  { href: "/account/settings", label: "Account Settings", icon: Settings, exact: false },
] as const;

export default function AccountSidebar() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { account } = useAccount();
  const setUser = useCustomerAuth((s) => s.setUser);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    router.push("/");
  }

  const displayName = [account.firstName, account.lastName].filter(Boolean).join(" ") || "Your account";

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav aria-label="Account navigation" className="min-w-0 lg:sticky lg:top-28 lg:self-start">
      <div className="hidden lg:flex items-center gap-3 mb-6 pb-6 border-b border-line">
        <div className="relative w-11 h-11 rounded-full bg-paper-2 overflow-hidden shrink-0 grid place-items-center">
          {account.profileImage ? (
            <Image src={account.profileImage} alt={`${displayName}'s profile photo`} fill sizes="44px" className="object-cover" />
          ) : (
            <User size={18} className="text-stone" />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-medium truncate">{displayName}</div>
          {account.email && <div className="text-[11.5px] text-stone truncate">{account.email}</div>}
        </div>
      </div>

      <ul className="flex lg:flex-col gap-2 overflow-x-auto no-scrollbar pb-3 lg:pb-0">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <li key={label} className="shrink-0 lg:shrink">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-brand text-[13px] whitespace-nowrap transition border ${
                  active ? "bg-ink text-paper border-ink" : "border-line hover:border-ink"
                }`}
              >
                <Icon size={15} />
                {label}
              </Link>
            </li>
          );
        })}
        <li className="shrink-0 lg:shrink lg:mt-2 lg:pt-2 lg:border-t lg:border-line">
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-brand text-[13px] whitespace-nowrap transition border border-line hover:border-ink text-stone hover:text-ink"
          >
            <LogOut size={15} />
            Logout
          </button>
        </li>
      </ul>
    </nav>
  );
}
