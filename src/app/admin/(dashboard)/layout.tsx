import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession, serializeAdminUser } from "@/lib/adminAuth";
import { AdminProvider } from "@/components/admin/AdminProvider";
import AdminShell from "@/components/admin/AdminShell";

export const metadata: Metadata = { title: { default: "Admin · MrRework", template: "%s · Admin · MrRework" } };
export const dynamic = "force-dynamic";

// The authoritative admin auth check — middleware only fast-redirects when
// the session cookie is entirely absent (see middleware.ts); this is the
// real, DB-backed verification (valid role:"admin", unexpired session) and
// is what every /admin/* page actually depends on for protection.
export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getAdminSession();
  if (!user) redirect("/admin/login");
  // Set on invite and on a Parent Admin's "Reset Password" action (see
  // /api/admin/admin-management) — forces the dedicated Change Password
  // screen before any dashboard page renders, so a temp password that went
  // out over email can't be used to operate the store indefinitely.
  if (user.mustChangePassword) redirect("/admin/change-password");

  return (
    <AdminProvider initial={serializeAdminUser(user)}>
      <AdminShell>{children}</AdminShell>
    </AdminProvider>
  );
}
