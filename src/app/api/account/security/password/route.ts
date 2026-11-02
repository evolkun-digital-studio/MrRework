import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getOrCreateAccountUser } from "@/lib/account";
import { clearOtherCustomerSessions } from "@/lib/customerAuth";

export const dynamic = "force-dynamic";

// PATCH — set a password for the first time, or change an existing one.
// getOrCreateAccountUser() resolves a real logged-in session first, falling
// back to the guest shadow account only when there is none — see its own
// comment in src/lib/account.ts. Requires the *current* password when one
// already exists, and always hashes with bcrypt before storing (never
// stores or returns plaintext).
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { currentPassword, newPassword } = body ?? {};

  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  const user = await getOrCreateAccountUser();

  if (user.passwordHash) {
    if (typeof currentPassword !== "string" || !currentPassword) {
      return NextResponse.json({ error: "Current password is required." }, { status: 400 });
    }
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
    }
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.passwordChangedAt = new Date();
  await user.save();

  // A password change is a security-sensitive action — any other device's
  // session must not survive it, or it defeats the point of changing a
  // possibly-compromised password. Keeps only the session making this
  // request (this device stays logged in).
  await clearOtherCustomerSessions(user);

  return NextResponse.json({ ok: true });
}
