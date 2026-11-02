"use client";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button, StatCard, Banner, Table, Th, Td, Badge } from "@/components/admin/ui";
import type { ValidationResultClient } from "../types";

export default function ValidationStep({
  validation, validating, onContinue, onBack, onCancel,
}: {
  validation: ValidationResultClient | null;
  validating: boolean;
  onContinue: () => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  if (validating || !validation) {
    return (
      <div>
        <h2 className="text-[15px] font-semibold">Validation</h2>
        <p className="text-[12.5px] text-stone mt-1 mb-5">Checking every row against your mapping — SKUs, prices, categories, images…</p>
        <div className="h-40 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />
      </div>
    );
  }

  const errorIssues = validation.issues.filter((i) => i.level === "error");
  const warningIssues = validation.issues.filter((i) => i.level === "warning");

  return (
    <div>
      <h2 className="text-[15px] font-semibold">Validation</h2>
      <p className="text-[12.5px] text-stone mt-1 mb-5">Review before importing — you can still go back and fix the mapping, or continue anyway.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Rows checked" value={validation.totalRows} />
        <StatCard label="Errors" value={validation.errorCount} icon={<AlertCircle size={14} />} />
        <StatCard label="Warnings" value={validation.warningCount} icon={<AlertTriangle size={14} />} />
        <StatCard label="Duplicate SKUs" value={validation.duplicateCount} />
      </div>

      {validation.missingRequiredColumns.length > 0 && (
        <Banner tone="error">Missing required columns: {validation.missingRequiredColumns.join(", ")}.</Banner>
      )}

      {validation.errorCount === 0 && validation.warningCount === 0 && (
        <Banner tone="neutral"><CheckCircle2 size={13} className="inline -mt-0.5 mr-1.5" />No issues found — every row looks ready to import.</Banner>
      )}

      {validation.issues.length > 0 && (
        <div className="mt-4">
          <div className="text-[12px] font-medium mb-2">
            Issues {validation.truncated && <span className="text-stone font-normal">(showing first 500)</span>}
          </div>
          <Table>
            <thead><tr><Th>Row</Th><Th>Field</Th><Th>Issue</Th><Th>Level</Th></tr></thead>
            <tbody>
              {[...errorIssues, ...warningIssues].slice(0, 100).map((issue, i) => (
                <tr key={i}>
                  <Td className="font-mono">{issue.row}</Td>
                  <Td>{issue.field ?? "—"}</Td>
                  <Td>{issue.message}</Td>
                  <Td><Badge tone={issue.level === "error" ? "danger" : "warning"}>{issue.level}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {validation.issues.length > 100 && <p className="text-[11.5px] text-stone mt-2">And {validation.issues.length - 100} more — the full list is available in the error log after import.</p>}
        </div>
      )}

      {validation.errorCount > 0 && (
        <Banner tone="error">
          {validation.errorCount} row{validation.errorCount === 1 ? "" : "s"} will fail during import. You can continue — everything else will still be imported — or go back and fix the mapping first.
        </Banner>
      )}

      <div className="flex justify-between mt-6">
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}>Back to Mapping</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel Import</Button>
        </div>
        <Button onClick={onContinue}>Start Import</Button>
      </div>
    </div>
  );
}
