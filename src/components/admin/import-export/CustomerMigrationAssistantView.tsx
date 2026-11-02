"use client";
import { useMemo, useState } from "react";
import { Card, StatCard, Table, Th, Td, Badge, Input } from "@/components/admin/ui";
import CustomerPreviewCard from "./CustomerPreviewCard";
import type { CustomerMigrationAssistantReportClient, CustomerPreviewResultClient, CustomerPreviewAddressClient } from "./types";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
const RISK_TONE: Record<string, Tone> = { "Low Risk": "success", "Medium Risk": "warning", "High Risk": "danger" };
const PRIORITY_TONE: Record<string, Tone> = { high: "danger", medium: "warning", low: "neutral" };
const SCORE_TONE = (label: string): Tone => (label === "Ready to Import" ? "success" : label === "Needs Review" ? "warning" : "danger");

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <Card title={title} description={description}>{children}</Card>;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
function fmtBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtAddr(a: CustomerPreviewAddressClient | null): string {
  if (!a) return "—";
  const line1 = [a.address, a.apartment].filter(Boolean).join(", ");
  const line2 = [a.city, a.state, a.postalCode, a.country].filter(Boolean).join(", ");
  return [line1, line2].filter(Boolean).join(" · ") || "—";
}

// Every warning string previewCustomers() (wooCustomerPreview.ts) produces
// is generated from a fixed, known set of templates — categorized by
// matching those same prefixes, not by re-deriving the checks here.
const WARNING_CATEGORIES: { label: string; test: (w: string) => boolean }[] = [
  { label: "Missing email", test: (w) => w.startsWith("Missing email") },
  { label: "Duplicate email", test: (w) => w.startsWith("Duplicate email") },
  { label: "Invalid email", test: (w) => w.includes("does not look like a valid email") },
  { label: "Invalid phone", test: (w) => w.includes("doesn't look valid") },
  { label: "Missing billing address", test: (w) => w === "No billing address." },
  { label: "Missing shipping address", test: (w) => w === "No shipping address." },
  { label: "Unknown role", test: (w) => w.startsWith("Unknown role") },
  { label: "Protected account match", test: (w) => w.startsWith("Matches an existing") },
];

