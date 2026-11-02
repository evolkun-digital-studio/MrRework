"use client";
import { Card, StatCard, Table, Th, Td, Badge } from "@/components/admin/ui";
import type { OrderAnalysisReportClient } from "./types";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
const SCORE_TONE = (label: string): Tone => (label === "Ready to Import" ? "success" : label === "Needs Review" ? "warning" : "danger");

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <Card title={title} description={description}>{children}</Card>;
}

// The Orders counterpart of CustomerAnalysisReportView.tsx — same posture,
// rendering wooOrderSqlAnalyzer.ts's own OrderAnalysisReport shape (revenue,
// status/payment breakdowns, line items) rather than forcing it through the
// Products-specific AnalysisReportView, which has no field in common with it.
export default function OrderAnalysisReportView({ report }: { report: OrderAnalysisReportClient }) {
  const { general, quality, unsupportedMetaKeys, databaseImpact, summary } = report;

  return (
    <div className="space-y-5">
      <SectionCard title="Migration Readiness" description={report.fileName}>
        <div className="flex items-center gap-4 mb-4">
          <Badge tone={SCORE_TONE(summary.label)}>{summary.label}</Badge>
          <span className="text-[13px] text-stone">Score: {summary.score}/100</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Orders" value={general.totalOrders} />
          <StatCard label="Line Items" value={general.totalLineItems} />
          <StatCard label="Guest Orders" value={general.guestOrders} />
          <StatCard label="Registered Customer Orders" value={general.registeredCustomerOrders} />
          <StatCard label="To Create" value={databaseImpact.ordersToCreate} />
          <StatCard label="To Update" value={databaseImpact.ordersToUpdate} />
          <StatCard label="Matched Customers" value={databaseImpact.matchedCustomers} />
          <StatCard label="Missing Customers" value={databaseImpact.missingCustomers} />
        </div>
      </SectionCard>

      {databaseImpact.protectedOrdersMatched > 0 && (
        <SectionCard title="Protected Orders">
          <p className="text-[13px] text-stone">
            {databaseImpact.protectedOrdersMatched} matched order(s) already have an admin-managed status history.
            Only profile/data fields will be updated for these — fulfillment/payment status are never touched on an existing order. See ADMIN_CMS.md § Order Migration Security.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Revenue">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard label="Gross Revenue (all orders)" value={general.revenue.grossRevenueAllOrders} />
          <StatCard label="Recognized Paid Revenue" value={general.revenue.recognizedPaidRevenue} />
          <StatCard label="Average Order Value" value={general.revenue.averageOrderValue} />
          <StatCard label="Dominant Currency" value={general.revenue.dominantCurrency ?? "—"} />
        </div>
        <Table>
          <thead><tr><Th>Currency</Th><Th>Orders</Th><Th>Total</Th></tr></thead>
          <tbody>
            {general.revenue.currencyBreakdown.map((c) => (
              <tr key={c.currency}><Td>{c.currency}</Td><Td className="font-mono">{c.count}</Td><Td className="font-mono">{c.total}</Td></tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      <SectionCard title="Status Breakdown">
        <Table>
          <thead><tr><Th>WooCommerce Status</Th><Th>Fulfillment</Th><Th>Payment</Th><Th>Count</Th></tr></thead>
          <tbody>
            {general.statusBreakdown.map((s) => (
              <tr key={s.status}>
                <Td className="font-mono text-[11.5px]">{s.status}</Td>
                <Td className="capitalize">{s.fulfillmentStatus}</Td>
                <Td className="capitalize">{s.paymentStatus}</Td>
                <Td className="font-mono">{s.count}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      <SectionCard title="Payment Method Breakdown">
        <Table>
          <thead><tr><Th>Bucket</Th><Th>Raw Gateway ID</Th><Th>Count</Th></tr></thead>
          <tbody>
            {general.paymentBreakdown.map((p, i) => (
              <tr key={i}><Td className="capitalize">{p.bucket}</Td><Td className="font-mono text-[11.5px]">{p.gatewayId}</Td><Td className="font-mono">{p.count}</Td></tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      <SectionCard title="Data Quality">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard label="Missing Order Number" value={quality.missingOrderNumber} />
          <StatCard label="Duplicate Order Numbers" value={quality.duplicateOrderNumbersInFile} />
          <StatCard label="Negative/Invalid Totals" value={quality.negativeOrInvalidTotals} />
          <StatCard label="Missing Billing Address" value={quality.missingBillingAddress} />
          <StatCard label="Missing Shipping Address" value={quality.missingShippingAddress} />
          <StatCard label="Unrecognized Status" value={quality.unrecognizedStatus} />
          <StatCard label="Unrecognized Payment Method" value={quality.unrecognizedPaymentMethod} />
          <StatCard label="Currency Mismatch" value={quality.currencyMismatch} />
        </div>
        {quality.issues.length > 0 && (
          <Table>
            <thead><tr><Th>Row</Th><Th>Order #</Th><Th>Issue</Th><Th>Level</Th></tr></thead>
            <tbody>
              {quality.issues.slice(0, 50).map((i, idx) => (
                <tr key={idx}>
                  <Td className="font-mono">{i.row}</Td>
                  <Td className="max-w-[160px] truncate">{i.orderNumber}</Td>
                  <Td>{i.message}</Td>
                  <Td><Badge tone={i.level === "error" ? "danger" : "warning"}>{i.level}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {quality.issuesTruncated && <p className="text-[11.5px] text-stone mt-2">Showing the first 300 issues found.</p>}
      </SectionCard>

      <SectionCard title="Line Item Linking">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Line Items" value={databaseImpact.totalLineItems} />
          <StatCard label="Matched Product Items" value={databaseImpact.matchedProductItems} />
          <StatCard label="Missing Variation Items" value={databaseImpact.missingVariationItems} />
          <StatCard label="Missing Product Items" value={databaseImpact.missingProductItems} />
          <StatCard label="Coupon Codes Used" value={databaseImpact.couponCodesUsed} />
          <StatCard label="Coupon Codes Matched" value={databaseImpact.couponCodesMatched} />
        </div>
      </SectionCard>

      {unsupportedMetaKeys.length > 0 && (
        <SectionCard title="Unsupported Meta Keys" description="Order meta keys found in the file that aren't mapped to any field — nothing is silently lost, just not imported.">
          <Table>
            <thead><tr><Th>Meta Key</Th><Th>Orders</Th></tr></thead>
            <tbody>
              {unsupportedMetaKeys.map((m) => (
                <tr key={m.key}><Td className="font-mono text-[11.5px]">{m.key}</Td><Td className="font-mono">{m.orderCount}</Td></tr>
              ))}
            </tbody>
          </Table>
        </SectionCard>
      )}
    </div>
  );
}
