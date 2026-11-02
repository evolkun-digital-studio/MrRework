import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ImportMappingPresetModel } from "@/models/ImportMappingPreset";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const preset = await ImportMappingPresetModel.findByIdAndDelete(id);
  if (!preset) return NextResponse.json({ error: "Preset not found." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
