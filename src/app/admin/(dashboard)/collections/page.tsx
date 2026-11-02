"use client";
import { useEffect, useState } from "react";
import { Layers, Plus, Trash2, Pencil, X } from "lucide-react";
import { Card, Input, Textarea, Button, EmptyState, Banner, Badge } from "@/components/admin/ui";
import MediaPicker from "@/components/admin/MediaPicker";

interface Collection {
  _id: string; name: string; slug: string; season: string; description: string;
  heroImage: string; featured: boolean; homepage: boolean;
}
const EMPTY = { name: "", slug: "", season: "", description: "", heroImage: "", featured: false, homepage: false };

export default function AdminCollectionsPage() {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  function load() {
    fetch("/api/admin/collections").then((res) => res.json()).then((data) => setCollections(data.items ?? []));
  }
  useEffect(load, []);

  function startNew() { setForm(EMPTY); setError(""); setEditing("new"); }
  function startEdit(c: Collection) {
    setForm({ name: c.name, slug: c.slug, season: c.season ?? "", description: c.description ?? "", heroImage: c.heroImage ?? "", featured: c.featured, homepage: c.homepage });
    setError("");
    setEditing(c._id);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/admin/collections" : `/api/admin/collections/${editing}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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

  async function toggle(c: Collection, key: "featured" | "homepage") {
    await fetch(`/api/admin/collections/${c._id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: !c[key] }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this collection?")) return;
    await fetch(`/api/admin/collections/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold">Collections</h1>
          <p className="text-[12.5px] text-stone mt-1">Seasonal groupings, plus which appear featured or on the homepage.</p>
        </div>
        {editing === null && <Button onClick={startNew}><Plus size={14} /> New collection</Button>}
      </div>

      {editing !== null && (
        <Card title={editing === "new" ? "New collection" : "Edit collection"}>
          <form onSubmit={submit} className="space-y-3 max-w-lg">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <Input label="Slug" required value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
            </div>
            <Input label="Season" value={form.season} onChange={(e) => setForm((f) => ({ ...f, season: e.target.value }))} />
            <Textarea label="Description" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            <div>
              <span className="block text-[12.5px] font-medium mb-1.5">Hero image</span>
              <div className="flex items-center gap-2">
                {form.heroImage && (
                  <div className="relative w-16 h-11 rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.heroImage} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button" onClick={() => setForm((f) => ({ ...f, heroImage: "" }))} aria-label="Remove hero image"
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/70 text-white grid place-items-center"
                    >
                      <X size={9} />
                    </button>
                  </div>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={() => setPickerOpen(true)}>
                  {form.heroImage ? "Change image" : "Choose image"}
                </Button>
              </div>
            </div>
            <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(url) => { setForm((f) => ({ ...f, heroImage: url })); setPickerOpen(false); }} />
            <div className="flex gap-5">
              <label className="flex items-center gap-2.5 text-[13px] cursor-pointer">
                <input type="checkbox" checked={form.featured} onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))} className="w-4 h-4 accent-[var(--ink)]" /> Featured
              </label>
              <label className="flex items-center gap-2.5 text-[13px] cursor-pointer">
                <input type="checkbox" checked={form.homepage} onChange={(e) => setForm((f) => ({ ...f, homepage: e.target.checked }))} className="w-4 h-4 accent-[var(--ink)]" /> Show on homepage
              </label>
            </div>
            {error && <Banner tone="error">{error}</Banner>}
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {collections === null ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-11 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
        ) : collections.length === 0 ? (
          <EmptyState icon={<Layers size={28} strokeWidth={1.3} />} title="No collections yet" />
        ) : (
          <ul className="divide-y divide-line dark:divide-[#332e26]">
            {collections.map((c) => (
              <li key={c._id} className="flex items-center justify-between py-3 flex-wrap gap-2">
                <div>
                  <span className="text-[13.5px]">{c.name}</span>
                  <span className="text-stone text-[11.5px] font-mono ml-2">/{c.slug}</span>
                  {c.season && <span className="text-stone text-[11.5px] ml-2">{c.season}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => toggle(c, "featured")}><Badge tone={c.featured ? "success" : "neutral"}>Featured</Badge></button>
                  <button type="button" onClick={() => toggle(c, "homepage")}><Badge tone={c.homepage ? "success" : "neutral"}>Homepage</Badge></button>
                  <button type="button" onClick={() => startEdit(c)} aria-label="Edit" className="text-stone hover:text-ink dark:hover:text-white transition"><Pencil size={14} /></button>
                  <button type="button" onClick={() => remove(c._id)} aria-label="Delete" className="text-stone hover:text-[#4a1414] transition"><Trash2 size={14} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
