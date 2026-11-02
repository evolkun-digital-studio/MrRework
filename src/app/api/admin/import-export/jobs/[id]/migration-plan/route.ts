import { NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/errorMonitoring";
import { dbConnect } from "@/lib/mongodb";
import { ImportJobModel } from "@/models/ImportJob";
import { requireAdmin } from "@/lib/adminAuth";
import { isValidObjectId, invalidIdResponse } from "@/lib/validation";
import { buildMigrationPlan } from "@/lib/import-export/products/migrationAssistant";
import { buildCustomerMigrationPlan } from "@/lib/import-export/customers/wooCustomerMigrationAssistant";
import { buildOrderMigrationPlan } from "@/lib/import-export/orders/wooOrderMigrationAssistant";
import { buildReviewMigrationPlan } from "@/lib/import-export/reviews/wooReviewMigrationAssistant";
import { buildContentMigrationPlan } from "@/lib/import-export/content/wooContentMigrationAssistant";

export const dynamic = "force-dynamic";

// POST — the MrRework Migration Assistant's full report, one per import type.
// Read-only: reuses the already-uploaded file from an existing ImportJob
// (created by the unmodified POST /jobs route — this endpoint never writes
// to it), and nothing in either call chain below writes to MongoDB either.
// Nothing is persisted back onto the job — the report is returned once,
// same as /analyze.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  if (!isValidObjectId(id)) return invalidIdResponse();
  await dbConnect();
  const job = await ImportJobModel.findById(id).lean<any>();
  if (!job) return NextResponse.json({ error: "Import job not found." }, { status: 404 });

  try {
    if (job.type === "products") {
      const report = await buildMigrationPlan(job.filePath, job.fileName, new Date(job.createdAt));
      return NextResponse.json({ report });
    }
    if (job.type === "customers") {
      const report = await buildCustomerMigrationPlan(job.filePath, job.fileName);
      return NextResponse.json({ report });
    }
    if (job.type === "orders") {
      const report = await buildOrderMigrationPlan(job.filePath, job.fileName);
      return NextResponse.json({ report });
    }
    if (job.type === "reviews") {
      const report = await buildReviewMigrationPlan(job.filePath, job.fileName);
      return NextResponse.json({ report });
    }
    if (job.type === "content") {
      // The one import type with no importRow of its own — composes the
      // Blog + Pages analyzers from this same uploaded file into one
      // unified report. See ADMIN_CMS.md § Content & SEO Migration System.
      const report = await buildContentMigrationPlan(job.filePath, job.fileName);
      return NextResponse.json({ report });
    }
    return NextResponse.json({ error: `The Migration Assistant doesn't support import type "${job.type}" yet.` }, { status: 400 });
  } catch (err) {
    captureError(err, { route: "src/app/api/admin/import-export/jobs/[id]/migration-plan/route.ts" });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Migration analysis failed." }, { status: 500 });
  }
}
