import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession, isParentAdmin } from "@/lib/adminAuth";
import AdminManagementClient from "@/components/admin/AdminManagementClient";

export const metadata: Metadata = { title: "Admin Management" };
export const dynamic = "force-dynamic";

// The (dashboard) layout already verifies there's a valid session — this is
// the additional, authoritative role check for this one route: a Child
// Admin who navigates here directly (not just one who never sees the nav
// link) is bounced straight back to Settings. The real enforcement is still
// server-side on every /api/admin/admin-management* route; this is what
// keeps the page itself from even rendering for them.
export default async function AdminManagementPage() {
  const user = await getAdminSession();
  if (!user) redirect("/admin/login");
  if (!isParentAdmin(user)) redirect("/admin/settings");

  return <AdminManagementClient />;
}
