import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/errorMonitoring";
import { dbConnect } from "@/lib/mongodb";
import { ImportJobModel } from "@/models/ImportJob";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";
import { previewContent } from "@/lib/import-export/content/wooContentPreview";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const job = await ImportJobModel.findById(id).lean<any>();
  if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });
  if (job.type !== "blog") {
    return NextResponse.json({ error: `Blog preview only supports the Blog Posts import type (job type "${job.type}").` }, { status: 400 });
  }

  try {
    const result = await previewContent(job.filePath, job.columnMapping ?? {}, "post");
    return NextResponse.json({ result });
  } catch (err) {
    captureError(err, { route: "src/app/api/admin/import-export/jobs/[id]/preview-blog/route.ts" });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Preview failed." }, { status: 500 });
  }
}
