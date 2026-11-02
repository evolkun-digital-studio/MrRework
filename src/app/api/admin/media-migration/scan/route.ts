import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { scanMediaReferences } from "@/lib/media-migration/engine";
import { availableMediaSources, serializeMediaSources } from "@/lib/media-migration/registry";

export const dynamic = "force-dynamic";

// POST — read-only pre-flight. Body: { sources?: string[] } (defaults to
// every "available" source). Never writes to Media/Product/Category.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const requested: string[] | undefined = Array.isArray(body?.sources) ? body.sources : undefined;
  const sourceKeys = requested?.length ? requested : availableMediaSources().map((s) => s.key);

  const summary = await scanMediaReferences(sourceKeys);
  return NextResponse.json({ summary, registry: serializeMediaSources() });
}
