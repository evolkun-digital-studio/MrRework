import { NextResponse } from "next/server";
import { clearCustomerSession } from "@/lib/customerAuth";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearCustomerSession();
  return NextResponse.json({ ok: true });
}
