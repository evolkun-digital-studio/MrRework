import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { MediaMigrationJobModel } from "@/models/MediaMigrationJob";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";

export const dynamic = "force-dynamic";

// GET — the progress-polling endpoint used while status is "running".
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const job = await MediaMigrationJobModel.findById(id).populate("adminUser", "email firstName lastName").lean();
  if (!job) return NextResponse.json({ error: "Media migration job not found." }, { status: 404 });

  return NextResponse.json({ job });
}
