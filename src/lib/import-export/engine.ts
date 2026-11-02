import { dbConnect } from "@/lib/mongodb";
import { ImportJobModel } from "@/models/ImportJob";
import { getImporter } from "./registry";
import { streamRows } from "./csv";
import type { ImportRunContext, ValidationIssue } from "./types";
import { captureError } from "@/lib/errorMonitoring";

// The generic orchestration layer. This file has no idea what a "Product"
// or a "SKU" is — it only knows how to stream a CSV, hand each row to
// whatever importer is registered for job.type, and keep the ImportJob
// document's progress/report fields up to date. A future Categories or
// Customers importer needs zero changes here.

const BATCH_SIZE = 25;
const MAX_STORED_ISSUES = 500;

function buildContext(adminUserId: string, duplicateStrategy: "update" | "skip"): ImportRunContext {
  return { adminUserId, duplicateStrategy, seenSkus: new Set(), seenSlugs: new Set(), skuToId: new Map(), scratch: {} };
}

// Generic across every importer — buckets by the importer's own reasonCode
// when it provides one, falling back to grouping by the raw message for an
// importer that doesn't (older code, or a type that hasn't adopted
// reasonCode yet). The engine still has no idea what any of these reasons
// actually mean; it just groups and counts.
function recordErrorSummary(summary: Map<string, { message: string; count: number }>, reasonCode: string | undefined, message: string) {
  const key = reasonCode ?? message;
  const existing = summary.get(key);
  if (existing) existing.count += 1;
  else summary.set(key, { message, count: 1 });
}

function summaryToReport(summary: Map<string, { message: string; count: number }>) {
  return [...summary.entries()]
    .map(([reasonCode, { message, count }]) => ({ reasonCode, message, count }))
    .sort((a, b) => b.count - a.count);
}

export async function validateImportJob(jobId: string) {
  await dbConnect();
  const job = await ImportJobModel.findById(jobId);
  if (!job) throw new Error("Import job not found.");

  const importer = getImporter(job.type);
  if (!importer?.mapRow || !importer.validateRow) throw new Error(`No importer registered for type "${job.type}".`);

  const mapping: Record<string, string> = job.columnMapping ?? {};
  const mappedTargetKeys = new Set(Object.values(mapping));
  const missingRequiredColumns = importer.targetFields
    .filter((f) => f.required && !mappedTargetKeys.has(f.key))
    .map((f) => f.label);

  const ctx = buildContext(String(job.adminUser ?? ""), job.duplicateStrategy);
  const issues: ValidationIssue[] = [];
  let rowIndex = 0;
  let duplicateCount = 0;
  const readRows = importer.streamRows ?? streamRows;

  for await (const raw of readRows(job.filePath)) {
    rowIndex++;
    const mapped = importer.mapRow(raw, mapping);
    const rowIssues = importer.validateRow(mapped, rowIndex, ctx);
    if (rowIssues.some((i) => /duplicate sku/i.test(i.message))) duplicateCount++;
    if (issues.length < MAX_STORED_ISSUES) issues.push(...rowIssues);
  }

  if (importer.finalizeValidation) {
    const crossRowIssues = importer.finalizeValidation(ctx);
    if (issues.length < MAX_STORED_ISSUES) issues.push(...crossRowIssues.slice(0, MAX_STORED_ISSUES - issues.length));
  }

  const errorCount = issues.filter((i) => i.level === "error").length;
  const warningCount = issues.filter((i) => i.level === "warning").length;

  const validation = {
    totalRows: rowIndex, errorCount, warningCount, duplicateCount,
    missingRequiredColumns, issues: issues.slice(0, MAX_STORED_ISSUES),
    truncated: issues.length >= MAX_STORED_ISSUES,
  };

  job.validation = validation;
  job.status = "validated";
  await job.save();
  return validation;
}

/**
 * Runs the actual import. Intended to be called un-awaited (fire-and-forget,
 * mirroring logActivity()'s pattern) by the /run route so the HTTP request
 * returns immediately; progress is polled via GET /jobs/[id] instead of any
 * push mechanism, consistent with how the rest of the app avoids sockets.
 */
