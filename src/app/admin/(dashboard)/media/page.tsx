"use client";
import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Upload, Trash2, Copy, Check, RotateCcw, X } from "lucide-react";
import { Card, Input, Select, Button, EmptyState, Banner } from "@/components/admin/ui";
import { useMediaUpload } from "@/components/admin/useMediaUpload";

interface MediaItem { _id: string; filename: string; url: string; folder: string; size: number; createdAt: string }

export default function AdminMediaPage() {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Set when a delete is blocked because the image is still referenced
  // elsewhere (see DELETE /api/admin/media/[id]'s pre-delete usage check) —
  // shows what would break and offers a "delete anyway" confirmation
  // instead of the route just silently refusing (or, before this fix,
  // silently succeeding and breaking whatever used it).
  const [blockedDelete, setBlockedDelete] = useState<{ id: string; usages: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { queue, enqueue, retry, remove: removeQueueItem } = useMediaUpload(() => load());

  function load() {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (folder) sp.set("folder", folder);
    fetch(`/api/admin/media?${sp}`).then((res) => res.json()).then((data) => { setItems(data.items ?? []); setFolders(data.folders ?? []); }).catch(() => setItems([]));
  }
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, folder]);

  function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (files.length) enqueue(files);
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    // Read the FileList BEFORE resetting the input's value — resetting
    // first can clear the same FileList reference this handler is about to
    // read, which is what made picking files via the button silently do
    // nothing while drag-and-drop (which never touches input.value) worked.
    const files = e.target.files;
    if (files?.length) handleFiles(files);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }

  async function remove(id: string, force = false) {
    if (!force && !confirm("Delete this file?")) return;
    const res = await fetch(`/api/admin/media/${id}${force ? "?force=true" : ""}`, { method: "DELETE" });
    if (res.ok) {
      setBlockedDelete(null);
      load();
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.inUse) {
      setBlockedDelete({ id, usages: data.usages ?? [] });
    } else {
      alert(data.error ?? "Could not delete.");
    }
  }

  function copyUrl(item: MediaItem) {
    navigator.clipboard?.writeText(item.url).then(() => {
      setCopiedId(item._id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold">Media library</h1>
          <p className="text-[12.5px] text-stone mt-1">Reusable across Products, Categories, Collections and the Blog.</p>
        </div>
        <Button onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> Upload
        </Button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onUpload} />
      </div>

      {blockedDelete && (
        <Banner tone="error">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">This image is still in use and wasn&apos;t deleted:</p>
              <ul className="list-disc pl-5 mt-1">
                {blockedDelete.usages.map((u, i) => <li key={i}>{u}</li>)}
              </ul>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="danger" size="sm" onClick={() => remove(blockedDelete.id, true)}>Delete anyway</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setBlockedDelete(null)}>Cancel</Button>
            </div>
          </div>
        </Banner>
      )}

      <Card>
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="flex-1 min-w-[200px]"><Input placeholder="Search filename…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="w-44">
            <Select
              value={folder} onChange={(e) => setFolder(e.target.value)}
              options={[{ value: "", label: "All folders" }, ...folders.map((f) => ({ value: f, label: f }))]}
            />
          </div>
        </div>

        {/* Drag-and-drop target — previously this page only accepted files via
            the Upload button/hidden input, unlike MediaPicker. */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-brand py-4 mb-5 text-center text-[12px] transition ${
            dragOver ? "border-ink dark:border-[#f3efe8] bg-paper-2 dark:bg-[#26221b] text-ink dark:text-[#f3efe8]" : "border-line dark:border-[#332e26] text-stone"
          }`}
        >
          Drag & drop images here to upload them all at once
        </div>

        {/* Upload queue — real per-file byte progress and status, replacing
            the previous loop that discarded every response and only showed
            one shared "Uploading…" spinner with no success/failure feedback. */}
        {queue.length > 0 && (
          <div className="space-y-2 mb-5">
            {queue.map((item) => (
              <div key={item.id} className="flex items-center gap-3 text-[12px]">
                <span className="truncate flex-1 min-w-0">{item.file.name}</span>
                {item.status === "error" ? (
                  <span className="text-[#4a1414] dark:text-[#e08585] shrink-0">{item.error ?? "Failed"}</span>
                ) : (
                  <div className="w-24 h-1.5 rounded-full bg-paper-2 dark:bg-[#26221b] overflow-hidden shrink-0">
                    <div
                      className={`h-full transition-[width] ${item.status === "done" ? "bg-emerald-600" : "bg-ink dark:bg-[#f3efe8]"}`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
                <span className="w-10 text-right text-stone shrink-0">{item.status === "done" ? <Check size={13} className="inline text-emerald-600" /> : `${item.progress}%`}</span>
                {item.status === "error" ? (
                  <button type="button" onClick={() => retry(item.id)} aria-label="Retry" className="text-stone hover:text-ink dark:hover:text-[#f3efe8] shrink-0">
                    <RotateCcw size={13} />
                  </button>
                ) : null}
                <button type="button" onClick={() => removeQueueItem(item.id)} aria-label={item.status === "uploading" ? "Cancel" : "Dismiss"} className="text-stone hover:text-ink dark:hover:text-[#f3efe8] shrink-0">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {items === null ? (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-square rounded-brand bg-paper-2 dark:bg-[#26221b] animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={<ImageIcon size={28} strokeWidth={1.3} />} title="No media yet" description="Upload an image to get started." />
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {items.map((m) => (
              <div key={m._id} className="group relative aspect-square rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] border border-line dark:border-[#332e26]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.filename} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                  <button type="button" onClick={() => copyUrl(m)} aria-label="Copy URL" className="w-7 h-7 rounded-full bg-white/90 text-ink grid place-items-center">
                    {copiedId === m._id ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  <button type="button" onClick={() => remove(m._id)} aria-label="Delete" className="w-7 h-7 rounded-full bg-white/90 text-[#4a1414] grid place-items-center">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
