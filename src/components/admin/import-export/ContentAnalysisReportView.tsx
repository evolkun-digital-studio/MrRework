"use client";
import { Card, StatCard, Table, Th, Td, Badge } from "@/components/admin/ui";
import type { ContentAnalysisReportClient } from "./types";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
const SCORE_TONE = (label: string): Tone => (label === "Ready to Import" ? "success" : label === "Needs Review" ? "warning" : "danger");

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <Card title={title} description={description}>{children}</Card>;
}

// The Blog Posts / Pages counterpart of CustomerAnalysisReportView.tsx —
// renders wooContentSqlAnalyzer.ts's own ContentAnalysisReport shape (SEO
// coverage, redirects, taxonomy) rather than forcing it through the
// Products-specific AnalysisReportView. One component for both job types
// (`postType` distinguishes them) since they share the exact same analyzer
// shape — the same "don't duplicate logic" reasoning wooContentMapping.ts
// already established for the pair.
export default function ContentAnalysisReportView({ report }: { report: ContentAnalysisReportClient }) {
  const { general, quality, databaseImpact, summary, postType } = report;
  const label = postType === "post" ? "Blog Posts" : "Pages";

  return (
    <div className="space-y-5">
      <SectionCard title="Migration Readiness" description={report.fileName}>
        <div className="flex items-center gap-4 mb-4">
          <Badge tone={SCORE_TONE(summary.label)}>{summary.label}</Badge>
          <span className="text-[13px] text-stone">Score: {summary.score}/100</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={`Total ${label}`} value={general.totalItems} />
          <StatCard label="With Featured Image" value={general.withFeaturedImage} />
          <StatCard label="With Categories" value={general.withCategories} />
          <StatCard label="With Tags" value={general.withTags} />
          <StatCard label="With OpenGraph" value={general.withOpenGraph} />
          <StatCard label="With Twitter Card" value={general.withTwitterCard} />
          <StatCard label="With Schema" value={general.withSchema} />
          <StatCard label="With Focus Keyword" value={general.withFocusKeyword} />
        </div>
      </SectionCard>

      {databaseImpact.protectedItemsMatched > 0 && (
        <SectionCard title="Protected Items">
          <p className="text-[13px] text-stone">
            {databaseImpact.protectedItemsMatched} matched item(s) already have a manually-overridden publish status.
            Only content/SEO/media/redirects stay eligible for correction — status is never touched on an existing item. See ADMIN_CMS.md § Content Migration Security.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Status &amp; Visibility">
        <Table>
          <thead><tr><Th>WordPress Status</Th><Th>App Status</Th><Th>Count</Th></tr></thead>
          <tbody>
            {general.statusBreakdown.map((s, i) => (
              <tr key={i}>
                <Td className="font-mono text-[11.5px]">{s.wooStatus}</Td>
                <Td className="capitalize">{s.status}</Td>
                <Td className="font-mono">{s.count}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      <SectionCard title="SEO Source Breakdown">
        <Table>
          <thead><tr><Th>Plugin</Th><Th>Count</Th></tr></thead>
          <tbody>
            {general.seoSourceBreakdown.map((s) => (
              <tr key={s.source}><Td className="capitalize">{s.source}</Td><Td className="font-mono">{s.count}</Td></tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      <SectionCard title="Data Quality">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard label="Missing Featured Images" value={quality.missingFeaturedImages} />
          <StatCard label="Broken Media References" value={quality.brokenMediaReferences} />
          <StatCard label="Duplicate Slugs" value={quality.duplicateSlugsInFile} />
          <StatCard label="Duplicate Redirect URLs" value={quality.duplicateRedirectUrls} />
          <StatCard label="Unsupported SEO Fields" value={quality.unsupportedSeoFields} />
          <StatCard label="Unsupported Page Builders" value={quality.unsupportedPageBuilders} />
          <StatCard label="Shortcode Usage" value={quality.shortcodeUsage} />
          <StatCard label="Gutenberg Blocks" value={quality.gutenbergBlocks} />
          <StatCard label="Broken Internal Links" value={quality.brokenInternalLinks} />
          <StatCard label="Missing Metadata" value={quality.missingMetadata} />
          <StatCard label="Broken Taxonomy" value={quality.brokenTaxonomy} />
          <StatCard label="Unrecognized Status" value={quality.unrecognizedStatus} />
        </div>
        {quality.issues.length > 0 && (
          <Table>
            <thead><tr><Th>Row</Th><Th>Source ID</Th><Th>Issue</Th><Th>Level</Th></tr></thead>
            <tbody>
              {quality.issues.slice(0, 50).map((i, idx) => (
                <tr key={idx}>
                  <Td className="font-mono">{i.row}</Td>
                  <Td className="max-w-[160px] truncate">{i.sourceId}</Td>
                  <Td>{i.message}</Td>
                  <Td><Badge tone={i.level === "error" ? "danger" : "warning"}>{i.level}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {quality.issuesTruncated && <p className="text-[11.5px] text-stone mt-2">Showing the first 300 issues found.</p>}
      </SectionCard>

      <SectionCard title="Redirects &amp; Linking">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Matched Authors" value={databaseImpact.matchedAuthors} />
          <StatCard label="Missing Authors" value={databaseImpact.missingAuthors} />
          <StatCard label="Matched Featured Images" value={databaseImpact.matchedFeaturedImages} />
          <StatCard label="Redirects to Generate" value={databaseImpact.redirectsToGenerate} />
        </div>
        {databaseImpact.redirectsByType.length > 0 && (
          <Table>
            <thead><tr><Th>Type</Th><Th>Count</Th></tr></thead>
            <tbody>
              {databaseImpact.redirectsByType.map((r) => (
                <tr key={r.type}><Td className="capitalize">{r.type}</Td><Td className="font-mono">{r.count}</Td></tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
