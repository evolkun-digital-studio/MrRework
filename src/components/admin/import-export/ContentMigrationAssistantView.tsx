"use client";
import { useMemo, useState } from "react";
import { Card, StatCard, Table, Th, Td, Badge, Input } from "@/components/admin/ui";
import ContentPreviewCard from "./ContentPreviewCard";
import type { ContentMigrationAssistantReportClient, UnifiedContentPreviewResultClient } from "./types";

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

export default function ContentMigrationAssistantView({
  report, preview,
}: {
  report: ContentMigrationAssistantReportClient;
  preview: UnifiedContentPreviewResultClient;
}) {
  const { blog, pages, risk, recommendations, seoCoverage, redirectSummary, mediaSummary, contentSummary, plan, verificationPreview, estimate, summary } = report;
  const [tab, setTab] = useState<"post" | "page">("post");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const activePreview = tab === "post" ? preview.blog : preview.pages;
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q ? activePreview.rows.filter((r) => r.after.title.toLowerCase().includes(q) || r.after.slug.toLowerCase().includes(q)) : activePreview.rows;
    return showAll ? rows : rows.slice(0, 20);
  }, [activePreview.rows, search, showAll]);

  const combinedTimeline = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of [...blog.general.timeline, ...pages.general.timeline]) map.set(t.period, (map.get(t.period) ?? 0) + t.count);
    return [...map.entries()].map(([period, count]) => ({ period, count })).sort((a, b) => a.period.localeCompare(b.period));
  }, [blog.general.timeline, pages.general.timeline]);

  const combinedWarnings = useMemo(() => {
    const w: { label: string; count: number }[] = [
      { label: "Missing featured images", count: blog.quality.missingFeaturedImages + pages.quality.missingFeaturedImages },
      { label: "Broken media references", count: blog.quality.brokenMediaReferences + pages.quality.brokenMediaReferences },
      { label: "Duplicate slugs", count: blog.quality.duplicateSlugsInFile + pages.quality.duplicateSlugsInFile },
      { label: "Duplicate redirect URLs", count: blog.quality.duplicateRedirectUrls + pages.quality.duplicateRedirectUrls },
      { label: "Unsupported SEO fields", count: blog.quality.unsupportedSeoFields + pages.quality.unsupportedSeoFields },
      { label: "Unsupported page builders (Elementor)", count: blog.quality.unsupportedPageBuilders + pages.quality.unsupportedPageBuilders },
      { label: "Shortcode usage", count: blog.quality.shortcodeUsage + pages.quality.shortcodeUsage },
      { label: "Broken internal links", count: blog.quality.brokenInternalLinks + pages.quality.brokenInternalLinks },
      { label: "Missing SEO metadata", count: blog.quality.missingMetadata + pages.quality.missingMetadata },
      { label: "Broken taxonomy references", count: blog.quality.brokenTaxonomy + pages.quality.brokenTaxonomy },
      { label: "Unrecognized status", count: blog.quality.unrecognizedStatus + pages.quality.unrecognizedStatus },
    ];
    return w.filter((x) => x.count > 0);
  }, [blog, pages]);

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
      <SectionCard title="Overview" description={report.fileName}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Blog Posts" value={contentSummary.totalBlogPosts} />
          <StatCard label="Pages" value={contentSummary.totalPages} />
          <StatCard label="Published Posts" value={contentSummary.publishedBlogPosts} />
          <StatCard label="Published Pages" value={contentSummary.publishedPages} />
          <StatCard label="With Categories" value={contentSummary.withCategories} />
          <StatCard label="With Tags" value={contentSummary.withTags} />
          <StatCard label="Redirects to Generate" value={redirectSummary.totalRedirects} />
          <StatCard label="Featured Images" value={mediaSummary.totalFeaturedImages} />
        </div>
      </SectionCard>

      {/* Content Summary */}
      <SectionCard title="Content Summary" description="Status breakdown across both Blog Posts and Pages.">
        <Table>
          <thead><tr><Th>Type</Th><Th>WordPress Status</Th><Th>Mapped Status</Th><Th>Count</Th></tr></thead>
          <tbody>
            {blog.general.statusBreakdown.map((s) => (
              <tr key={`blog-${s.wooStatus}`}><Td>Blog Post</Td><Td className="font-mono">{s.wooStatus || "(none)"}</Td><Td>{s.status}</Td><Td className="font-mono">{s.count}</Td></tr>
            ))}
            {pages.general.statusBreakdown.map((s) => (
              <tr key={`page-${s.wooStatus}`}><Td>Page</Td><Td className="font-mono">{s.wooStatus || "(none)"}</Td><Td>{s.status}</Td><Td className="font-mono">{s.count}</Td></tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      {/* SEO Coverage */}
      <SectionCard title="SEO Coverage" description="Detected across Yoast SEO, RankMath, and AIOSEO (legacy) — the first plugin found with data wins per item.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="With SEO Title/Description" value={seoCoverage.withSeoTitle} sub={`of ${seoCoverage.totalItems}`} />
          <StatCard label="With OpenGraph" value={seoCoverage.withOpenGraph} />
          <StatCard label="With Twitter Card" value={seoCoverage.withTwitterCard} />
          <StatCard label="With Schema Data" value={seoCoverage.withSchema} />
          <StatCard label="With Focus Keyword" value={seoCoverage.withFocusKeyword} />
        </div>
        {seoCoverage.bySource.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {seoCoverage.bySource.map((s) => <Badge key={s.source} tone={s.source === "none" ? "neutral" : "info"}>{s.source}: {s.count}</Badge>)}
          </div>
        )}
      </SectionCard>

      {/* Redirect Summary */}
      <SectionCard title="Redirect Summary" description="Generated for ?p=ID links, the derived old permalink, and every historical slug (_wp_old_slug) — for future 301 redirects.">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Total Redirects" value={redirectSummary.totalRedirects} />
          <StatCard label="Duplicate URLs (deduplicated)" value={redirectSummary.duplicates} />
          {redirectSummary.byType.map((t) => <StatCard key={t.type} label={`Type: ${t.type}`} value={t.count} />)}
        </div>
      </SectionCard>

      {/* Media Summary */}
      <SectionCard title="Media Summary" description="Featured images reconnected to the existing Media collection — never duplicated, never re-downloaded here.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Featured Images" value={mediaSummary.totalFeaturedImages} />
          <StatCard label="Matched (local copy)" value={mediaSummary.matched} />
          <StatCard label="Broken (no local copy)" value={mediaSummary.broken} />
          <StatCard label="Missing entirely" value={mediaSummary.missing} />
        </div>
      </SectionCard>

      {/* Migration Timeline */}
      <SectionCard title="Migration Timeline" description="Blog posts and pages by month, from each item's created date.">
        {combinedTimeline.length === 0 ? (
          <p className="text-[13px] text-stone">No parseable dates found in this file.</p>
        ) : (
          <Table>
            <thead><tr><Th>Period</Th><Th>Items</Th></tr></thead>
            <tbody>{combinedTimeline.map((t) => <tr key={t.period}><Td className="font-mono">{t.period}</Td><Td className="font-mono">{t.count}</Td></tr>)}</tbody>
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

      {/* Warnings */}
      <SectionCard title="Warnings" description="Aggregated data-quality issues across both files.">
        {combinedWarnings.length === 0 ? (
          <p className="text-[13px] text-stone">No warnings — this file looks clean.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {combinedWarnings.map((w) => <Badge key={w.label} tone="warning">{w.label}: {w.count}</Badge>)}
          </div>
        )}
      </SectionCard>

      {/* Migration Plan */}
      <SectionCard title="Migration Plan" description="A phased, step-by-step timeline — this Assistant is read-only; phases 2 and 3 are run via the separate Blog Posts / Pages importers.">
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
      <SectionCard title="Verification Preview" description="Expected outcome of running both real importers, assuming the default update duplicate strategy.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Imported" value={verificationPreview.imported} />
          <StatCard label="Updated" value={verificationPreview.updated} />
          <StatCard label="Skipped" value={verificationPreview.skipped} sub='0 unless "skip" strategy is chosen' />
          <StatCard label="Failed" value={verificationPreview.failed} sub="Missing title/slug or unparseable rows" />
        </div>
      </SectionCard>

      {/* Content Preview */}
      <SectionCard title="Content Preview" description="Before → after for every blog post and page in this file — no database write.">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex border border-line dark:border-[#332e26] rounded-brand overflow-hidden">
            <button type="button" onClick={() => { setTab("post"); setShowAll(false); }} className={`px-3 py-1.5 text-[12px] ${tab === "post" ? "bg-ink text-paper dark:bg-[#f3efe8] dark:text-[#15130f]" : ""}`}>Blog Posts ({preview.blog.rows.length})</button>
            <button type="button" onClick={() => { setTab("page"); setShowAll(false); }} className={`px-3 py-1.5 text-[12px] ${tab === "page" ? "bg-ink text-paper dark:bg-[#f3efe8] dark:text-[#15130f]" : ""}`}>Pages ({preview.pages.rows.length})</button>
          </div>
          <Input placeholder="Search by title or slug…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <span className="text-[11.5px] text-stone">{filteredRows.length} of {activePreview.rows.length} shown{activePreview.truncated ? ` (file has ${activePreview.totalRows} total — preview capped at ${activePreview.rows.length})` : ""}</span>
        </div>
        <div className="space-y-3">
          {filteredRows.map((row) => <ContentPreviewCard key={row.row} row={row} kind={tab} />)}
        </div>
        {!showAll && activePreview.rows.length > 20 && !search && (
          <button type="button" onClick={() => setShowAll(true)} className="mt-4 text-[12px] uppercase tracking-wide underline">
            Show all {activePreview.rows.length} {tab === "post" ? "blog posts" : "pages"}
          </button>
        )}
      </SectionCard>

      {/* Summary */}
      <SectionCard title="Summary">
        <div className="flex items-center gap-3 mb-4">
          <Badge tone={SCORE_TONE(summary.label)}>{summary.label}</Badge>
          <span className="text-[13px] text-stone">Readiness score: {summary.score}/100</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Estimated Duration" value={fmtMs(estimate.durationMs)} sub="Estimate — not a measurement" />
          <StatCard label="Estimated Peak Memory" value={fmtBytes(estimate.peakMemoryBytes)} sub="Estimate — not a measurement" />
          <StatCard label="Estimated Writes" value={estimate.writes} sub="One document write per item" />
        </div>
      </SectionCard>
    </div>
  );
}
