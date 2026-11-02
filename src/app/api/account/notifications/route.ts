import { NextRequest, NextResponse } from "next/server";
import { getOrCreateAccountUser, serializeUser } from "@/lib/account";

export const dynamic = "force-dynamic";

const KEYS = ["email", "sms", "marketing", "orderUpdates", "newsletter"] as const;

export async function GET() {
  const user = await getOrCreateAccountUser();
  return NextResponse.json(serializeUser(user).notificationSettings);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const user = await getOrCreateAccountUser();
  if (!user.notificationSettings) user.notificationSettings = {};
  for (const k of KEYS) {
    if (k in body) user.notificationSettings[k] = !!body[k];
  }
  user.markModified("notificationSettings");
  await user.save();

  return NextResponse.json(serializeUser(user).notificationSettings);
}
