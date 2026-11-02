"use client";
import { Card, StatCard, Table, Th, Td, Badge, Banner, Button } from "@/components/admin/ui";
import { FileJson, FileText, Printer } from "lucide-react";
import { downloadBlob, reportToCsv, reportToJson, reportToPrintableHtml } from "@/lib/import-export/products/reportExport";
import type { AnalysisReportClient } from "./types";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
const SCORE_TONE = (label: string): Tone => (label === "Ready to Import" ? "success" : label === "Needs Review" ? "warning" : "danger");
const RISK_TONE: Record<"critical" | "warning" | "info", Tone> = { critical: "danger", warning: "warning", info: "info" };

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <Card title={title} description={description}>{children}</Card>;
}

export default function AnalysisReportView({ report }: { report: AnalysisReportClient }) {
  const { general, quality, categories, attributes, variations, images, seo, columns, unsupported, databaseImpact, risks, summary } = report;

  function exportCsv() { downloadBlob(reportToCsv(report), `migration-analysis-${Date.now()}.csv`, "text/csv;charset=utf-8"); }
  function exportJson() { downloadBlob(reportToJson(report), `migration-analysis-${Date.now()}.json`, "application/json"); }
  function exportPdf() {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(reportToPrintableHtml(report));
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-stone">Migration Readiness</div>
            <div className="font-display text-4xl mt-1">{summary.score}%</div>
            <div className="mt-2"><Badge tone={SCORE_TONE(summary.label)}>{summary.label}</Badge></div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={exportPdf}><Printer size={13} /> PDF</Button>
            <Button variant="ghost" size="sm" onClick={exportCsv}><FileText size={13} /> CSV</Button>
            <Button variant="ghost" size="sm" onClick={exportJson}><FileJson size={13} /> JSON</Button>
          </div>
        </div>
      </Card>

      {/* Risk Report */}
      {risks.length > 0 && (
        <SectionCard title="Risk Report">
          <div className="space-y-2">
            {risks.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="flex items-center gap-2"><Badge tone={RISK_TONE[r.severity]}>{r.severity}</Badge> {r.message}</span>
                <span className="font-mono text-stone">{r.count}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* General Information */}
      <SectionCard title="General Information">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Total Products" value={general.totalProducts} />
          <StatCard label="Simple" value={general.simpleProducts} />
          <StatCard label="Variable" value={general.variableProducts} />
          <StatCard label="Draft" value={general.draftProducts} />
          <StatCard label="Published" value={general.publishedProducts} />
          <StatCard label="Private" value={general.privateProducts} />
          <StatCard label="Featured" value={general.featuredProducts} />
          <StatCard label="Virtual" value={general.virtualProducts} sub="Unsupported" />
          <StatCard label="Downloadable" value={general.downloadableProducts} sub="Unsupported" />
        </div>
      </SectionCard>

      {/* Product Quality */}
      <SectionCard title="Product Quality" description={quality.issuesTruncated ? "Showing the first 300 issues." : undefined}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
          <StatCard label="Missing Name" value={quality.missingName} />
          <StatCard label="Missing SKU" value={quality.missingSku} />
          <StatCard label="Duplicate SKU" value={quality.duplicateSku} />
          <StatCard label="Duplicate Slug" value={quality.duplicateSlug} />
          <StatCard label="Missing Price" value={quality.missingPrice} />
          <StatCard label="Invalid Price" value={quality.invalidPrice} />
          <StatCard label="Missing Categories" value={quality.missingCategories} />
          <StatCard label="Without Images" value={quality.withoutImages} />
          <StatCard label="Missing Stock" value={quality.missingStock} />
          <StatCard label="Missing Attributes" value={quality.missingAttributes} />
          <StatCard label="Missing Variations" value={quality.missingVariations} />
          <StatCard label="Empty Descriptions" value={quality.emptyDescriptions} />
          <StatCard label="Invalid Status" value={quality.invalidStatus} />
        </div>
        {quality.issues.length > 0 && (
          <Table>
            <thead><tr><Th>Row</Th><Th>SKU</Th><Th>Issue</Th><Th>Level</Th></tr></thead>
            <tbody>
              {quality.issues.slice(0, 100).map((issue, i) => (
                <tr key={i}>
                  <Td className="font-mono">{issue.row}</Td>
                  <Td>{issue.sku}</Td>
                  <Td>{issue.message}</Td>
                  <Td><Badge tone={issue.level === "error" ? "danger" : "warning"}>{issue.level}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {quality.issues.length > 100 && <p className="text-[11.5px] text-stone mt-2">And {quality.issues.length - 100} more.</p>}
      </SectionCard>

      {/* Category Analysis */}
      <SectionCard title="Category Analysis">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <StatCard label="Found" value={categories.found} />
          <StatCard label="Existing" value={categories.existing} />
          <StatCard label="New to Create" value={categories.toCreate} />
          <StatCard label="Nested" value={categories.nested} />
          <StatCard label="Duplicate Groups" value={categories.duplicateGroups.length} />
        </div>
        {categories.duplicateGroups.length > 0 && (
          <Banner tone="error">
            Possible duplicate categories (same name, different casing/spacing): {categories.duplicateGroups.map((g) => g.join(" / ")).join(", ")}
          </Banner>
        )}
        {categories.list.length > 0 && (
          <Table>
            <thead><tr><Th>Category</Th><Th>Products</Th><Th>Exists in DB</Th><Th>Nested</Th></tr></thead>
            <tbody>
              {categories.list.slice(0, 100).map((c, i) => (
                <tr key={i}>
                  <Td>{c.name}</Td>
                  <Td className="font-mono">{c.count}</Td>
                  <Td><Badge tone={c.existsInDb ? "success" : "neutral"}>{c.existsInDb ? "Reused" : "New"}</Badge></Td>
                  <Td>{c.nested ? "Yes" : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>

      {/* Attribute Analysis */}
      <SectionCard title="Attribute Analysis" description="Every distinct attribute name detected in the file.">
        {attributes.length === 0 ? (
          <p className="text-[13px] text-stone">No attribute columns detected.</p>
        ) : (
          <Table>
            <thead><tr><Th>Attribute</Th><Th>Values</Th><Th>Sample</Th><Th>Supported</Th><Th>Mapping Exists</Th></tr></thead>
            <tbody>
              {attributes.map((a, i) => (
                <tr key={i}>
                  <Td>{a.name}</Td>
                  <Td className="font-mono">{a.valueCount}</Td>
                  <Td className="max-w-[240px] truncate text-stone">{a.sampleValues.join(", ")}</Td>
                  <Td><Badge tone={a.supported ? "success" : "neutral"}>{a.supported ? "Yes" : "No"}</Badge></Td>
                  <Td><Badge tone={a.mappingExists ? "success" : "neutral"}>{a.mappingExists ? "Yes" : "No"}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>

      {/* Variation Analysis */}
      <SectionCard title="Variation Analysis">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Variable Products" value={variations.variableProducts} />
          <StatCard label="Variation Rows" value={variations.variationRows} />
          <StatCard label="Missing Parent Column" value={variations.productsMissingParentColumn} />
          <StatCard label="Orphan Variations" value={variations.orphanVariations} />
          <StatCard label="Invalid Combinations" value={variations.invalidAttributeCombinations} />
          <StatCard label="Duplicate Variations" value={variations.duplicateVariations} />
        </div>
      </SectionCard>

      {/* Image Analysis */}
      <SectionCard title="Image Analysis">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Featured Images" value={images.featuredImageCount} />
          <StatCard label="Gallery Images" value={images.galleryImageCount} />
          <StatCard label="Total References" value={images.totalImageReferences} />
          <StatCard label="Distinct URLs" value={images.distinctImageUrls} />
          <StatCard label="Broken URLs" value={images.brokenUrlCount} />
          <StatCard label="Duplicate URLs" value={images.duplicateUrlCount} />
        </div>
        <Banner tone="neutral">Missing ALT tags: not applicable — the Product schema has no image-ALT field, so ALT text is never imported regardless of the source file.</Banner>
      </SectionCard>

      {/* SEO Analysis */}
      <SectionCard title="SEO Analysis">
        <Table>
          <thead><tr><Th>Field</Th><Th>Detected</Th><Th>Column(s)</Th><Th>Rows Populated</Th></tr></thead>
          <tbody>
            {([
              ["Meta Title", seo.metaTitle], ["Meta Description", seo.metaDescription], ["Focus Keyword", seo.focusKeyword],
              ["Canonical URL", seo.canonicalUrl], ["OpenGraph", seo.openGraph], ["Schema", seo.schema],
            ] as const).map(([label, status]) => (
              <tr key={label}>
                <Td>{label}</Td>
                <Td><Badge tone={status.detected ? "success" : "neutral"}>{status.detected ? "Detected" : "Not present"}</Badge></Td>
                <Td className="text-stone">{status.columns.join(", ") || "—"}</Td>
                <Td className="font-mono">{status.rowsPopulated}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      {/* WordPress / WooCommerce Fields */}
      <SectionCard title="WordPress / WooCommerce Fields" description="Every column detected in the CSV.">
        <Table>
          <thead><tr><Th>Column</Th><Th>Detected Type</Th><Th>Mapped Field</Th><Th>Classification</Th></tr></thead>
          <tbody>
            {columns.map((c, i) => (
              <tr key={i}>
                <Td>{c.name}</Td>
                <Td className="text-stone">{c.detectedType}</Td>
                <Td className="font-mono text-stone">{c.mappedField ?? "—"}</Td>
                <Td>
                  <Badge tone={c.classification === "supported" ? "success" : c.classification === "ignored" ? "neutral" : "warning"}>
                    {c.classification === "supported" ? "Supported" : c.classification === "ignored" ? "Ignored" : "Needs Manual Mapping"}
                  </Badge>
                  {c.note && <div className="text-[11px] text-stone mt-0.5">{c.note}</div>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      {/* Unsupported Data */}
      <SectionCard title="Unsupported Fields" description="Present in this file, but will NOT be imported.">
        {unsupported.length === 0 ? (
          <p className="text-[13px] text-stone">No unsupported WooCommerce-specific fields detected in this file.</p>
        ) : (
          <Table>
            <thead><tr><Th>Field</Th><Th>Why it's not imported</Th></tr></thead>
            <tbody>
              {unsupported.map((u, i) => <tr key={i}><Td>{u.field}</Td><Td className="text-stone">{u.reason}</Td></tr>)}
            </tbody>
          </Table>
        )}
      </SectionCard>

      {/* Database Impact */}
      <SectionCard title="Database Impact" description="Estimates — the real run may differ slightly for duplicate SKUs spanning multiple rows.">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard label="Products to Create" value={databaseImpact.productsToCreate} />
          <StatCard label="Products to Update" value={databaseImpact.productsToUpdate} />
          <StatCard label="Products to Skip" value={databaseImpact.productsToSkip} />
          <StatCard label="Categories to Create" value={databaseImpact.categoriesToCreate} />
          <StatCard label="Collections to Create" value={databaseImpact.collectionsToCreate} sub="Not populated by this importer" />
          <StatCard label="Images Referenced" value={databaseImpact.imagesReferenced} />
          <StatCard label="Est. Import Time" value={`~${Math.max(1, Math.round(databaseImpact.estimatedImportTimeMs / 1000))}s`} />
        </div>
      </SectionCard>
    </div>
  );
}
