"use client";
import { useMemo, useState } from "react";
import { Card, StatCard, Table, Th, Td, Badge, Input } from "@/components/admin/ui";
import OrderPreviewCard from "./OrderPreviewCard";
import type { OrderMigrationAssistantReportClient, OrderPreviewResultClient } from "./types";

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
function fmtMoney(n: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "GBP" }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency ?? ""}`;
  }
}

export default function OrderMigrationAssistantView({
  report, preview,
}: {
  report: OrderMigrationAssistantReportClient;
  preview: OrderPreviewResultClient;
}) {
  const { analysis, risk, recommendations, plan, estimate } = report;
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q ? preview.rows.filter((r) => r.orderNumber.toLowerCase().includes(q)) : preview.rows;
    return showAll ? rows : rows.slice(0, 20);
  }, [preview.rows, search, showAll]);

  const duplicateRows = useMemo(() => preview.rows.filter((r) => r.existsInDb || r.isDuplicateInFile), [preview.rows]);
  const missingProductRows = useMemo(() => preview.rows.filter((r) => r.after.items.some((i) => !i.matched)), [preview.rows]);
  const missingCustomerRows = useMemo(() => preview.rows.filter((r) => r.after.isGuestOrder), [preview.rows]);

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
          <StatCard label="Total Orders" value={analysis.general.totalOrders} />
          <StatCard label="Orders to Create" value={analysis.databaseImpact.ordersToCreate} />
          <StatCard label="Orders to Update" value={analysis.databaseImpact.ordersToUpdate} />
          <StatCard label="Line Items" value={analysis.general.totalLineItems} />
          <StatCard label="Guest Orders" value={analysis.general.guestOrders} />
          <StatCard label="Registered Customer Orders" value={analysis.general.registeredCustomerOrders} />
          <StatCard label="Duplicate Order Numbers" value={analysis.quality.duplicateOrderNumbersInFile} />
          <StatCard label="Invalid Records" value={analysis.quality.missingOrderNumber + analysis.quality.negativeOrInvalidTotals} />
        </div>
      </SectionCard>

      {/* Revenue Summary */}
      <SectionCard title="Revenue Summary" description="Computed directly from each order's own grand total — never re-derived from line items, so it matches what the customer was actually charged.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Gross Revenue (all orders)" value={fmtMoney(analysis.general.revenue.grossRevenueAllOrders, analysis.general.revenue.dominantCurrency)} />
          <StatCard label="Recognized Paid Revenue" value={fmtMoney(analysis.general.revenue.recognizedPaidRevenue, analysis.general.revenue.dominantCurrency)} sub="Paid + refunded orders only" />
          <StatCard label="Average Order Value" value={fmtMoney(analysis.general.revenue.averageOrderValue, analysis.general.revenue.dominantCurrency)} />
          <StatCard label="Dominant Currency" value={analysis.general.revenue.dominantCurrency ?? "—"} sub={`${analysis.quality.currencyMismatch} order(s) differ`} />
        </div>
        {analysis.general.revenue.currencyBreakdown.length > 1 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {analysis.general.revenue.currencyBreakdown.map((c) => (
              <Badge key={c.currency} tone="neutral">{c.currency}: {c.count} orders · {fmtMoney(c.total, c.currency)}</Badge>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Status Breakdown */}
      <SectionCard title="Status Breakdown" description="Every raw WooCommerce status found in the file, mapped to this app's fulfillment/payment status pair.">
        <Table>
          <thead><tr><Th>WooCommerce Status</Th><Th>Fulfillment</Th><Th>Payment</Th><Th>Count</Th></tr></thead>
          <tbody>
            {analysis.general.statusBreakdown.map((s) => (
              <tr key={s.status}>
                <Td className="font-mono">{s.status || "(none)"}</Td>
                <Td>{s.fulfillmentStatus}</Td>
                <Td>{s.paymentStatus}</Td>
                <Td className="font-mono">{s.count}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      {/* Payment Breakdown */}
      <SectionCard title="Payment Breakdown" description="Every raw gateway id found in the file, bucketed into this app's paymentMethod values.">
        <Table>
          <thead><tr><Th>Gateway ID</Th><Th>Mapped Method</Th><Th>Count</Th></tr></thead>
          <tbody>
            {analysis.general.paymentBreakdown.map((p) => (
              <tr key={p.gatewayId}>
                <Td className="font-mono">{p.gatewayId || "(none)"}</Td>
                <Td><Badge tone={p.bucket === "other" ? "warning" : "neutral"}>{p.bucket}</Badge></Td>
                <Td className="font-mono">{p.count}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      {/* Timeline */}
      <SectionCard title="Timeline" description="Orders and revenue by month, from each order's created date.">
        {analysis.general.timeline.length === 0 ? (
          <p className="text-[13px] text-stone">No parseable order dates found in this file.</p>
        ) : (
          <Table>
            <thead><tr><Th>Period</Th><Th>Orders</Th><Th>Revenue</Th></tr></thead>
            <tbody>
              {analysis.general.timeline.map((t) => (
                <tr key={t.period}>
                  <Td className="font-mono">{t.period}</Td>
                  <Td className="font-mono">{t.orders}</Td>
                  <Td className="font-mono">{fmtMoney(t.revenue, analysis.general.revenue.dominantCurrency)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
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

      {/* Unsupported Metadata */}
      {analysis.unsupportedMetaKeys.length > 0 && (
        <SectionCard title="Unsupported Order Metadata" description="wp_postmeta keys found on order posts that this importer doesn't recognize or import.">
          <div className="flex flex-wrap gap-2">
            {analysis.unsupportedMetaKeys.slice(0, 40).map((k) => <Badge key={k.key} tone="neutral">{k.key}: {k.orderCount}</Badge>)}
          </div>
        </SectionCard>
      )}

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
          <StatCard label="Imported" value={analysis.databaseImpact.ordersToCreate} />
          <StatCard label="Updated" value={analysis.databaseImpact.ordersToUpdate} />
          <StatCard label="Skipped" value={0} sub='0 unless "skip" strategy is chosen' />
          <StatCard label="Failed" value={analysis.quality.missingOrderNumber + analysis.quality.negativeOrInvalidTotals} sub="Missing order number / invalid total" />
        </div>
      </SectionCard>

      {/* Missing Products */}
      <SectionCard title="Missing Products" description="Orders with at least one line item that couldn't be matched to a product already in the catalog.">
        {missingProductRows.length === 0 ? (
          <p className="text-[13px] text-stone">Every line item in this file matched a product.</p>
        ) : (
          <div className="space-y-3">
            {missingProductRows.slice(0, 30).map((row) => <OrderPreviewCard key={row.row} row={row} />)}
          </div>
        )}
        {missingProductRows.length > 30 && <p className="text-[11.5px] text-stone mt-2">Showing the first 30 of {missingProductRows.length} orders with an unmatched item.</p>}
      </SectionCard>

      {/* Missing Customers */}
      <SectionCard title="Missing Customers" description="Orders with no matching customer by email or WordPress ID — these will import as guest orders.">
        {missingCustomerRows.length === 0 ? (
          <p className="text-[13px] text-stone">Every order in this file matched an existing customer.</p>
        ) : (
          <div className="space-y-3">
            {missingCustomerRows.slice(0, 30).map((row) => <OrderPreviewCard key={row.row} row={row} />)}
          </div>
        )}
        {missingCustomerRows.length > 30 && <p className="text-[11.5px] text-stone mt-2">Showing the first 30 of {missingCustomerRows.length} guest orders.</p>}
      </SectionCard>

      {/* Duplicate Orders */}
      <SectionCard title="Duplicate Orders" description="Every incoming order that matches an existing order by order number, or shares an order number with another row in this file.">
        {duplicateRows.length === 0 ? (
          <p className="text-[13px] text-stone">No duplicates or existing matches found.</p>
        ) : (
          <div className="space-y-3">
            {duplicateRows.slice(0, 30).map((row) => <OrderPreviewCard key={row.row} row={row} />)}
          </div>
        )}
        {duplicateRows.length > 30 && <p className="text-[11.5px] text-stone mt-2">Showing the first 30 of {duplicateRows.length} matches.</p>}
      </SectionCard>

      {/* Order Preview */}
      <SectionCard title="Order Preview" description="Before → after for every order in this file — no database write.">
        <div className="flex items-center gap-3 mb-4">
          <Input placeholder="Search by order number…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <span className="text-[11.5px] text-stone">{filteredRows.length} of {preview.rows.length} shown{preview.truncated ? ` (file has ${preview.totalRows} total — preview capped at ${preview.rows.length})` : ""}</span>
        </div>
        <div className="space-y-3">
          {filteredRows.map((row) => <OrderPreviewCard key={row.row} row={row} />)}
        </div>
        {!showAll && preview.rows.length > 20 && !search && (
          <button type="button" onClick={() => setShowAll(true)} className="mt-4 text-[12px] uppercase tracking-wide underline">
            Show all {preview.rows.length} orders
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
          <StatCard label="Estimated Writes" value={estimate.writes} sub="One document write per order" />
        </div>
      </SectionCard>
    </div>
  );
}
