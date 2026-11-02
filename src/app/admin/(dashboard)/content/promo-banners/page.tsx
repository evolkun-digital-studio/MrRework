"use client";
import { useEffect, useState } from "react";
import { GalleryHorizontal, Images, Plus, Trash2, Pencil, X } from "lucide-react";
import { Card, Input, Select, Button, EmptyState, Banner, Badge } from "@/components/admin/ui";
import MediaPicker from "@/components/admin/MediaPicker";

const TABS = [
  { key: "banners" as const, label: "Banners" },
  { key: "media" as const, label: "Media Wall Items" },
];

export default function AdminPromoBannersPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("banners");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold">Promotional Banners</h1>
        <p className="text-[12.5px] text-stone mt-1">The homepage campaign banners and the Campaign Wall's infinite media strip.</p>
      </div>

      <div className="flex gap-1 border-b border-line dark:border-[#332e26]">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition ${
              tab === t.key ? "border-ink dark:border-[#f3efe8] text-ink dark:text-[#f3efe8]" : "border-transparent text-stone hover:text-ink dark:hover:text-[#f3efe8]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "banners" ? <BannersPanel /> : <MediaItemsPanel />}
    </div>
  );
}

interface PromoBanner {
  _id: string; title: string; subtitle: string;
  buttonText: string; buttonLink: string;
  desktopImage: string; mobileImage: string;
  overlayOpacity: number; order: number; isActive: boolean;
}
const EMPTY_BANNER = {
  title: "", subtitle: "", buttonText: "Shop Now", buttonLink: "/shop",
  desktopImage: "", mobileImage: "", overlayOpacity: 0.35, order: 0, isActive: true,
};

