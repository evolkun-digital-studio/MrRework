import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { serializeImporters } from "@/lib/import-export/registry";

export const dynamic = "force-dynamic";

// GET — the list of registered importers, driving the dashboard cards and
// the wizard's "Choose Import Type" step. A future importer becomes visible
// here the moment it's added to src/lib/import-export/registry.ts — no
// route or UI change required.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  return NextResponse.json({ items: serializeImporters() });
}
