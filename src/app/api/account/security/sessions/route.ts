import { NextRequest, NextResponse } from "next/server";
import { getOrCreateAccountUser, labelDevice } from "@/lib/account";

export const dynamic = "force-dynamic";

// Maps the REAL session store (User.customerSessions — see
// src/lib/customerAuth.ts) to the same shape the account/security page
// already renders, so "Forget" here actually revokes a working login
// instead of editing a separate, cosmetic activity log. `sessionId` is the
// subdocument's own _id (customerSessions keeps its default auto _id for
// exactly this purpose); `lastSeenAt` falls back to `createdAt` since a
// session token has no separate last-activity timestamp tracked today.
function serializeCustomerSessions(user: any) {
  return (user.customerSessions ?? [])
    .map((s: any) => ({
      sessionId: String(s._id),
      device: labelDevice(s.userAgent ?? ""),
      ip: s.ip ?? "",
      createdAt: s.createdAt,
      lastSeenAt: s.createdAt,
    }))
    .sort((a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

// GET — this account's real, currently-valid login sessions.
export async function GET() {
  const user = await getOrCreateAccountUser();
  return NextResponse.json({ items: serializeCustomerSessions(user) });
}

// DELETE — revoke one real session (?sessionId=, a customerSessions
// subdocument _id). If it's the session making this request, that device is
// genuinely signed out immediately, not "harmlessly re-added."
export async function DELETE(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId is required." }, { status: 400 });

  const user = await getOrCreateAccountUser();
  user.customerSessions = user.customerSessions.filter((s: any) => String(s._id) !== sessionId);
  await user.save();

  return NextResponse.json({ items: serializeCustomerSessions(user) });
}
