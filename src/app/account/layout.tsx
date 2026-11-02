import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrCreateAccountUser, serializeUser } from "@/lib/account";
import { requireCustomer } from "@/lib/customerAuth";
import { AccountProvider } from "@/components/account/AccountProvider";
import AccountSidebar from "@/components/account/AccountSidebar";

export const dynamic = "force-dynamic";

// Private, per-customer pages have no SEO value and should never be
// indexed — belt-and-braces alongside the /account disallow rule in
// robots.ts (a noindex here still applies even if a crawler ignores
// robots.txt, or the page was linked to from elsewhere).
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Guests may not view the account area — bounced home (never to a dedicated
// login page; there isn't one) with a marker the home page reads client-side
// to open the login modal (see AuthRedirectListener.tsx). Resolves via
// getOrCreateAccountUser() afterward exactly as before for the actual page
// data, since a real customer session always resolves through that same
// function now (see its own comment for why).
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await requireCustomer();
  if (!session) redirect("/?authRequired=account");

  const user = await getOrCreateAccountUser();
  const account = serializeUser(user);

  return (
    <div className="px-5 md:px-12 pt-32 pb-24 min-h-[70dvh]">
      <div className="border-b border-line pb-7 mb-8">
        <span className="eyebrow">My account</span>
        <h1 className="display mt-3" style={{ fontSize: "clamp(30px,5vw,64px)" }}>Account</h1>
      </div>

      <AccountProvider initial={account}>
        <div className="grid lg:grid-cols-[260px_1fr] gap-8 lg:gap-12">
          <AccountSidebar />
          <div className="min-w-0 max-w-3xl">{children}</div>
        </div>
      </AccountProvider>
    </div>
  );
}
