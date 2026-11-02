"use client";
import { useState } from "react";
import { ArrowDown, Search } from "lucide-react";
import { Card, Input, Button, Banner, Badge, Table, Th, Td } from "@/components/admin/ui";
import type { ProductPreviewClient } from "./types";

// "CSV -> Mapped -> Database Document" — no write ever happens here. Each
// lookup streams the already-uploaded file server-side until it finds the
// requested SKU and returns the three stages; nothing is cached client-side
// beyond the single product currently being inspected.
export default function ProductPreviewCard({ jobId }: { jobId: string }) {
  const [sku, setSku] = useState("");
  const [preview, setPreview] = useState<ProductPreviewClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadedOnce, setLoadedOnce] = useState(false);

  async function load(targetSku?: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/import-export/jobs/${jobId}/preview-product`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: targetSku }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load preview.");
      setPreview(data.preview);
      setSku(data.preview.sku);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load preview.");
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }

  const rawEntries = preview ? Object.entries(preview.raw).filter(([, v]) => v.trim() !== "") : [];
  const mappedEntries = preview
    ? Object.entries(preview.mapped).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : String(v).trim() !== ""))
    : [];
  const docEntries = preview ? Object.entries(preview.document) : [];

  return (
    <Card title="Product Preview" description="Inspect exactly how one product will look after import — no database write.">
      <div className="flex items-end gap-3 mb-5">
        <Input label="SKU (leave blank for the first valid product)" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. WOO-001" className="max-w-xs" />
        <Button disabled={loading} onClick={() => load(sku || undefined)}><Search size={13} /> {loading ? "Loading…" : loadedOnce ? "Load Another" : "Preview a Product"}</Button>
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      {preview && (
        <div className="space-y-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-stone mb-2">1. Current CSV Data — {preview.sku}</div>
            <Table>
              <tbody>{rawEntries.map(([k, v]) => <tr key={k}><Td className="text-stone w-1/3">{k}</Td><Td className="max-w-[420px] truncate">{v}</Td></tr>)}</tbody>
            </Table>
          </div>

          <div className="flex justify-center py-1"><ArrowDown size={16} className="text-stone" /></div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-stone mb-2">2. Mapped Product</div>
            <Table>
              <tbody>
                {mappedEntries.map(([k, v]) => (
                  <tr key={k}><Td className="text-stone w-1/3">{k}</Td><Td className="max-w-[420px] truncate">{Array.isArray(v) ? v.join(", ") : String(v)}</Td></tr>
                ))}
              </tbody>
            </Table>
          </div>

          <div className="flex justify-center py-1"><ArrowDown size={16} className="text-stone" /></div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-stone mb-2">3. Database Document Preview (no write occurs)</div>
            <Table>
              <thead><tr><Th>Field</Th><Th>Value</Th></tr></thead>
              <tbody>
                {docEntries.map(([k, v]) => (
                  <tr key={k}><Td className="font-mono text-stone w-1/3">{k}</Td><Td className="max-w-[420px] truncate">{Array.isArray(v) ? v.join(", ") : String(v)}</Td></tr>
                ))}
              </tbody>
            </Table>
          </div>

          {preview.categoryActions.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-stone mb-2 mt-4">Category Actions</div>
              <div className="flex flex-wrap gap-1.5">
                {preview.categoryActions.map((c, i) => (
                  <Badge key={i} tone={c.action === "reuse" ? "success" : "neutral"}>{c.name} — {c.action === "reuse" ? "Reuse" : "Create"}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
