"use client";
import { Card, StatCard, Table, Th, Td, Badge } from "@/components/admin/ui";
import type { CustomerAnalysisReportClient } from "./types";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
const SCORE_TONE = (label: string): Tone => (label === "Ready to Import" ? "success" : label === "Needs Review" ? "warning" : "danger");

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <Card title={title} description={description}>{children}</Card>;
}

export default function CustomerAnalysisReportView({ report }: { report: CustomerAnalysisReportClient }) {
  const { general, quality, metaKeyCoverage, databaseImpact, summary } = report;

  return (
    <div className="space-y-5">
      <SectionCard title="Migration Readiness" description={report.fileName}>
        <div className="flex items-center gap-4 mb-4">
          <Badge tone={SCORE_TONE(summary.label)}>{summary.label}</Badge>
          <span className="text-[13px] text-stone">Score: {summary.score}/100</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Customers" value={general.totalCustomers} />
          <StatCard label="With Email" value={general.withEmail} />
          <StatCard label="Without Email" value={general.withoutEmail} />
          <StatCard label="Newsletter Subscribers" value={general.subscribedToNewsletter} />
          <StatCard label="With Billing Address" value={general.withBillingAddress} />
          <StatCard label="With Shipping Address" value={general.withShippingAddress} />
          <StatCard label="To Create" value={databaseImpact.customersToCreate} />
          <StatCard label="To Update" value={databaseImpact.customersToUpdate} />
        </div>
      </SectionCard>

      {databaseImpact.protectedAccountsMatched > 0 && (
        <SectionCard title="Protected Accounts">
          <p className="text-[13px] text-stone">
            {databaseImpact.protectedAccountsMatched} matched account(s) already have a role other than customer or a working password.
            Only profile/address fields will be updated for these — role, status, and password state are never touched on an existing account. See ADMIN_CMS.md § Customer Migration Security.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Role Distribution" description="Original WordPress role — every imported account still becomes an app customer regardless.">
        <Table>
          <thead><tr><Th>WordPress Role</Th><Th>Count</Th></tr></thead>
          <tbody>
            {general.roleDistribution.map((r) => (
              <tr key={r.role}><Td className="capitalize">{r.role}</Td><Td className="font-mono">{r.count}</Td></tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      <SectionCard title="Data Quality">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <StatCard label="Missing Email" value={quality.missingEmail} />
          <StatCard label="Invalid Email" value={quality.invalidEmail} />
          <StatCard label="Duplicate Emails" value={quality.duplicateEmailsInFile} />
          <StatCard label="Missing Name" value={quality.missingName} />
          <StatCard label="Bad Registration Date" value={quality.unparseableRegisteredDate} />
        </div>
        {quality.issues.length > 0 && (
          <Table>
            <thead><tr><Th>Row</Th><Th>Email</Th><Th>Issue</Th><Th>Level</Th></tr></thead>
            <tbody>
              {quality.issues.slice(0, 50).map((i, idx) => (
                <tr key={idx}>
                  <Td className="font-mono">{i.row}</Td>
                  <Td className="max-w-[220px] truncate">{i.email}</Td>
                  <Td>{i.message}</Td>
                  <Td><Badge tone={i.level === "error" ? "danger" : "warning"}>{i.level}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {quality.issuesTruncated && <p className="text-[11.5px] text-stone mt-2">Showing the first 300 issues found.</p>}
      </SectionCard>

      <SectionCard title="Meta Key Coverage" description="Every wp_usermeta key found in the file — imported or not, nothing is silently invisible.">
        <Table>
          <thead><tr><Th>Meta Key</Th><Th>Customers</Th><Th>Imported</Th></tr></thead>
          <tbody>
            {metaKeyCoverage.map((m) => (
              <tr key={m.key}>
                <Td className="font-mono text-[11.5px]">{m.key}</Td>
                <Td className="font-mono">{m.userCount}</Td>
                <Td><Badge tone={m.imported ? "success" : "neutral"}>{m.imported ? "Yes" : "No"}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>
    </div>
  );
}
