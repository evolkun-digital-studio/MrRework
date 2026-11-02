"use client";
import { CheckCircle2, AlertOctagon, FileJson, FileText } from "lucide-react";
import { Card, Table, Th, Td, Badge, Button, Banner, StatCard } from "@/components/admin/ui";
import { downloadBlob } from "@/lib/import-export/products/reportExport";
import type { MigrationCheckpointClient } from "./types";

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
function formatBytes(bytes?: number): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

// Post-Migration Validation: automatically compares expected (from the
// Compatibility Analysis / Migration Assistant reports, carried on the
// checkpoint) against actual (read-only reconciliation done server-side in
// POST .../checkpoints/[id]/finalize) and shows Migration Successful /
// Migration Requires Attention.
export default function VerificationReportCard({ checkpoint }: { checkpoint: MigrationCheckpointClient }) {
  const post = checkpoint.postMigration;
  if (!post) return null;
  const { validation } = post;

  const rows = [
    { label: "Products", expected: checkpoint.preMigration.expectedProducts, actual: post.actualProductsCreated + post.actualProductsUpdated, match: validation.productCountMatch },
    { label: "Categories Created", expected: checkpoint.preMigration.expectedCategoriesCreated, actual: post.actualCategoriesCreated, match: validation.categoryCountMatch },
    { label: "Variations", expected: checkpoint.preMigration.expectedVariations, actual: post.actualVariations, match: validation.variationCountMatch },
    { label: "Images Referenced", expected: checkpoint.preMigration.expectedImages, actual: post.actualImages, match: validation.imageCountMatch },
  ];

  function exportJson() {
    downloadBlob(JSON.stringify(checkpoint, null, 2), `migration-verification-${checkpoint._id}.json`, "application/json");
  }
  function exportCsv() {
    const lines = ["metric,expected,actual,match", ...rows.map((r) => `${r.label},${r.expected},${r.actual},${r.match}`)];
    downloadBlob(lines.join("\n"), `migration-verification-${checkpoint._id}.csv`, "text/csv;charset=utf-8");
  }

  return (
    <Card
      title="Verification Report"
      description="Expected (from the pre-migration analysis) vs. actual (read-only reconciliation after the run)."
      action={
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={exportCsv}><FileText size={13} /> CSV</Button>
          <Button variant="ghost" size="sm" onClick={exportJson}><FileJson size={13} /> JSON</Button>
        </div>
      }
    >
      <div className="flex items-center gap-2.5 mb-4">
        {validation.status === "successful" ? <CheckCircle2 size={20} className="text-[#1f3d2b]" /> : <AlertOctagon size={20} className="text-[#4a3a10]" />}
        <span className="text-[15px] font-semibold">{validation.status === "successful" ? "Migration Successful" : "Migration Requires Attention"}</span>
      </div>

      {validation.status !== "successful" && (
        <Banner tone="error">One or more counts didn't match expectations — review the created/updated products below and the job's error log before treating this migration as complete.</Banner>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Readiness Score" value={`${post.readinessScore}/100`} />
        <StatCard label="Created" value={post.actualProductsCreated} />
        <StatCard label="Updated" value={post.actualProductsUpdated} />
        <StatCard label="Skipped" value={post.actualProductsSkipped} />
        <StatCard label="Draft" value={post.actualProductsDraft} />
        <StatCard label="Categories Created" value={post.actualCategoriesCreated} />
        <StatCard label="Categories Reused" value={post.actualCategoriesReused} />
        <StatCard label="Variations Imported" value={post.actualVariations} />
        <StatCard label="Images Linked" value={post.actualImages} />
        <StatCard label="Time Taken" value={formatMs(post.timeTakenMs)} />
        <StatCard label="Rows / Second" value={post.rowsPerSecond ?? "—"} />
        <StatCard label="Peak Memory" value={formatBytes(post.peakMemoryBytes)} />
      </div>

      <Table>
        <thead><tr><Th>Metric</Th><Th>Expected</Th><Th>Actual</Th><Th>Match</Th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <Td>{r.label}</Td>
              <Td className="font-mono">{r.expected}</Td>
              <Td className="font-mono">{r.actual}</Td>
              <Td><Badge tone={r.match ? "success" : "warning"}>{r.match ? "Match" : "Mismatch"}</Badge></Td>
            </tr>
          ))}
        </tbody>
      </Table>

      {checkpoint.riskOverridden && (
        <p className="text-[11.5px] text-stone mt-3">This migration proceeded under a High Risk override — see Import History / Activity for the full record.</p>
      )}

      {post.warnings.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-wide text-stone mb-2">Warnings ({post.warnings.length})</div>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {post.warnings.slice(0, 50).map((w, i) => <li key={i} className="text-[12.5px] text-stone">• {w}</li>)}
          </ul>
        </div>
      )}

      {post.errors.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-wide text-stone mb-2">Errors ({post.errors.length})</div>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {post.errors.slice(0, 50).map((e, i) => <li key={i} className="text-[12.5px] text-[#7a2b2b]">• Row {e.row}: {e.message}</li>)}
          </ul>
        </div>
      )}

      {(checkpoint.preMigration.unsupportedFields?.length ?? 0) > 0 && (
        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-wide text-stone mb-2">Unsupported Fields ({checkpoint.preMigration.unsupportedFields!.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {checkpoint.preMigration.unsupportedFields!.map((f, i) => (
              <Badge key={i} tone="neutral">{f.field}</Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
