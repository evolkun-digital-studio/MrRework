"use client";
import { createContext, useContext, useState } from "react";
import type { SafeAdminUser } from "@/lib/adminAuth";

interface AdminContextValue {
  admin: SafeAdminUser;
  setAdmin: (u: SafeAdminUser) => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

// Seeded once from the server (see the admin dashboard layout, which
// authoritatively verifies the session before rendering this at all).
export function AdminProvider({ initial, children }: { initial: SafeAdminUser; children: React.ReactNode }) {
  const [admin, setAdmin] = useState<SafeAdminUser>(initial);
  return <AdminContext.Provider value={{ admin, setAdmin }}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
}
