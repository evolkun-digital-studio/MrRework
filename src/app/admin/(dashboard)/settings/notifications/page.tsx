import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession, isParentAdmin } from "@/lib/adminAuth";
import NotificationSettingsClient from "@/components/admin/NotificationSettingsClient";

export const metadata: Metadata = { title: "Email Notifications" };
export const dynamic = "force-dynamic";

// Same parent-only gate as Admin Management (see that page's comment) — a
// Child Admin has no self-service path for this setting at all, so there's
// nothing for them to see here; they're bounced straight back to Settings.
export default async function AdminNotificationSettingsPage() {
  const user = await getAdminSession();
  if (!user) redirect("/admin/login");
  if (!isParentAdmin(user)) redirect("/admin/settings");

  return <NotificationSettingsClient />;
}
