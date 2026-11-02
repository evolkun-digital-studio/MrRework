"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { Card, Table, Th, Td, Badge, Input, Select, EmptyState, Button } from "@/components/admin/ui";

interface CustomerRow {
  _id: string; email: string | null; firstName: string; lastName: string;
  status: string; country: string; createdAt: string; lastLoginAt: string | null;
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      const sp = new URLSearchParams({ page: String(page), limit: "20" });
      if (q.trim()) sp.set("q", q.trim());
      if (status) sp.set("status", status);
      fetch(`/api/admin/customers?${sp}`)
        .then((res) => res.json())
        .then((data) => { setCustomers(data.items ?? []); setTotal(data.total ?? 0); setPages(data.pages ?? 1); })
        .catch(() => setCustomers([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, status, page]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold">Customers</h1>
        <p className="text-[12.5px] text-stone mt-1">{total} total customers.</p>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="flex-1 min-w-[200px]"><Input placeholder="Search name or email…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <div className="w-44"><Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={[{ value: "", label: "All statuses" }, { value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }]} /></div>
        </div>

        {customers === null ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-11 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
        ) : customers.length === 0 ? (
          <EmptyState icon={<Users size={28} strokeWidth={1.3} />} title="No customers found" />
        ) : (
          <>
            <Table>
              <thead><tr><Th>Name</Th><Th>Email</Th><Th>Country</Th><Th>Status</Th><Th>Joined</Th><Th /></tr></thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c._id}>
                    <Td>{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</Td>
                    <Td className="max-w-[200px] truncate">{c.email ?? "—"}</Td>
                    <Td>{c.country || "—"}</Td>
                    <Td><Badge tone={c.status === "active" ? "success" : "danger"}>{c.status}</Badge></Td>
                    <Td>{new Date(c.createdAt).toLocaleDateString()}</Td>
                    <Td><Link href={`/admin/customers/${c._id}`} className="text-[11px] uppercase tracking-wide underline hover:text-stone transition">View</Link></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {pages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="text-[12px] text-stone">Page {page} of {pages}</span>
                <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
