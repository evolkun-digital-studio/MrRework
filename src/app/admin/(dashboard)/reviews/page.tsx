"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Star, Check, X, Trash2, Plus } from "lucide-react";
import { Card, Badge, Select, Input, Textarea, Button, EmptyState, Banner } from "@/components/admin/ui";
import MediaPicker from "@/components/admin/MediaPicker";

interface Review {
  _id: string; author: string; rating: number; title?: string; body?: string;
  status: "pending" | "approved" | "rejected"; adminReply?: string; featured: boolean;
  verified: boolean; photo?: string;
  product?: { _id: string; name: string; slug: string }; createdAt: string;
}

interface ProductOption { _id: string; name: string; sku: string; slug: string }

const EMPTY_NEW_REVIEW = { productId: "", productLabel: "", author: "", rating: 5, body: "", verified: true, featured: true, photo: "" };

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [status, setStatus] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [photoPickerId, setPhotoPickerId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newReview, setNewReview] = useState(EMPTY_NEW_REVIEW);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductOption[]>([]);
  const [newPhotoPickerOpen, setNewPhotoPickerOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    fetch(`/api/admin/reviews?${sp}`).then((res) => res.json()).then((data) => setReviews(data.items ?? [])).catch(() => setReviews([]));
  }
  useEffect(load, [status]);

  // Debounced product search — used only while picking which product the
  // new review is attached to (below), not the moderation list itself.
  useEffect(() => {
    if (!creating || !productQuery.trim()) { setProductResults([]); return; }
    const id = setTimeout(() => {
      fetch(`/api/admin/products?q=${encodeURIComponent(productQuery.trim())}&limit=8`)
        .then((res) => res.json())
        .then((data) => setProductResults(data.items ?? []))
        .catch(() => setProductResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [productQuery, creating]);

  function startCreate() {
    setNewReview(EMPTY_NEW_REVIEW);
    setProductQuery("");
    setProductResults([]);
    setCreateError("");
    setCreating(true);
  }

  async function submitNewReview(e: React.FormEvent) {
    e.preventDefault();
    if (!newReview.productId) { setCreateError("Choose a product for this review."); return; }
    if (!newReview.author.trim()) { setCreateError("Reviewer name is required."); return; }
    setSaving(true);
    setCreateError("");
    try {
      const res = await fetch("/api/admin/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: newReview.productId, author: newReview.author, rating: newReview.rating,
          body: newReview.body, verified: newReview.verified, featured: newReview.featured, photo: newReview.photo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create review.");
      setCreating(false);
      load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/admin/reviews/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  }
  async function remove(id: string) {
    if (!confirm("Delete this review?")) return;
    await fetch(`/api/admin/reviews/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold">Reviews</h1>
          <p className="text-[12.5px] text-stone mt-1">Moderate, reply to, and feature customer reviews.</p>
        </div>
        <div className="flex items-center gap-2">
          {!creating && <Button onClick={startCreate}><Plus size={14} /> New review</Button>}
          <div className="w-48"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: "", label: "All statuses" }, { value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }]} /></div>
        </div>
      </div>

      {creating && (
        <Card title="New review" description="Manually add a review — e.g. to feature more &quot;Happy Customers&quot; entries on the homepage.">
          <form onSubmit={submitNewReview} className="space-y-3 max-w-lg">
            <div>
              <span className="text-[11px] uppercase tracking-wide text-stone">Product</span>
              {newReview.productId ? (
                <div className="mt-1.5 flex items-center justify-between rounded-brand border border-line dark:border-[#332e26] px-3 py-2">
                  <span className="text-[13px]">{newReview.productLabel}</span>
                  <button type="button" className="text-[12px] text-stone hover:text-ink" onClick={() => setNewReview((f) => ({ ...f, productId: "", productLabel: "" }))}>Change</button>
                </div>
              ) : (
                <div className="relative">
                  <Input placeholder="Search products by name or SKU…" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} />
                  {productResults.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-brand border border-line dark:border-[#332e26] bg-paper dark:bg-[#1a1712] shadow-lg">
                      {productResults.map((p) => (
                        <li key={p._id}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-[13px] hover:bg-paper-2 dark:hover:bg-[#26221b]"
                            onClick={() => { setNewReview((f) => ({ ...f, productId: p._id, productLabel: p.name })); setProductQuery(""); setProductResults([]); }}
                          >
                            {p.name} <span className="text-stone text-[11.5px] font-mono ml-1">{p.sku}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Reviewer name" required value={newReview.author} onChange={(e) => setNewReview((f) => ({ ...f, author: e.target.value }))} />
              <Select
                label="Rating" value={String(newReview.rating)}
                onChange={(e) => setNewReview((f) => ({ ...f, rating: Number(e.target.value) }))}
                options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? "" : "s"}` }))}
              />
            </div>

            <Textarea label="Review text" rows={3} value={newReview.body} onChange={(e) => setNewReview((f) => ({ ...f, body: e.target.value }))} />

            <div>
              <span className="block text-[12.5px] font-medium mb-1.5">Homepage photo (optional)</span>
              <div className="flex items-center gap-2">
                {newReview.photo && (
                  <div className="relative w-16 h-11 rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={newReview.photo} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setNewReview((f) => ({ ...f, photo: "" }))} aria-label="Remove photo" className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/70 text-white grid place-items-center">
                      <X size={9} />
                    </button>
                  </div>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={() => setNewPhotoPickerOpen(true)}>{newReview.photo ? "Change" : "Choose"}</Button>
              </div>
              <MediaPicker open={newPhotoPickerOpen} onClose={() => setNewPhotoPickerOpen(false)} onSelect={(url) => { setNewReview((f) => ({ ...f, photo: url })); setNewPhotoPickerOpen(false); }} />
            </div>

            <div className="flex gap-5">
              <label className="flex items-center gap-2.5 text-[13px] cursor-pointer">
                <input type="checkbox" checked={newReview.verified} onChange={(e) => setNewReview((f) => ({ ...f, verified: e.target.checked }))} className="w-4 h-4 accent-[var(--ink)]" /> Verified buyer
              </label>
              <label className="flex items-center gap-2.5 text-[13px] cursor-pointer">
                <input type="checkbox" checked={newReview.featured} onChange={(e) => setNewReview((f) => ({ ...f, featured: e.target.checked }))} className="w-4 h-4 accent-[var(--ink)]" /> Featured (shows on homepage)
              </label>
            </div>

            {createError && <Banner tone="error">{createError}</Banner>}
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save review"}</Button>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {reviews === null ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
      ) : reviews.length === 0 ? (
        <Card><EmptyState icon={<Star size={28} strokeWidth={1.3} />} title="No reviews found" /></Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <Card key={r._id}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-0.5 text-[#b8860b]">
                      {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={13} className={i < r.rating ? "fill-current" : ""} />)}
                    </span>
                    <span className="text-[13.5px] font-medium">{r.author}</span>
                    <Badge tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{r.status}</Badge>
                    {r.featured && <Badge tone="info">Featured</Badge>}
                  </div>
                  {r.product && <Link href={`/admin/products/${r.product._id}`} className="text-[11.5px] text-stone hover:underline">{r.product.name}</Link>}
                </div>
                <span className="text-[11px] text-stone">{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>

              {r.title && <p className="text-[13.5px] font-medium mt-2">{r.title}</p>}
              {r.body && <p className="text-[13px] text-ink-2 mt-1">{r.body}</p>}
              {r.adminReply && (
                <div className="mt-3 pl-3 border-l-2 border-line dark:border-[#332e26]">
                  <p className="text-[11px] uppercase tracking-wide text-stone">Store reply</p>
                  <p className="text-[13px] mt-1">{r.adminReply}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-4">
                {r.status !== "approved" && <Button size="sm" onClick={() => patch(r._id, { status: "approved" })}><Check size={13} /> Approve</Button>}
                {r.status !== "rejected" && <Button size="sm" variant="ghost" onClick={() => patch(r._id, { status: "rejected" })}><X size={13} /> Reject</Button>}
                <Button size="sm" variant="ghost" onClick={() => patch(r._id, { featured: !r.featured })}>{r.featured ? "Unfeature" : "Feature"}</Button>
                <button type="button" onClick={() => patch(r._id, { verified: !r.verified })}><Badge tone={r.verified ? "success" : "neutral"}>Verified</Badge></button>
                <Button size="sm" variant="danger" onClick={() => remove(r._id)}><Trash2 size={13} /> Delete</Button>
              </div>

              {/* Homepage "Happy Customers" curation — only meaningful once
                  a review is Featured, so it's tucked away until then rather
                  than cluttering every row in the moderation queue. */}
              {r.featured && (
                <div className="mt-3 flex items-center gap-2">
                  {r.photo && (
                    <div className="relative w-11 h-11 rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.photo} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPhotoPickerId(r._id)}>
                    {r.photo ? "Change homepage photo" : "Add homepage photo"}
                  </Button>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <div className="flex-1">
                  <Textarea
                    placeholder="Write a reply…" rows={1}
                    value={replyDrafts[r._id] ?? r.adminReply ?? ""}
                    onChange={(e) => setReplyDrafts((d) => ({ ...d, [r._id]: e.target.value }))}
                  />
                </div>
                <Button size="sm" variant="ghost" onClick={() => patch(r._id, { adminReply: replyDrafts[r._id] ?? "" })}>Save reply</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <MediaPicker
        open={photoPickerId !== null}
        onClose={() => setPhotoPickerId(null)}
        onSelect={(url) => { if (photoPickerId) patch(photoPickerId, { photo: url }); setPhotoPickerId(null); }}
      />
    </div>
  );
}
