import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/errorMonitoring";
import { dbConnect } from "@/lib/mongodb";
import { ImportJobModel } from "@/models/ImportJob";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";
import { analyzeWooCsv } from "@/lib/import-export/products/wooCsvAnalyzer";
import { analyzeWooCustomerSql } from "@/lib/import-export/customers/wooCustomerSqlAnalyzer";
import { analyzeWooOrderSql } from "@/lib/import-export/orders/wooOrderSqlAnalyzer";
import { analyzeWooReviewSql } from "@/lib/import-export/reviews/wooReviewSqlAnalyzer";
import { analyzeWooBlogSql, analyzeWooPageSql } from "@/lib/import-export/content/wooContentSqlAnalyzer";

export const dynamic = "force-dynamic";

// One read-only Compatibility Analyzer per import type — products (CSV) and
// customers (SQL) today, dispatched by job.type. Every analyzer shares the
// same guarantee: no field is ever persisted onto the ImportJob (see
// wooCsvAnalyzer.ts's module comment) — the report is handed straight back
// and lives only in the wizard's React state from then on.
const ANALYZERS: Record<string, (filePath: string, fileName: string) => Promise<unknown>> = {
  products: analyzeWooCsv,
  customers: analyzeWooCustomerSql,
  orders: analyzeWooOrderSql,
  reviews: analyzeWooReviewSql,
  blog: analyzeWooBlogSql,
  pages: analyzeWooPageSql,
};

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const job = await ImportJobModel.findById(id).lean<any>();
  if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });

  const analyze = ANALYZERS[job.type];
  if (!analyze) {
    return NextResponse.json({ error: `No analyzer available for import type "${job.type}".` }, { status: 400 });
  }

  try {
    const report = await analyze(job.filePath, job.fileName);
    return NextResponse.json({ report });
  } catch (err) {
    captureError(err, { route: "src/app/api/admin/import-export/jobs/[id]/analyze/route.ts" });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Analysis failed." }, { status: 500 });
  }
}
