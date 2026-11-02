"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Search, Bell, Moon, Sun, User, LogOut, Settings } from "lucide-react";
import { useAdmin } from "./AdminProvider";

interface ActivityItem { _id: string; message: string; createdAt: string }
interface SearchResult { type: "product" | "order" | "customer"; label: string; sub: string; href: string }

export default function AdminTopbar({ onMenuClick, dark, onToggleDark }: { onMenuClick: () => void; dark: boolean; onToggleDark: () => void }) {
  const router = useRouter();
  const { admin } = useAdmin();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);

  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => res.json())
        .then((data) => setResults(data.items ?? []))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function openNotifications() {
    setNotifOpen((o) => !o);
    if (activity === null) {
      fetch("/api/admin/activity?limit=8").then((res) => res.json()).then((data) => setActivity(data.items ?? [])).catch(() => setActivity([]));
    }
  }

  async function logout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  const displayName = [admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.email || "Admin";

  return (
    <header className="print:hidden sticky top-0 z-30 flex items-center gap-3 px-4 lg:px-6 py-3 border-b border-line dark:border-[#332e26] bg-paper dark:bg-[#15130f]">
      <button type="button" onClick={onMenuClick} aria-label="Open menu" className="lg:hidden p-1.5 -ml-1.5 rounded-brand hover:bg-paper-2 dark:hover:bg-[#26221b]">
        <Menu size={19} />
      </button>

      <div ref={searchRef} className="relative flex-1 max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone pointer-events-none" />
        <input
          type="text" value={query}
          onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Search orders, products, customers…"
          aria-label="Admin search"
          className="w-full h-9 pl-9 pr-3 rounded-brand border border-line dark:border-[#332e26] bg-transparent text-[13px] outline-none focus:border-ink dark:focus:border-[#f3efe8] transition"
        />
        {searchOpen && query.trim().length >= 2 && (
          <div className="absolute top-full left-0 right-0 mt-1.5 border border-line dark:border-[#332e26] rounded-brand bg-paper dark:bg-[#1a1712] shadow-[0_12px_28px_rgba(0,0,0,0.12)] max-h-80 overflow-y-auto z-40">
            {results.length === 0 ? (
              <p className="text-[12.5px] text-stone px-4 py-4">No results.</p>
            ) : (
              results.map((r, i) => (
                <Link
                  key={`${r.type}-${i}`} href={r.href} onClick={() => { setSearchOpen(false); setQuery(""); }}
                  className="flex flex-col gap-0.5 px-4 py-2.5 hover:bg-paper-2 dark:hover:bg-[#26221b] transition border-b border-line dark:border-[#332e26] last:border-b-0"
                >
                  <span className="text-[13px]">{r.label}</span>
                  <span className="text-[11px] text-stone capitalize">{r.type} · {r.sub}</span>
                </Link>
              ))
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button type="button" onClick={onToggleDark} aria-label="Toggle theme" className="p-2 rounded-brand hover:bg-paper-2 dark:hover:bg-[#26221b] transition">
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <div ref={notifRef} className="relative">
          <button type="button" onClick={openNotifications} aria-label="Notifications" className="p-2 rounded-brand hover:bg-paper-2 dark:hover:bg-[#26221b] transition">
            <Bell size={17} />
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-80 border border-line dark:border-[#332e26] rounded-brand bg-paper dark:bg-[#1a1712] shadow-[0_12px_28px_rgba(0,0,0,0.12)] max-h-96 overflow-y-auto z-40">
              <div className="px-4 py-3 border-b border-line dark:border-[#332e26] text-[12px] uppercase tracking-wide text-stone">Recent activity</div>
              {activity === null ? (
                <p className="text-[12.5px] text-stone px-4 py-4">Loading…</p>
              ) : activity.length === 0 ? (
                <p className="text-[12.5px] text-stone px-4 py-4">Nothing yet.</p>
              ) : (
                activity.map((a) => (
                  <div key={a._id} className="px-4 py-2.5 border-b border-line dark:border-[#332e26] last:border-b-0">
                    <p className="text-[12.5px]">{a.message}</p>
                    <p className="text-[10.5px] text-stone mt-0.5">{new Date(a.createdAt).toLocaleString()}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div ref={profileRef} className="relative">
          <button type="button" onClick={() => setProfileOpen((o) => !o)} aria-label="Account menu" className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-brand hover:bg-paper-2 dark:hover:bg-[#26221b] transition">
            <span className="w-7 h-7 rounded-full bg-paper-2 dark:bg-[#26221b] grid place-items-center"><User size={14} /></span>
            <span className="hidden sm:block text-[12.5px] max-w-[120px] truncate">{displayName}</span>
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-52 border border-line dark:border-[#332e26] rounded-brand bg-paper dark:bg-[#1a1712] shadow-[0_12px_28px_rgba(0,0,0,0.12)] z-40 py-1.5">
              <Link href="/admin/profile" onClick={() => setProfileOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-[13px] hover:bg-paper-2 dark:hover:bg-[#26221b] transition">
                <User size={14} /> Profile
              </Link>
              <Link href="/admin/settings" onClick={() => setProfileOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-[13px] hover:bg-paper-2 dark:hover:bg-[#26221b] transition">
                <Settings size={14} /> Settings
              </Link>
              <button type="button" onClick={logout} className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] hover:bg-paper-2 dark:hover:bg-[#26221b] transition text-left">
                <LogOut size={14} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
