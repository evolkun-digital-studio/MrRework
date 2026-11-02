import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { ImportJobModel } from "@/models/ImportJob";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";
import { csvEscape } from "@/lib/csvExport";

export const dynamic = "force-dynamic";

// GET — Step 7 (Import Report)'s "Download Error Log" — builds a small CSV
// on the fly from the row-level errors stored on the job (capped at 500 by
// the engine; see engine.ts) rather than keeping a second file on disk.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const job = await ImportJobModel.findById(id).lean<any>();
  if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });

  const errors: { row: number; message: string; identifier?: string; label?: string; reasonCode?: string }[] = job.report?.errors ?? [];
  const errorSummary: { reasonCode: string; message: string; count: number }[] = job.report?.errorSummary ?? [];

  const summaryLines = errorSummary.length
    ? ["# Summary (full failure count, not just the rows listed below)", ...errorSummary.map((s) => `# ${s.count} failed: ${csvEscape(s.message)}`), "#"]
    : [];
  const detailLines = [
    "row,sku,name,message",
    ...errors.map((e) => `${e.row},${csvEscape(e.identifier ?? "")},${csvEscape(e.label ?? "")},${csvEscape(e.message)}`),
  ];
  const csv = [...summaryLines, ...detailLines].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="import-${id}-errors.csv"`,
    },
  });
}
