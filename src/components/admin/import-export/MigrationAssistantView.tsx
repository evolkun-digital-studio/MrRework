"use client";
import { Card, StatCard, Table, Th, Td, Badge, Banner, Button } from "@/components/admin/ui";
import { FileJson, FileText, Printer } from "lucide-react";
import { downloadBlob, migrationReportToCsv, migrationReportToJson, migrationReportToPrintableHtml } from "@/lib/import-export/products/migrationReportExport";
import ProductPreviewCard from "./ProductPreviewCard";
import type { MigrationAssistantReportClient } from "./types";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
const RISK_TONE: Record<string, Tone> = { "Low Risk": "success", "Medium Risk": "warning", "High Risk": "danger" };
const PLUGIN_TONE: Record<string, Tone> = { "fully-supported": "success", "partially-supported": "warning", "not-supported": "danger" };
const PRIORITY_TONE: Record<string, Tone> = { high: "danger", medium: "warning", low: "neutral" };
const CONFIDENCE_TONE: Record<string, Tone> = { high: "success", medium: "warning", low: "neutral" };

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <Card title={title} description={description}>{children}</Card>;
}

export default function MigrationAssistantView({ report, jobId }: { report: MigrationAssistantReportClient; jobId: string }) {
  const { storeProfile, plugins, fieldMapping, dataQuality, seo, attributes, migrationPlan, risk, recommendations } = report;

  function exportCsv() { downloadBlob(migrationReportToCsv(report), `migration-plan-${Date.now()}.csv`, "text/csv;charset=utf-8"); }
  function exportJson() { downloadBlob(migrationReportToJson(report), `migration-plan-${Date.now()}.json`, "application/json"); }
  function exportPdf() {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(migrationReportToPrintableHtml(report));
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="space-y-5">
      {/* Risk + Export */}
      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-stone">Migration Risk</div>
            <div className="mt-1.5"><Badge tone={RISK_TONE[risk.level] ?? "neutral"}>{risk.level}</Badge> <span className="text-stone text-[12.5px] ml-2">score {risk.score}%</span></div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={exportPdf}><Printer size={13} /> PDF</Button>
            <Button variant="ghost" size="sm" onClick={exportCsv}><FileText size={13} /> CSV</Button>
            <Button variant="ghost" size="sm" onClick={exportJson}><FileJson size={13} /> JSON</Button>
          </div>
        </div>
        <ul className="mt-3 space-y-1 text-[12.5px] text-stone list-disc list-inside">
          {risk.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
        </ul>
      </Card>

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

      {/* Migration Plan */}
      <SectionCard title="Migration Plan" description="A phased plan derived from this file's actual contents.">
        <div className="space-y-3">
          {migrationPlan.map((p) => (
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

      {/* Store Profile */}
      <SectionCard title="Store Profile">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
          <StatCard label="Total Products" value={storeProfile.totalProducts} />
          <StatCard label="Simple Products" value={storeProfile.simpleProducts} />
          <StatCard label="Variable Products" value={storeProfile.variableProducts} />
          <StatCard label="Categories" value={storeProfile.categories} />
          <StatCard label="Tags" value={storeProfile.tags} />
          <StatCard label="Brands" value={storeProfile.brands} />
          <StatCard label="Attributes" value={storeProfile.attributes} />
          <StatCard label="Images" value={storeProfile.images} />
          <StatCard label="Avg. Variants / Product" value={storeProfile.averageVariantsPerProduct} />
          <StatCard label="Draft Products" value={storeProfile.draftProducts} />
          <StatCard label="Published Products" value={storeProfile.publishedProducts} />
          <StatCard label="Without Images" value={storeProfile.productsWithoutImages} />
          <StatCard label="Without Categories" value={storeProfile.productsWithoutCategories} />
          <StatCard label="Without SKU" value={storeProfile.productsWithoutSku} />
          <StatCard label="Without Stock" value={storeProfile.productsWithoutStock} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Banner tone="neutral">WooCommerce Version: {storeProfile.wooCommerceVersion.value ?? "Not detected"} — {storeProfile.wooCommerceVersion.note}</Banner>
          <Banner tone="neutral">Export Date: {new Date(storeProfile.exportDate.value).toLocaleString()} — {storeProfile.exportDate.note}</Banner>
        </div>
      </SectionCard>

      {/* Plugin Detection */}
      <SectionCard title="Plugin Detection" description="Detected from column names in the export.">
        {plugins.length === 0 ? (
          <p className="text-[13px] text-stone">No known plugin signatures detected in this file.</p>
        ) : (
          <Table>
            <thead><tr><Th>Plugin</Th><Th>Status</Th><Th>Matched Columns</Th><Th>Explanation</Th></tr></thead>
            <tbody>
              {plugins.map((p, i) => (
                <tr key={i}>
                  <Td>{p.name}</Td>
                  <Td><Badge tone={PLUGIN_TONE[p.status]}>{p.status.replace("-", " ")}</Badge></Td>
                  <Td className="max-w-[220px] truncate text-stone">{p.matchedColumns.join(", ")}</Td>
                  <Td className="max-w-[320px] text-stone">{p.explanation}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>

      {/* Field Mapping Report */}
      <SectionCard title="Field Mapping Report">
        <Table>
          <thead><tr><Th>CSV Column</Th><Th>Mapped Field</Th><Th>Import Status</Th><Th>Confidence</Th></tr></thead>
          <tbody>
            {fieldMapping.map((f, i) => (
              <tr key={i}>
                <Td>{f.column}</Td>
                <Td className="font-mono text-stone">{f.mappedField ?? "—"}</Td>
                <Td>
                  <Badge tone={f.importStatus === "supported" ? "success" : f.importStatus === "ignored" ? "neutral" : "warning"}>
                    {f.importStatus === "supported" ? "Supported" : f.importStatus === "ignored" ? "Ignored" : "Requires Manual Mapping"}
                  </Badge>
                </Td>
                <Td><Badge tone={CONFIDENCE_TONE[f.confidence]}>{f.confidence}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      {/* Data Quality Report */}
      <SectionCard title="Data Quality Report">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard label="Duplicate SKUs" value={dataQuality.duplicateSkus} />
          <StatCard label="Duplicate Slugs" value={dataQuality.duplicateSlugs} />
          <StatCard label="Duplicate Categories" value={dataQuality.duplicateCategories} />
          <StatCard label="Broken Image URLs" value={dataQuality.brokenImageUrls} />
          <StatCard label="Missing Images" value={dataQuality.missingImages} />
          <StatCard label="Missing ALT Tags" value={dataQuality.missingAltTags} />
          <StatCard label="Missing Price" value={dataQuality.missingPrice} />
          <StatCard label="Invalid Prices" value={dataQuality.invalidPrices} />
          <StatCard label="Negative Stock" value={dataQuality.negativeStock} />
          <StatCard label="Missing Categories" value={dataQuality.missingCategories} />
          <StatCard label="Missing Attributes" value={dataQuality.missingAttributes} />
          <StatCard label="Orphan Variations" value={dataQuality.orphanVariations} />
          <StatCard label="Unknown Product Types" value={dataQuality.unknownProductTypes} />
          <StatCard label="Unknown Status Values" value={dataQuality.unknownStatusValues} />
        </div>
      </SectionCard>

      {/* SEO Report */}
      <SectionCard title="SEO Report">
        <Table>
          <thead><tr><Th>Field</Th><Th>Detected</Th><Th>Rows Populated</Th><Th>Will Be Imported?</Th></tr></thead>
          <tbody>
            {seo.map((s, i) => (
              <tr key={i}>
                <Td>{s.label}</Td>
                <Td><Badge tone={s.detected ? "success" : "neutral"}>{s.detected ? "Detected" : "Not present"}</Badge></Td>
                <Td className="font-mono">{s.rowsPopulated}</Td>
                <Td>{s.willImport ? <Badge tone="success">Yes</Badge> : <Badge tone="neutral">No — {s.note}</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      {/* Attribute Report */}
      <SectionCard title="Attribute Report">
        {attributes.length === 0 ? (
          <p className="text-[13px] text-stone">No attribute columns detected.</p>
        ) : (
          <Table>
            <thead><tr><Th>Attribute</Th><Th>Values</Th><Th>Products Using It</Th><Th>Supported</Th><Th>Manual Mapping</Th></tr></thead>
            <tbody>
              {attributes.map((a, i) => (
                <tr key={i}>
                  <Td>{a.name}</Td>
                  <Td className="max-w-[220px] truncate text-stone">{a.values.join(", ")}</Td>
                  <Td className="font-mono">{a.productsUsing}</Td>
                  <Td><Badge tone={a.supported ? "success" : "neutral"}>{a.supported ? "Yes" : "No"}</Badge></Td>
                  <Td>{a.requiresManualMapping ? <Badge tone="warning">Required</Badge> : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>

      {/* Preview */}
      <ProductPreviewCard jobId={jobId} />
    </div>
  );
}
