"use client";
import { useEffect, useState } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";

const THEME_KEY = "epure-admin-theme";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(THEME_KEY) === "dark") setDark(true);
    } catch {}
  }, []);

  function toggleDark() {
    setDark((d) => {
      const next = !d;
      try { localStorage.setItem(THEME_KEY, next ? "dark" : "light"); } catch {}
      return next;
    });
  }

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-paper dark:bg-[#15130f] text-ink dark:text-[#f3efe8] flex">
        <AdminSidebar mobileOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} />
        {mobileNavOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}
        <div className="flex-1 min-w-0 flex flex-col">
          <AdminTopbar onMenuClick={() => setMobileNavOpen(true)} dark={dark} onToggleDark={toggleDark} />
          <main className="flex-1 p-4 lg:p-8 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
