"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, ArrowRight, Compass, Rocket, ImageDown, Users, ShoppingBag, Star, FileSearch } from "lucide-react";
import { Card, Badge, EmptyState, Button, Table, Th, Td } from "@/components/admin/ui";
import ImportTypeCard from "@/components/admin/import-export/ImportTypeCard";
import type { RegistryImporter, ImportJobClient } from "@/components/admin/import-export/types";

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  uploaded: "neutral", mapped: "neutral", validated: "info", importing: "warning",
  completed: "success", failed: "danger", cancelled: "neutral",
};

export default function ImportExportDashboardPage() {
  const [importers, setImporters] = useState<RegistryImporter[] | null>(null);
  const [recent, setRecent] = useState<ImportJobClient[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/import-export/registry").then((res) => res.json()).then((data) => setImporters(data.items ?? []));
    fetch("/api/admin/import-export/jobs?limit=5").then((res) => res.json()).then((data) => setRecent(data.items ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-semibold">Import & Export Center</h1>
        <p className="text-[12.5px] text-stone mt-1 max-w-2xl">
          The central hub for moving data in and out of MrRework — including migrating an existing WooCommerce/WordPress
          store. Product imports are live today; the remaining data types are being rolled out on the same engine.
        </p>
      </div>

      <div>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-stone mb-3">Import</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {importers === null
            ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-[150px] rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)
            : importers.map((imp) => <ImportTypeCard key={imp.key} importer={imp} />)}

          <div className="border border-line dark:border-[#332e26] rounded-brand bg-paper dark:bg-[#1a1712] p-5 opacity-60 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-brand grid place-items-center border border-line dark:border-[#332e26]">
                <Download size={18} className="text-stone" />
              </div>
              <Badge tone="neutral">Coming Soon</Badge>
            </div>
            <div className="mt-4">
              <div className="text-[14px] font-semibold">Export Data</div>
              <p className="text-[12px] text-stone mt-1 leading-relaxed">Export products, orders, and customers to CSV.</p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-stone mb-3">Migration Tools</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Link
            href="/admin/tools/import-export/migration-assistant"
            className="block border border-line dark:border-[#332e26] rounded-brand bg-paper dark:bg-[#1a1712] p-5 transition hover:border-ink dark:hover:border-[#f3efe8]"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-brand grid place-items-center border border-ink dark:border-[#f3efe8] shrink-0">
                <Compass size={18} />
              </div>
              <div>
                <div className="text-[14px] font-semibold">MrRework Migration Assistant</div>
                <p className="text-[12px] text-stone mt-1 leading-relaxed">
                  Upload your real WooCommerce export for a full migration consultation — store profile, plugin
                  compatibility, data quality, a phased plan, risk assessment, and a per-product preview. Read-only.
                </p>
              </div>
            </div>
          </Link>
          <Link
            href="/admin/tools/import-export/customer-migration-assistant"
            className="block border border-line dark:border-[#332e26] rounded-brand bg-paper dark:bg-[#1a1712] p-5 transition hover:border-ink dark:hover:border-[#f3efe8]"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-brand grid place-items-center border border-ink dark:border-[#f3efe8] shrink-0">
                <Users size={18} />
              </div>
              <div>
                <div className="text-[14px] font-semibold">Customer Migration Assistant</div>
                <p className="text-[12px] text-stone mt-1 leading-relaxed">
                  Upload your real WordPress/WooCommerce SQL export for a full migration consultation — overview, risk
                  analysis, per-customer before/after preview, duplicate resolution, address preview, and a phased
                  plan. Read-only.
                </p>
              </div>
            </div>
          </Link>
          <Link
            href="/admin/tools/import-export/order-migration-assistant"
            className="block border border-line dark:border-[#332e26] rounded-brand bg-paper dark:bg-[#1a1712] p-5 transition hover:border-ink dark:hover:border-[#f3efe8]"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-brand grid place-items-center border border-ink dark:border-[#f3efe8] shrink-0">
                <ShoppingBag size={18} />
              </div>
              <div>
                <div className="text-[14px] font-semibold">Order Migration Assistant</div>
                <p className="text-[12px] text-stone mt-1 leading-relaxed">
                  Upload your real WooCommerce order SQL export for a full migration consultation — overview, risk
                  analysis, revenue/status/payment breakdowns, timeline, per-order before/after preview, and
                  duplicate/missing-product/missing-customer detection. Read-only.
                </p>
              </div>
            </div>
          </Link>
          <Link
            href="/admin/tools/import-export/review-migration-assistant"
            className="block border border-line dark:border-[#332e26] rounded-brand bg-paper dark:bg-[#1a1712] p-5 transition hover:border-ink dark:hover:border-[#f3efe8]"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-brand grid place-items-center border border-ink dark:border-[#f3efe8] shrink-0">
                <Star size={18} />
              </div>
              <div>
                <div className="text-[14px] font-semibold">Review Migration Assistant</div>
                <p className="text-[12px] text-stone mt-1 leading-relaxed">
                  Upload your real WordPress/WooCommerce review SQL export for a full migration consultation —
                  overview, risk analysis, rating distribution, approval breakdown, verified-purchase summary, and
                  duplicate/broken-link detection. Read-only.
                </p>
              </div>
            </div>
          </Link>
          <Link
            href="/admin/tools/import-export/content-migration-assistant"
            className="block border border-line dark:border-[#332e26] rounded-brand bg-paper dark:bg-[#1a1712] p-5 transition hover:border-ink dark:hover:border-[#f3efe8]"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-brand grid place-items-center border border-ink dark:border-[#f3efe8] shrink-0">
                <FileSearch size={18} />
              </div>
              <div>
                <div className="text-[14px] font-semibold">Content & SEO Migration Assistant</div>
                <p className="text-[12px] text-stone mt-1 leading-relaxed">
                  Upload your real WordPress SQL export for a full migration consultation across blog posts and
                  pages — SEO coverage (Yoast/RankMath/AIOSEO), redirect summary, media summary, and a per-item
                  before/after preview. Read-only.
                </p>
              </div>
            </div>
          </Link>
          <Link
            href="/admin/tools/import-export/migrate"
            className="block border border-ink dark:border-[#f3efe8] rounded-brand bg-paper dark:bg-[#1a1712] p-5 transition hover:opacity-85"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-brand grid place-items-center bg-ink text-paper dark:bg-[#f3efe8] dark:text-[#15130f] shrink-0">
                <Rocket size={18} />
              </div>
              <div>
                <div className="text-[14px] font-semibold">Start Product Migration</div>
                <p className="text-[12px] text-stone mt-1 leading-relaxed">
                  The guided, safety-gated workflow: analysis, migration assessment, an approval gate that blocks
                  High Risk files, a pre-write checkpoint, live progress, and a post-migration verification report.
                </p>
              </div>
            </div>
          </Link>
          <Link
            href="/admin/tools/import-export/media-migration"
            className="block border border-line dark:border-[#332e26] rounded-brand bg-paper dark:bg-[#1a1712] p-5 transition hover:border-ink dark:hover:border-[#f3efe8]"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-brand grid place-items-center border border-ink dark:border-[#f3efe8] shrink-0">
                <ImageDown size={18} />
              </div>
              <div>
                <div className="text-[14px] font-semibold">Media Migration Manager</div>
                <p className="text-[12px] text-stone mt-1 leading-relaxed">
                  Downloads every externally-referenced product/category image into the Media Library and repoints
                  the referencing records — so the site stops depending on the old WordPress host.
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>

      <Card
        title="Recent Imports"
        description="The last 5 import jobs. Full history, filtering, and error logs live on the History page."
        action={<Link href="/admin/tools/import-export/history"><Button variant="ghost" size="sm">View all<ArrowRight size={13} /></Button></Link>}
      >
        {recent === null ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
        ) : recent.length === 0 ? (
          <EmptyState
            title="No imports yet"
            description="Run your first WooCommerce product import to see it appear here."
            action={<Link href="/admin/tools/import-export/import?type=products"><Button size="sm">Import Products</Button></Link>}
          />
        ) : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Type</Th><Th>File</Th><Th>Rows</Th><Th>Status</Th></tr></thead>
            <tbody>
              {recent.map((job) => (
                <tr key={job._id}>
                  <Td className="whitespace-nowrap text-stone">{new Date(job.createdAt).toLocaleString()}</Td>
                  <Td className="capitalize">{job.type}</Td>
                  <Td className="max-w-[220px] truncate">{job.fileName}</Td>
                  <Td className="font-mono">{job.totalRows}</Td>
                  <Td><Badge tone={STATUS_TONE[job.status] ?? "neutral"}>{job.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