export async function runImportJob(jobId: string): Promise<void> {
  await dbConnect();

  const startedAt = Date.now();
  // Atomic claim: only the caller that flips status validated -> importing
  // proceeds. A second concurrent call (a double-clicked "Start Import", a
  // retried request, or — as found during verification — React's
  // development-mode effect double-invocation triggering the /run route
  // twice) sees status is no longer "validated" and returns immediately
  // instead of racing the first run's reads/writes, which was otherwise
  // producing duplicated variants and duplicate products.
  const job = await ImportJobModel.findOneAndUpdate(
    { _id: jobId, status: "validated" },
    { $set: { status: "importing", progress: { currentRow: 0, imported: 0, updated: 0, skipped: 0, failed: 0, startedAt: new Date(startedAt) } } },
    { new: true }
  );
  if (!job) return;

  const importer = getImporter(job.type);
  if (!importer?.mapRow || !importer.importRow) {
    job.status = "failed";
    job.report = { imported: 0, updated: 0, skipped: 0, failed: 0, warnings: [`No importer registered for type "${job.type}".`], errors: [] };
    await job.save();
    return;
  }

  const mapping: Record<string, string> = job.columnMapping ?? {};
  const ctx = buildContext(String(job.adminUser ?? ""), job.duplicateStrategy);

  const counts = { imported: 0, updated: 0, skipped: 0, failed: 0 };
  const errors: { row: number; message: string; identifier?: string; label?: string; reasonCode?: string }[] = [];
  const updateSnapshots: { identifier: string; documentId: string; previousValues: Record<string, unknown> }[] = [];
  // Tallied over every failure, not just the first MAX_STORED_ISSUES — so
  // "1,003 failed: parent product failed to import" is accurate for a run
  // with far more failures than the itemized log can hold, not an estimate
  // extrapolated from a truncated sample.
  const errorSummary = new Map<string, { message: string; count: number }>();
  let rowIndex = 0;
  let batch: Record<string, string>[] = [];
  let cancelled = false;
  let peakMemoryBytes = 0;
  const readRows = importer.streamRows ?? streamRows;

  async function flushBatch() {
    for (const raw of batch) {
      rowIndex++;
      try {
        const mapped = importer!.mapRow!(raw, mapping);
        const result = await importer!.importRow!(mapped, rowIndex, ctx);
        counts[result.outcome] += 1;
        if (result.outcome === "failed") {
          const message = result.message ?? "Import failed.";
          if (errors.length < MAX_STORED_ISSUES) {
            errors.push({ row: rowIndex, message, identifier: result.identifier, label: result.label, reasonCode: result.reasonCode });
          }
          recordErrorSummary(errorSummary, result.reasonCode, message);
        }
        if (result.snapshot && updateSnapshots.length < MAX_STORED_ISSUES) {
          updateSnapshots.push(result.snapshot);
        }
      } catch (err) {
        // A single bad row must never abort the run — every write above is
        // one atomic MongoDB document operation, so a failure here has left
        // nothing partially written; we just record it and move on.
        counts.failed += 1;
        const message = err instanceof Error ? err.message : "Unknown error.";
        if (errors.length < MAX_STORED_ISSUES) {
          errors.push({ row: rowIndex, message, reasonCode: "unexpected_error" });
        }
        recordErrorSummary(errorSummary, "unexpected_error", message);
      }
    }
    batch = [];
    peakMemoryBytes = Math.max(peakMemoryBytes, process.memoryUsage().heapUsed);

    const elapsed = Date.now() - startedAt;
    const msPerRow = rowIndex > 0 ? elapsed / rowIndex : 0;
    const remainingRows = Math.max(0, (job.totalRows ?? rowIndex) - rowIndex);
    const progress = {
      currentRow: rowIndex, ...counts,
      startedAt: new Date(startedAt),
      estimatedRemainingMs: msPerRow > 0 ? Math.round(remainingRows * msPerRow) : undefined,
    };
    job.progress = progress as any;
    await ImportJobModel.updateOne({ _id: job._id }, { $set: { progress } });
  }

  try {
    for await (const raw of readRows(job.filePath)) {
      batch.push(raw);
      if (batch.length >= BATCH_SIZE) {
        await flushBatch();
        const fresh = await ImportJobModel.findById(job._id).select("cancelRequested").lean<{ cancelRequested?: boolean }>();
        if (fresh?.cancelRequested) { cancelled = true; break; }
      }
    }
    if (!cancelled && batch.length) await flushBatch();

    job.status = cancelled ? "cancelled" : "completed";
    job.report = {
      imported: counts.imported, updated: counts.updated, skipped: counts.skipped, failed: counts.failed,
      durationMs: Date.now() - startedAt,
      peakMemoryBytes,
      warnings: cancelled ? ["Import was cancelled by an administrator."] : [],
      errors,
      errorSummary: summaryToReport(errorSummary),
      updateSnapshots,
    };
    await job.save();
  } catch (err) {
    // Distinct from a per-row failure (recorded in `errors` above and
    // never fatal to the run) — reaching here means the stream itself
    // broke (e.g. the uploaded file went missing/unreadable mid-run) or
    // something else genuinely unexpected happened, so it's worth actual
    // monitoring, not just a note in this one job's own report.
    captureError(err, { context: "runImportJob", jobId: String(job._id) });
    job.status = "failed";
    job.report = {
      imported: counts.imported, updated: counts.updated, skipped: counts.skipped, failed: counts.failed,
      durationMs: Date.now() - startedAt,
      peakMemoryBytes,
      warnings: [err instanceof Error ? err.message : "The import stopped unexpectedly."],
      errors,
      errorSummary: summaryToReport(errorSummary),
      updateSnapshots,
    };
    await job.save();
  }
}
