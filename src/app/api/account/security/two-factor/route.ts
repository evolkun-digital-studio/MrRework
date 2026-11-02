import { NextRequest, NextResponse } from "next/server";
import { getOrCreateAccountUser } from "@/lib/account";

export const dynamic = "force-dynamic";

// PATCH — toggle 2FA preference. Records intent only; there's no real
// TOTP/SMS challenge wired up yet (no auth to challenge during), so this is
// the flag a future login flow would branch on.
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "`enabled` must be a boolean." }, { status: 400 });
  }
  const user = await getOrCreateAccountUser();
  user.twoFactorEnabled = body.enabled;
  await user.save();
  return NextResponse.json({ twoFactorEnabled: user.twoFactorEnabled });
}
