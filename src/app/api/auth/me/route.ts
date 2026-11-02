import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/customerAuth";
import { serializeUser } from "@/lib/account";

export const dynamic = "force-dynamic";

// Bootstraps client-side "is a customer logged in" state — used by the auth
// store/modal, the Header account icon, and every guest-gated action.
// Deliberately does not lazily create a shadow account (unlike
// getOrCreateAccountUser()) — a guest with no session simply gets
// `user: null`, nothing is written to the DB by checking this.
export async function GET() {
  const user = await getCustomerSession();
  return NextResponse.json({ user: user ? serializeUser(user) : null });
}
