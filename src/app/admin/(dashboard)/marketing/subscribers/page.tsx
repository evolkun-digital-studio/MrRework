"use client";
import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Card, Table, Th, Td, Input, EmptyState, Button } from "@/components/admin/ui";

interface SubscriberRow {
  _id: string;
  email: string;
  source: string;
  createdAt: string;
}

// Admin-visibility half of newsletter persistence (see /api/newsletter and
// /api/admin/subscribers) — mirrors the Customers list page's exact
// fetch/search/pagination pattern rather than introducing a different one.
export default function AdminSubscribersPage() {
  const [subscribers, setSubscribers] = useState<SubscriberRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      const sp = new URLSearchParams({ page: String(page), limit: "25" });
      if (q.trim()) sp.set("q", q.trim());
      fetch(`/api/admin/subscribers?${sp}`)
        .then((res) => res.json())
        .then((data) => { setSubscribers(data.items ?? []); setTotal(data.total ?? 0); setPages(data.pages ?? 1); })
        .catch(() => setSubscribers([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, page]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold">Newsletter subscribers</h1>
        <p className="text-[12.5px] text-stone mt-1">{total} total subscriber{total === 1 ? "" : "s"}.</p>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="flex-1 min-w-[200px]">
            <Input placeholder="Search email…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
        </div>

        {subscribers === null ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-11 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
        ) : subscribers.length === 0 ? (
          <EmptyState icon={<Mail size={28} strokeWidth={1.3} />} title="No subscribers yet" description="Signups from the storefront newsletter form will appear here." />
        ) : (
          <>
            <Table>
              <thead><tr><Th>Email</Th><Th>Source</Th><Th>Subscribed</Th></tr></thead>
              <tbody>
                {subscribers.map((s) => (
                  <tr key={s._id}>
                    <Td className="max-w-[280px] truncate">{s.email}</Td>
                    <Td>{s.source}</Td>
                    <Td>{new Date(s.createdAt).toLocaleDateString()}</Td>
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
