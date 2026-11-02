"use client";
import { useEffect, useState } from "react";
import { FolderTree, Plus, Trash2, Pencil, X } from "lucide-react";
import { Card, Input, Textarea, Select, Button, EmptyState, Banner } from "@/components/admin/ui";
import MediaPicker from "@/components/admin/MediaPicker";

interface Category {
  _id: string; name: string; slug: string; description: string; image: string;
  icon: string; order: number; parent: string | null; seoTitle: string; seoDescription: string;
}
const EMPTY = { name: "", slug: "", description: "", image: "", icon: "", order: 0, parent: "", seoTitle: "", seoDescription: "" };

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // _id or "new"
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  function load() {
    fetch("/api/admin/categories").then((res) => res.json()).then((data) => setCategories(data.items ?? []));
  }
  useEffect(load, []);

  function startNew() { setForm(EMPTY); setError(""); setEditing("new"); }
  function startEdit(c: Category) {
    setForm({ name: c.name, slug: c.slug, description: c.description ?? "", image: c.image ?? "", icon: c.icon ?? "", order: c.order ?? 0, parent: c.parent ?? "", seoTitle: c.seoTitle ?? "", seoDescription: c.seoDescription ?? "" });
    setError("");
    setEditing(c._id);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/admin/categories" : `/api/admin/categories/${editing}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, parent: form.parent || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this category?")) return;
    const res = await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
    if (res.ok) load();
    else { const d = await res.json(); alert(d.error); }
  }

  const topLevel = categories?.filter((c) => !c.parent) ?? [];
  const childrenOf = (id: string) => categories?.filter((c) => c.parent === id) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold">Categories</h1>
          <p className="text-[12.5px] text-stone mt-1">Nested categories with parent/child relationships.</p>
        </div>
        {editing === null && <Button onClick={startNew}><Plus size={14} /> New category</Button>}
      </div>

      {editing !== null && (
        <Card title={editing === "new" ? "New category" : "Edit category"}>
          <form onSubmit={submit} className="space-y-3 max-w-lg">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <Input label="Slug" required value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
            </div>
            <Textarea label="Description" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3 items-end">
              <Input label="Icon (emoji or name)" value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} />
              <div>
                <span className="block text-[12.5px] font-medium mb-1.5">Image</span>
                <div className="flex items-center gap-2">
                  {form.image && (
                    <div className="relative w-11 h-11 rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={form.image} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button" onClick={() => setForm((f) => ({ ...f, image: "" }))} aria-label="Remove image"
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/70 text-white grid place-items-center"
                      >
                        <X size={9} />
                      </button>
                    </div>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPickerOpen(true)}>
                    {form.image ? "Change image" : "Choose image"}
                  </Button>
                </div>
              </div>
            </div>
            <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(url) => { setForm((f) => ({ ...f, image: url })); setPickerOpen(false); }} />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Parent category" value={form.parent} onChange={(e) => setForm((f) => ({ ...f, parent: e.target.value }))}
                options={[{ value: "", label: "None (top-level)" }, ...(categories ?? []).filter((c) => c._id !== editing).map((c) => ({ value: c._id, label: c.name }))]}
              />
              <Input label="Sort order" type="number" value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) }))} />
            </div>
            <Input label="SEO title" value={form.seoTitle} onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))} />
            <Textarea label="SEO description" rows={2} value={form.seoDescription} onChange={(e) => setForm((f) => ({ ...f, seoDescription: e.target.value }))} />
            {error && <Banner tone="error">{error}</Banner>}
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {categories === null ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-11 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
        ) : categories.length === 0 ? (
          <EmptyState icon={<FolderTree size={28} strokeWidth={1.3} />} title="No categories yet" />
        ) : (
          <ul className="divide-y divide-line dark:divide-[#332e26]">
            {topLevel.map((c) => (
              <li key={c._id}>
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13.5px] flex items-center gap-2">{c.icon && <span>{c.icon}</span>} {c.name}<span className="text-stone text-[11.5px] font-mono ml-1">/{c.slug}</span></span>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => startEdit(c)} aria-label="Edit" className="text-stone hover:text-ink dark:hover:text-white transition"><Pencil size={14} /></button>
                    <button type="button" onClick={() => remove(c._id)} aria-label="Delete" className="text-stone hover:text-[#4a1414] transition"><Trash2 size={14} /></button>
                  </div>
                </div>
                {childrenOf(c._id).length > 0 && (
                  <ul className="pl-6 pb-2 space-y-1">
                    {childrenOf(c._id).map((sub) => (
                      <li key={sub._id} className="flex items-center justify-between py-1.5">
                        <span className="text-[13px] text-stone">↳ {sub.name}</span>
                        <div className="flex items-center gap-3">
                          <button type="button" onClick={() => startEdit(sub)} aria-label="Edit" className="text-stone hover:text-ink dark:hover:text-white transition"><Pencil size={13} /></button>
                          <button type="button" onClick={() => remove(sub._id)} aria-label="Delete" className="text-stone hover:text-[#4a1414] transition"><Trash2 size={13} /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
