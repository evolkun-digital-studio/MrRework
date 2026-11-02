import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ImportJobModel } from "@/models/ImportJob";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";
import { findDuplicateTargetMappings } from "@/lib/import-export/mapping";

export const dynamic = "force-dynamic";

// PATCH — Step 4 (Column Mapping): save the resolved { csvColumn: targetFieldKey }
// mapping and the chosen duplicate-handling strategy, advancing the job to "mapped".
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  const body = await req.json().catch(() => null);
  if (!body?.columnMapping || typeof body.columnMapping !== "object") {
    return NextResponse.json({ error: "columnMapping is required." }, { status: 400 });
  }
  if (body.duplicateStrategy && !["update", "skip"].includes(body.duplicateStrategy)) {
    return NextResponse.json({ error: "Invalid duplicateStrategy." }, { status: 400 });
  }

  // Server-side backstop for the Mapping step's own duplicate-target check —
  // closes the hole for a saved preset, a stale client, or a direct API
  // call, none of which necessarily ran the client-side validation. Two
  // columns silently mapped to the same field is exactly how a prior import
  // ended up with product names replaced by an empty Elementor plugin-meta
  // value (see src/lib/import-export/mapping.ts's findDuplicateTargetMappings).
  const duplicates = findDuplicateTargetMappings(body.columnMapping);
  const duplicateKeys = Object.keys(duplicates);
  if (duplicateKeys.length > 0) {
    const detail = duplicateKeys.map((key) => `"${key}" is mapped from both ${duplicates[key].map((c) => `"${c}"`).join(" and ")}`).join("; ");
    return NextResponse.json({ error: `Each field can only be mapped from one column. ${detail}.` }, { status: 400 });
  }

  await dbConnect();
  const job = await ImportJobModel.findById(id);
  if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });

  job.columnMapping = body.columnMapping;
  if (body.duplicateStrategy) job.duplicateStrategy = body.duplicateStrategy;
  job.status = "mapped";
  // A new mapping invalidates any previous validation pass.
  job.validation = null;
  await job.save();

  return NextResponse.json({ job });
}
