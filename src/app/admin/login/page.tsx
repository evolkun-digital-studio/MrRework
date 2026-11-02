import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/adminAuth";
import AdminLoginForm from "./AdminLoginForm";

export const metadata: Metadata = { title: "Admin login · MrRework" };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  // Authoritative (DB-backed) check — a stale/expired cookie here just
  // renders the form normally rather than bouncing anywhere, unlike a
  // cookie-presence-only check would (see middleware.ts for why that
  // distinction matters — it avoids a redirect loop).
  const session = await getAdminSession();
  if (session) redirect("/admin");

  return (
    <div className="min-h-screen bg-paper text-ink flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="font-display text-2xl tracking-tight" style={{ fontWeight: 900 }}>MrRework</span>
          <p className="text-[11px] uppercase tracking-wide text-stone mt-2">Admin panel</p>
        </div>
        <AdminLoginForm />
      </div>
    </div>
  );
}
