import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ImportMappingPresetModel } from "@/models/ImportMappingPreset";
import { requireAdmin } from "@/lib/adminAuth";
import { findDuplicateTargetMappings } from "@/lib/import-export/mapping";

export const dynamic = "force-dynamic";

// GET — saved column-mapping presets for one import type (Step 4's "Load preset").
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type");
  if (!type) return NextResponse.json({ error: "type is required." }, { status: 400 });

  await dbConnect();
  const items = await ImportMappingPresetModel.find({ importType: type }).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ items });
}

// POST — save the current mapping as a reusable preset ("Save mapping presets").
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.importType || !body?.mapping) {
    return NextResponse.json({ error: "name, importType, and mapping are required." }, { status: 400 });
  }

  // Same guard as PATCH /jobs/[id]/mapping — a preset is just a saved
  // mapping reused by future imports, so it must be held to the same
  // "no two columns claim the same field" rule, or a corrupted mapping
  // could be saved once and silently keep corrupting every import that
  // loads it afterward.
  const duplicates = findDuplicateTargetMappings(body.mapping);
  const duplicateKeys = Object.keys(duplicates);
  if (duplicateKeys.length > 0) {
    const detail = duplicateKeys.map((key) => `"${key}" is mapped from both ${duplicates[key].map((c) => `"${c}"`).join(" and ")}`).join("; ");
    return NextResponse.json({ error: `Each field can only be mapped from one column. ${detail}.` }, { status: 400 });
  }

  await dbConnect();
  const preset = await ImportMappingPresetModel.create({
    name: body.name, importType: body.importType, mapping: body.mapping, adminUser: admin._id,
  });

  return NextResponse.json({ preset }, { status: 201 });
}
