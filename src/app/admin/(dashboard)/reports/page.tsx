"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { Card, Input, Table, Th, Td, Button, StatCard } from "@/components/admin/ui";
import { formatPrice } from "@/lib/utils";

interface OrderRow {
  orderNumber: string; email: string; total: number; paymentStatus: string; fulfillmentStatus: string; createdAt: string;
}

function toCsv(rows: OrderRow[]): string {
  const header = ["Order Number", "Email", "Total", "Payment Status", "Fulfillment Status", "Date"];
  const lines = rows.map((r) => [r.orderNumber, r.email, r.total, r.paymentStatus, r.fulfillmentStatus, new Date(r.createdAt).toISOString()].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  return [header.join(","), ...lines].join("\n");
}

export default function AdminReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<OrderRow[] | null>(null);

  async function run() {
    const sp = new URLSearchParams({ from, to: `${to}T23:59:59`, limit: "500" });
    const res = await fetch(`/api/admin/orders?${sp}`);
    const data = await res.json();
    setRows(data.items ?? []);
  }

  function exportCsv() {
    if (!rows) return;
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-report-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const revenue = rows?.reduce((n, r) => n + r.total, 0) ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold">Reports</h1>
        <p className="text-[12.5px] text-stone mt-1">Sales report for a chosen date range, exportable as CSV.</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button onClick={run}>Run report</Button>
          {rows && rows.length > 0 && <Button variant="ghost" onClick={exportCsv}><Download size={14} /> Export CSV</Button>}
        </div>
      </Card>

      {rows !== null && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Orders" value={rows.length} />
            <StatCard label="Revenue" value={formatPrice(revenue)} />
            <StatCard label="Avg. order value" value={formatPrice(rows.length ? revenue / rows.length : 0)} />
          </div>
          <Card>
            {rows.length === 0 ? (
              <p className="text-[12.5px] text-stone">No orders in this range.</p>
            ) : (
              <Table>
                <thead><tr><Th>Order</Th><Th>Customer</Th><Th>Date</Th><Th>Status</Th><Th className="text-right">Total</Th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.orderNumber}>
                      <Td className="font-mono">{r.orderNumber}</Td>
                      <Td className="max-w-[200px] truncate">{r.email}</Td>
                      <Td>{new Date(r.createdAt).toLocaleDateString()}</Td>
                      <Td className="capitalize">{r.fulfillmentStatus}</Td>
                      <Td className="text-right font-mono">{formatPrice(r.total)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
