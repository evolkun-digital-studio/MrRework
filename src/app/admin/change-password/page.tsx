import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/adminAuth";
import ChangePasswordForm from "./ChangePasswordForm";

export const metadata: Metadata = { title: "Change password · Admin · MrRework" };
export const dynamic = "force-dynamic";

// Deliberately a sibling of /admin/login, not nested under the (dashboard)
// group — the (dashboard) layout is what redirects here when
// mustChangePassword is true, so this page can't live behind that same
// redirect without looping. Its own guard: no session → login; a session
// that's already past this requirement → the dashboard, so an admin can't
// sit on this screen indefinitely after already changing their password.
export default async function AdminChangePasswordPage() {
  const user = await getAdminSession();
  if (!user) redirect("/admin/login");
  if (!user.mustChangePassword) redirect("/admin");

  return (
    <div className="min-h-screen bg-paper text-ink flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="font-display text-2xl tracking-tight" style={{ fontWeight: 900 }}>MrRework</span>
          <p className="text-[11px] uppercase tracking-wide text-stone mt-2">Admin panel</p>
        </div>
        <div className="text-center mb-6">
          <h1 className="text-[16px] font-semibold">Set a new password</h1>
          <p className="text-[12.5px] text-stone mt-1">For security, you need to set your own password before continuing.</p>
        </div>
        <ChangePasswordForm email={user.email ?? ""} />
      </div>
    </div>
  );
}
