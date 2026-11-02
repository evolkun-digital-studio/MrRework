"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, ShoppingBag, FolderTree, Layers, Users, Newspaper,
  Image as ImageIcon, Boxes, Star, BarChart3, FileText, Settings, User,
  ArrowLeftRight, Megaphone, Mail, GalleryHorizontal, MapPin, LayoutGrid, Columns2, Sparkles,
} from "lucide-react";

// Sectioned so new groups (like "Tools" below) can be added without
// disturbing the primary module list's order or behavior — each section is
// just an optional header followed by the same item shape as before.
const NAV_SECTIONS = [
  {
    label: undefined as string | undefined,
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/admin/orders", label: "Orders", icon: Package, exact: false },
      { href: "/admin/products", label: "Products", icon: ShoppingBag, exact: false },
      { href: "/admin/categories", label: "Categories", icon: FolderTree, exact: false },
      { href: "/admin/collections", label: "Collections", icon: Layers, exact: false },
      { href: "/admin/customers", label: "Customers", icon: Users, exact: false },
      { href: "/admin/blog", label: "Blog", icon: Newspaper, exact: false },
      { href: "/admin/media", label: "Media Library", icon: ImageIcon, exact: false },
      { href: "/admin/inventory", label: "Inventory", icon: Boxes, exact: false },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3, exact: false },
      { href: "/admin/reports", label: "Reports", icon: FileText, exact: false },
      { href: "/admin/settings", label: "Settings", icon: Settings, exact: false },
      { href: "/admin/profile", label: "Profile", icon: User, exact: false },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/content/promo-banners", label: "Promotional Banners", icon: GalleryHorizontal, exact: false },
      { href: "/admin/content/luxury-promo", label: "Luxury Promo Section", icon: Columns2, exact: false },
      { href: "/admin/content/homepage-collections", label: "Homepage Collections", icon: Sparkles, exact: false },
      { href: "/admin/content/shop-the-look", label: "Shop The Look", icon: MapPin, exact: false },
      { href: "/admin/content/shop-by-category", label: "Shop By Category", icon: LayoutGrid, exact: false },
      { href: "/admin/reviews", label: "Reviews", icon: Star, exact: false },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/admin/marketing/discounts", label: "Discounts", icon: Megaphone, exact: false },
      { href: "/admin/marketing/subscribers", label: "Subscribers", icon: Mail, exact: false },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/admin/tools/import-export", label: "Import & Export", icon: ArrowLeftRight, exact: false },
    ],
  },
] as const;

export default function AdminSidebar({ mobileOpen, onNavigate }: { mobileOpen?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  return (
    <aside
      className={`print:hidden fixed lg:sticky top-0 left-0 h-screen w-64 shrink-0 bg-paper dark:bg-[#1a1712] border-r border-line dark:border-[#332e26] flex flex-col z-40 transition-transform lg:translate-x-0 ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="px-5 py-5 border-b border-line dark:border-[#332e26] shrink-0">
        <Link href="/admin" className="font-display text-lg tracking-tight" style={{ fontWeight: 800 }}>
          MrRework
        </Link>
        <div className="text-[10.5px] uppercase tracking-wide text-stone mt-0.5">Admin panel</div>
      </div>

      <nav aria-label="Admin navigation" className="flex-1 overflow-y-auto no-scrollbar py-3 px-3">
        {NAV_SECTIONS.map((section, i) => (
          <div key={section.label ?? `section-${i}`} className={i > 0 ? "mt-4 pt-4 border-t border-line dark:border-[#332e26]" : ""}>
            {section.label && (
              <div className="px-3 pb-1.5 text-[10.5px] uppercase tracking-wide text-stone">{section.label}</div>
            )}
            <ul className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon, exact }) => {
                const active = isActive(href, exact);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 px-3 py-2 rounded-brand text-[13px] transition ${
                        active ? "bg-ink text-paper dark:bg-[#f3efe8] dark:text-[#15130f]" : "text-ink-2 dark:text-[#d7d0c3] hover:bg-paper-2 dark:hover:bg-[#26221b]"
                      }`}
                    >
                      <Icon size={16} className="shrink-0" />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
