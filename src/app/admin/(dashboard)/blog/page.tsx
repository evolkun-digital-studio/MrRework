"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Newspaper, Plus, Trash2 } from "lucide-react";
import { Card, Table, Th, Td, Badge, Input, EmptyState, Button } from "@/components/admin/ui";

interface Post {
  _id: string; title: string; slug: string; status: "draft" | "scheduled" | "published";
  author?: { firstName?: string; lastName?: string; email?: string }; createdAt: string; publishedAt?: string;
}

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [q, setQ] = useState("");

  function load() {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    fetch(`/api/admin/blog?${sp}`).then((res) => res.json()).then((data) => setPosts(data.items ?? [])).catch(() => setPosts([]));
  }
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function remove(id: string) {
    if (!confirm("Delete this post?")) return;
    await fetch(`/api/admin/blog/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold">Blog</h1>
          <p className="text-[12.5px] text-stone mt-1">Journal posts, drafts and scheduling.</p>
        </div>
        <Link href="/admin/blog/new"><Button><Plus size={14} /> New post</Button></Link>
      </div>

      <Card>
        <div className="mb-5 max-w-sm"><Input placeholder="Search posts…" value={q} onChange={(e) => setQ(e.target.value)} /></div>

        {posts === null ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-11 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
        ) : posts.length === 0 ? (
          <EmptyState icon={<Newspaper size={28} strokeWidth={1.3} />} title="No posts yet" action={<Link href="/admin/blog/new"><Button size="sm">Write your first post</Button></Link>} />
        ) : (
          <Table>
            <thead><tr><Th>Title</Th><Th>Author</Th><Th>Status</Th><Th>Date</Th><Th /></tr></thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p._id}>
                  <Td><Link href={`/admin/blog/${p._id}`} className="hover:underline">{p.title}</Link></Td>
                  <Td>{[p.author?.firstName, p.author?.lastName].filter(Boolean).join(" ") || p.author?.email || "—"}</Td>
                  <Td><Badge tone={p.status === "published" ? "success" : p.status === "scheduled" ? "warning" : "neutral"}>{p.status}</Badge></Td>
                  <Td>{new Date(p.publishedAt ?? p.createdAt).toLocaleDateString()}</Td>
                  <Td>
                    <button type="button" onClick={() => remove(p._id)} aria-label="Delete" className="text-stone hover:text-[#4a1414] transition"><Trash2 size={14} /></button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
