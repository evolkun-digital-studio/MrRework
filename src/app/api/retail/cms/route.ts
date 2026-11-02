import { NextResponse } from "next/server";
import { getRetailSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

// Public, unauthenticated read of the Retail CMS content — the /retail
// page itself calls getRetailSettings() directly (no HTTP round-trip,
// same as every other RSC data fetch in this app), this route exists for
// any client-side consumer (a future client component, an external
// preview tool) that needs the same content without a server render.
export async function GET() {
  const settings = await getRetailSettings();
  return NextResponse.json({ settings });
}