export default function CustomerMigrationAssistantView({
  report, preview,
}: {
  report: CustomerMigrationAssistantReportClient;
  preview: CustomerPreviewResultClient;
}) {
  const { analysis, risk, recommendations, plan, estimate } = report;
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const passwordResetAccounts =
    analysis.databaseImpact.customersToCreate + (analysis.databaseImpact.customersToUpdate - analysis.databaseImpact.protectedAccountsMatched);
  const invalidRecords = analysis.quality.missingEmail + analysis.quality.invalidEmail;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q ? preview.rows.filter((r) => r.email.toLowerCase().includes(q)) : preview.rows;
    return showAll ? rows : rows.slice(0, 20);
  }, [preview.rows, search, showAll]);

  const duplicateRows = useMemo(() => preview.rows.filter((r) => r.existsInDb || r.isDuplicateInFile), [preview.rows]);
  const addressRows = useMemo(() => preview.rows.filter((r) => r.after.billingAddress || r.after.shippingAddress), [preview.rows]);

  const warningCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of preview.rows) {
      for (const w of row.warnings) {
        const cat = WARNING_CATEGORIES.find((c) => c.test(w));
        const label = cat?.label ?? "Other";
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [preview.rows]);

  return (
    <div className="space-y-5">
      {/* Risk */}
      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-stone">Migration Risk</div>
            <div className="mt-1.5"><Badge tone={RISK_TONE[risk.level] ?? "neutral"}>{risk.level}</Badge> <span className="text-stone text-[12.5px] ml-2">score {risk.score}%</span></div>
          </div>
        </div>
        <ul className="mt-3 space-y-1 text-[12.5px] text-stone list-disc list-inside">
          {risk.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
        </ul>
      </Card>

      {/* Overview */}
      <SectionCard title="Overview" description={analysis.fileName}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Customers" value={analysis.general.totalCustomers} />
          <StatCard label="Existing Customers" value={analysis.databaseImpact.customersToUpdate} />
          <StatCard label="New Customers" value={analysis.databaseImpact.customersToCreate} />
          <StatCard label="Updates" value={analysis.databaseImpact.customersToUpdate} />
          <StatCard label="Duplicate Emails" value={analysis.quality.duplicateEmailsInFile} />
          <StatCard label="Invalid Records" value={invalidRecords} />
          <StatCard label="Password Reset Accounts" value={passwordResetAccounts} />
          <StatCard label="Newsletter Subscribers" value={analysis.general.subscribedToNewsletter} />
        </div>
      </SectionCard>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <SectionCard title="Recommendations">
          <div className="space-y-2">
            {recommendations.map((rec, i) => (
              <div key={i} className="flex items-center gap-2.5 text-[13px]">
                <Badge tone={PRIORITY_TONE[rec.priority]}>{rec.priority}</Badge>
                {rec.message}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Warnings */}
      <SectionCard title="Warnings" description="Aggregated across every customer row in this file.">
        {warningCounts.length === 0 ? (
          <p className="text-[13px] text-stone">No warnings — this file looks clean.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {warningCounts.map(([label, count]) => (
              <Badge key={label} tone="warning">{label}: {count}</Badge>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Migration Plan */}
      <SectionCard title="Migration Plan" description="A phased, step-by-step timeline derived from this file's actual contents.">
        <div className="space-y-3">
          {plan.map((p) => (
            <div key={p.phase} className="flex items-start justify-between gap-4 border border-line dark:border-[#332e26] rounded-brand px-4 py-3">
              <div>
                <div className="text-[13px] font-semibold">Phase {p.phase} — {p.title}</div>
                <div className="text-[12px] text-stone mt-0.5">{p.description}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-[18px]">{p.expectedCount}</div>
                <div className="text-[11px] text-stone">{p.unit}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Verification Preview */}
      <SectionCard title="Verification Preview" description={'Expected outcome of a real run, assuming the default "update" duplicate strategy.'}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Imported" value={analysis.databaseImpact.customersToCreate} />
          <StatCard label="Updated" value={analysis.databaseImpact.customersToUpdate} />
          <StatCard label="Skipped" value={0} sub='0 unless "skip" strategy is chosen' />
          <StatCard label="Failed" value={invalidRecords} sub="Missing/invalid email" />
        </div>
      </SectionCard>

      {/* Address Preview */}
      <SectionCard title="Address Preview" description="Billing and shipping addresses exactly as they will appear after import.">
        {addressRows.length === 0 ? (
          <p className="text-[13px] text-stone">No addresses found in this file.</p>
        ) : (
          <Table>
            <thead><tr><Th>Email</Th><Th>Billing Address</Th><Th>Shipping Address</Th></tr></thead>
            <tbody>
              {addressRows.slice(0, 50).map((r) => (
                <tr key={r.row}>
                  <Td className="max-w-[200px] truncate">{r.email}</Td>
                  <Td className="max-w-[300px]">{fmtAddr(r.after.billingAddress)}</Td>
                  <Td className="max-w-[300px]">{fmtAddr(r.after.shippingAddress)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {addressRows.length > 50 && <p className="text-[11.5px] text-stone mt-2">Showing the first 50 of {addressRows.length} customers with an address.</p>}
      </SectionCard>

      {/* Duplicate Resolution */}
      <SectionCard title="Duplicate Resolution" description="Every incoming customer that matches an existing MongoDB account by email, or shares an email with another row in this file — existing data vs. incoming data, differences highlighted.">
        {duplicateRows.length === 0 ? (
          <p className="text-[13px] text-stone">No duplicates or existing matches found.</p>
        ) : (
          <div className="space-y-3">
            {duplicateRows.slice(0, 30).map((row) => <CustomerPreviewCard key={row.row} row={row} />)}
          </div>
        )}
        {duplicateRows.length > 30 && <p className="text-[11.5px] text-stone mt-2">Showing the first 30 of {duplicateRows.length} matches.</p>}
      </SectionCard>

      {/* Customer Preview */}
      <SectionCard title="Customer Preview" description="Before → after for every customer in this file — no database write.">
        <div className="flex items-center gap-3 mb-4">
          <Input placeholder="Search by email…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <span className="text-[11.5px] text-stone">{filteredRows.length} of {preview.rows.length} shown{preview.truncated ? ` (file has ${preview.totalRows} total — preview capped at ${preview.rows.length})` : ""}</span>
        </div>
        <div className="space-y-3">
          {filteredRows.map((row) => <CustomerPreviewCard key={row.row} row={row} />)}
        </div>
        {!showAll && preview.rows.length > 20 && !search && (
          <button type="button" onClick={() => setShowAll(true)} className="mt-4 text-[12px] uppercase tracking-wide underline">
            Show all {preview.rows.length} customers
          </button>
        )}
      </SectionCard>

      {/* Summary */}
      <SectionCard title="Summary">
        <div className="flex items-center gap-3 mb-4">
          <Badge tone={SCORE_TONE(analysis.summary.label)}>{analysis.summary.label}</Badge>
          <span className="text-[13px] text-stone">Readiness score: {analysis.summary.score}/100</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Estimated Duration" value={fmtMs(estimate.durationMs)} sub="Estimate — not a measurement" />
          <StatCard label="Estimated Peak Memory" value={fmtBytes(estimate.peakMemoryBytes)} sub="Estimate — not a measurement" />
          <StatCard label="Estimated Writes" value={estimate.writes} sub="One document write per customer" />
        </div>
      </SectionCard>
    </div>
  );
}