function BannersPanel() {
  const [banners, setBanners] = useState<PromoBanner[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // _id or "new"
  const [form, setForm] = useState(EMPTY_BANNER);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [desktopPickerOpen, setDesktopPickerOpen] = useState(false);
  const [mobilePickerOpen, setMobilePickerOpen] = useState(false);

  function load() {
    fetch("/api/admin/promo-banners").then((res) => res.json()).then((data) => setBanners(data.items ?? []));
  }
  useEffect(load, []);

  function startNew() { setForm(EMPTY_BANNER); setError(""); setEditing("new"); }
  function startEdit(b: PromoBanner) {
    setForm({
      title: b.title, subtitle: b.subtitle ?? "", buttonText: b.buttonText ?? "Shop Now", buttonLink: b.buttonLink ?? "/shop",
      desktopImage: b.desktopImage ?? "", mobileImage: b.mobileImage ?? "", overlayOpacity: b.overlayOpacity ?? 0.35,
      order: b.order ?? 0, isActive: b.isActive,
    });
    setError("");
    setEditing(b._id);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/admin/promo-banners" : `/api/admin/promo-banners/${editing}`, {
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

  async function toggleActive(b: PromoBanner) {
    await fetch(`/api/admin/promo-banners/${b._id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !b.isActive }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this banner?")) return;
    const res = await fetch(`/api/admin/promo-banners/${id}`, { method: "DELETE" });
    if (res.ok) load();
    else { const d = await res.json(); alert(d.error); }
  }

  return (
    <div className="space-y-5">
      {editing === null && <div className="flex justify-end"><Button onClick={startNew}><Plus size={14} /> New banner</Button></div>}

      {editing !== null && (
        <Card title={editing === "new" ? "New banner" : "Edit banner"}>
          <form onSubmit={submit} className="space-y-3 max-w-lg">
            <Input label="Title" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <Input label="Subtitle" value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Button text" value={form.buttonText} onChange={(e) => setForm((f) => ({ ...f, buttonText: e.target.value }))} />
              <Input label="Button link" value={form.buttonLink} onChange={(e) => setForm((f) => ({ ...f, buttonLink: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="block text-[12.5px] font-medium mb-1.5">Desktop image</span>
                <div className="flex items-center gap-2">
                  {form.desktopImage && (
                    <div className="relative w-16 h-11 rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={form.desktopImage} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button" onClick={() => setForm((f) => ({ ...f, desktopImage: "" }))} aria-label="Remove desktop image"
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/70 text-white grid place-items-center"
                      >
                        <X size={9} />
                      </button>
                    </div>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDesktopPickerOpen(true)}>
                    {form.desktopImage ? "Change" : "Choose"}
                  </Button>
                </div>
              </div>
              <div>
                <span className="block text-[12.5px] font-medium mb-1.5">Mobile image (optional)</span>
                <div className="flex items-center gap-2">
                  {form.mobileImage && (
                    <div className="relative w-16 h-11 rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={form.mobileImage} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button" onClick={() => setForm((f) => ({ ...f, mobileImage: "" }))} aria-label="Remove mobile image"
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/70 text-white grid place-items-center"
                      >
                        <X size={9} />
                      </button>
                    </div>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={() => setMobilePickerOpen(true)}>
                    {form.mobileImage ? "Change" : "Choose"}
                  </Button>
                </div>
              </div>
            </div>
            <MediaPicker open={desktopPickerOpen} onClose={() => setDesktopPickerOpen(false)} onSelect={(url) => { setForm((f) => ({ ...f, desktopImage: url })); setDesktopPickerOpen(false); }} />
            <MediaPicker open={mobilePickerOpen} onClose={() => setMobilePickerOpen(false)} onSelect={(url) => { setForm((f) => ({ ...f, mobileImage: url })); setMobilePickerOpen(false); }} />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Overlay opacity (0–1)" type="number" min={0} max={1} step={0.05}
                value={form.overlayOpacity} onChange={(e) => setForm((f) => ({ ...f, overlayOpacity: Number(e.target.value) }))}
              />
              <Input label="Sort order" type="number" value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) }))} />
            </div>

            <label className="flex items-center gap-2.5 text-[13px] cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 accent-[var(--ink)]" /> Active (visible on the storefront)
            </label>

            {error && <Banner tone="error">{error}</Banner>}
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {banners === null ? (
          <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-11 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
        ) : banners.length === 0 ? (
          <EmptyState icon={<GalleryHorizontal size={28} strokeWidth={1.3} />} title="No promo banners yet" />
        ) : (
          <ul className="divide-y divide-line dark:divide-[#332e26]">
            {banners.map((b) => (
              <li key={b._id} className="flex items-center justify-between py-3 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="relative w-16 h-11 rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] shrink-0">
                    {b.desktopImage && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.desktopImage} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div>
                    <span className="text-[13.5px]">{b.title}</span>
                    <span className="text-stone text-[11.5px] font-mono ml-2">order {b.order}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => toggleActive(b)}><Badge tone={b.isActive ? "success" : "neutral"}>{b.isActive ? "Active" : "Inactive"}</Badge></button>
                  <button type="button" onClick={() => startEdit(b)} aria-label="Edit" className="text-stone hover:text-ink dark:hover:text-white transition"><Pencil size={14} /></button>
                  <button type="button" onClick={() => remove(b._id)} aria-label="Delete" className="text-stone hover:text-[#4a1414] transition"><Trash2 size={14} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

interface PromoMediaItem {
  _id: string; type: "image" | "video"; url: string; order: number; isActive: boolean;
}
const EMPTY_MEDIA = { type: "image" as "image" | "video", url: "", order: 0, isActive: true };

function MediaItemsPanel() {
  const [items, setItems] = useState<PromoMediaItem[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_MEDIA);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  function load() {
    fetch("/api/admin/promo-media").then((res) => res.json()).then((data) => setItems(data.items ?? []));
  }
  useEffect(load, []);

  function startNew() { setForm(EMPTY_MEDIA); setError(""); setEditing("new"); }
  function startEdit(m: PromoMediaItem) {
    setForm({ type: m.type, url: m.url, order: m.order ?? 0, isActive: m.isActive });
    setError("");
    setEditing(m._id);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/admin/promo-media" : `/api/admin/promo-media/${editing}`, {
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

  async function toggleActive(m: PromoMediaItem) {
    await fetch(`/api/admin/promo-media/${m._id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !m.isActive }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this media item?")) return;
    const res = await fetch(`/api/admin/promo-media/${id}`, { method: "DELETE" });
    if (res.ok) load();
    else { const d = await res.json(); alert(d.error); }
  }

  return (
    <div className="space-y-5">
      <p className="text-[12.5px] text-stone">The images/videos in the homepage "Campaign Wall" infinite marquee, in order.</p>
      {editing === null && <div className="flex justify-end"><Button onClick={startNew}><Plus size={14} /> New media item</Button></div>}

      {editing !== null && (
        <Card title={editing === "new" ? "New media item" : "Edit media item"}>
          <form onSubmit={submit} className="space-y-3 max-w-lg">
            <Select
              label="Type" value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "image" | "video" }))}
              options={[{ value: "image", label: "Image" }, { value: "video", label: "Video" }]}
            />

            {form.type === "image" ? (
              <div>
                <span className="block text-[12.5px] font-medium mb-1.5">Image</span>
                <div className="flex items-center gap-2">
                  {form.url && (
                    <div className="relative w-16 h-11 rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={form.url} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button" onClick={() => setForm((f) => ({ ...f, url: "" }))} aria-label="Remove image"
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/70 text-white grid place-items-center"
                      >
                        <X size={9} />
                      </button>
                    </div>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPickerOpen(true)}>
                    {form.url ? "Change" : "Choose"}
                  </Button>
                </div>
                <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(url) => { setForm((f) => ({ ...f, url })); setPickerOpen(false); }} />
              </div>
            ) : (
              <Input
                label="Video URL" required placeholder="https://…/clip.mp4"
                value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
            )}

            <Input label="Sort order" type="number" value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) }))} />

            <label className="flex items-center gap-2.5 text-[13px] cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 accent-[var(--ink)]" /> Active (visible on the storefront)
            </label>

            {error && <Banner tone="error">{error}</Banner>}
            <div className="flex gap-3">
              <Button type="submit" disabled={saving || !form.url}>{saving ? "Saving…" : "Save"}</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {items === null ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-11 rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Images size={28} strokeWidth={1.3} />} title="No media items yet" />
        ) : (
          <ul className="divide-y divide-line dark:divide-[#332e26]">
            {items.map((m) => (
              <li key={m._id} className="flex items-center justify-between py-3 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="relative w-16 h-11 rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] shrink-0">
                    {m.type === "image" && m.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div>
                    <Badge tone="neutral">{m.type}</Badge>
                    <span className="text-stone text-[11.5px] font-mono ml-2">order {m.order}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => toggleActive(m)}><Badge tone={m.isActive ? "success" : "neutral"}>{m.isActive ? "Active" : "Inactive"}</Badge></button>
                  <button type="button" onClick={() => startEdit(m)} aria-label="Edit" className="text-stone hover:text-ink dark:hover:text-white transition"><Pencil size={14} /></button>
                  <button type="button" onClick={() => remove(m._id)} aria-label="Delete" className="text-stone hover:text-[#4a1414] transition"><Trash2 size={14} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
