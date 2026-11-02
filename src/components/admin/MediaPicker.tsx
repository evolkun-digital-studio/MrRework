"use client";
import { useEffect, useRef, useState } from "react";
import { X, Upload, RotateCcw, Check, Pencil } from "lucide-react";
import { Button, Input } from "@/components/admin/ui";
import { useMediaUpload } from "@/components/admin/useMediaUpload";

interface MediaItem { _id: string; filename: string; url: string; altText?: string; caption?: string }

// A lightweight in-place modal for picking (or uploading) an image from the
// shared Media Library — used by Products, Categories, Collections and the
// Blog so none of them reimplement upload/browse logic separately. Upload
// mechanics (queueing, byte-progress, retry/cancel) live in the shared
// useMediaUpload() hook, also used by the standalone Media Library page —
// this component only wires that queue to what happens once a file lands.
//
// `onSelect` fires once per already-uploaded library item clicked in the
// grid — unchanged single-pick behavior every existing caller (BlogForm's
// one featured image, and ProductForm's "click an existing thumbnail")
// still relies on.
//
// `multiple`/`onSelectMany` are additive and opt-in: only a caller that
// passes both (ProductForm's gallery) gets drag-and-drop / multi-select
// upload of several new files in one go — each file's URL is reported back
// to `onSelectMany` the moment THAT file finishes (not batched at the end),
// so the caller's array grows as uploads land instead of waiting for the
// slowest file in a large drop. A caller that omits them (BlogForm) keeps
// single-file behavior: dropping/selecting more than one file uploads only
// the first and shows a notice explaining why, instead of silently
// uploading the rest and discarding their URLs (the previous behavior).
export default function MediaPicker({
  open, onClose, onSelect, onSelectMany, multiple = false,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  onSelectMany?: (urls: string[]) => void;
  multiple?: boolean;
}) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [q, setQ] = useState("");
  const [notice, setNotice] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAlt, setEditAlt] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const loadSeq = useRef(0);

  const { queue, enqueue, retry, remove, reset } = useMediaUpload((media) => {
    load();
    if (multiple && onSelectMany) {
      onSelectMany([media.url]);
    } else {
      onSelect(media.url);
      closeAndCleanup();
    }
  });

  // Request-guarded — a stale, slower response (e.g. from typing quickly in
  // the search box, or reopening the modal) can no longer clobber a newer
  // one; only the response matching the most recently *issued* request is
  // ever applied.
  function load() {
    const seq = ++loadSeq.current;
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    fetch(`/api/admin/media?${sp}`)
      .then((res) => res.json())
      .then((data) => { if (seq === loadSeq.current) setItems(data.items ?? []); })
      .catch(() => { if (seq === loadSeq.current) setItems([]); });
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q]);

  function handleFiles(fileList: FileList | File[]) {
    const all = Array.from(fileList);
    let files = all.filter((f) => f.type.startsWith("image/"));
    const skippedNonImage = all.length - files.length;

    let skippedExtra = 0;
    if (!multiple && files.length > 1) {
      skippedExtra = files.length - 1;
      files = files.slice(0, 1);
    }

    const notices: string[] = [];
    if (skippedNonImage) notices.push(skippedNonImage === 1 ? "1 file was skipped (not an image)." : `${skippedNonImage} files were skipped (not images).`);
    if (skippedExtra) notices.push(`Only one image can be added here — ${skippedExtra} extra file${skippedExtra === 1 ? " was" : "s were"} ignored.`);
    setNotice(notices.join(" "));

    if (files.length) enqueue(files);
  }

  function closeAndCleanup() {
    reset();
    setNotice("");
    onClose();
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    // Read (and hand off) the FileList BEFORE resetting the input's value —
    // resetting `value` first can clear the same FileList reference this
    // handler is about to read (browser-dependent), which is exactly what
    // made picking files via the button silently do nothing while
    // drag-and-drop (which never touches input.value) kept working fine.
    const files = e.target.files;
    if (files?.length) handleFiles(files);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }

  function startEdit(item: MediaItem) {
    setEditingId(item._id);
    setEditAlt(item.altText ?? "");
    setEditCaption(item.caption ?? "");
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/admin/media/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ altText: editAlt, caption: editCaption }),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setItems((prev) => prev?.map((it) => (it._id === id ? { ...it, altText: data.media.altText, caption: data.media.caption } : it)) ?? prev);
    }
    setEditingId(null);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && closeAndCleanup()}>
      <div className="w-full max-w-2xl max-h-[80dvh] flex flex-col bg-paper dark:bg-[#1a1712] border border-line dark:border-[#332e26] rounded-brand overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-[#332e26]">
          <h3 className="text-[14px] font-semibold">{multiple ? "Select or upload images" : "Select an image"}</h3>
          <button type="button" onClick={closeAndCleanup} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-4 border-b border-line dark:border-[#332e26] space-y-3">
          <div className="flex gap-3">
            <div className="flex-1"><Input placeholder="Search media…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <Button type="button" variant="ghost" onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> Upload
            </Button>
            <input ref={fileRef} type="file" accept="image/*" multiple={multiple} className="hidden" onChange={onUpload} />
          </div>
          {/* Drag-and-drop target — only meaningfully different from the
              Upload button for `multiple`, but shown either way since
              dropping a single file here works too. */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-brand py-4 text-center text-[12px] transition ${
              dragOver ? "border-ink dark:border-[#f3efe8] bg-paper-2 dark:bg-[#26221b] text-ink dark:text-[#f3efe8]" : "border-line dark:border-[#332e26] text-stone"
            }`}
          >
            {multiple ? "Drag & drop multiple images here to upload them all at once" : "Drag & drop an image here"}
          </div>
          {notice && <p className="text-[12px] text-stone">{notice}</p>}

          {/* Upload queue — one row per selected/dropped file, each with its
              own real byte-progress bar (not a file-count tally), status,
              and a Retry/Cancel action, instead of one shared "N of M" line. */}
          {queue.length > 0 && (
            <div className="space-y-2">
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
                  <button type="button" onClick={() => remove(item.id)} aria-label={item.status === "uploading" ? "Cancel" : "Dismiss"} className="text-stone hover:text-ink dark:hover:text-[#f3efe8] shrink-0">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {items === null ? (
            <p className="text-[12.5px] text-stone">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-[12.5px] text-stone">No media yet — upload one above.</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
              {items.map((m) => (
                <div key={m._id} className="relative group aspect-square rounded-brand overflow-hidden bg-paper-2 dark:bg-[#26221b] border border-transparent hover:border-ink dark:hover:border-white transition">
                  <button type="button" onClick={() => onSelect(m.url)} className="absolute inset-0" title={m.altText || m.filename}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt={m.altText || m.filename} className="w-full h-full object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); startEdit(m); }}
                    aria-label="Edit alt text and caption"
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition"
                  >
                    <Pencil size={11} />
                  </button>
                  {editingId === m._id && (
                    <div className="absolute inset-0 bg-black/80 p-2 flex flex-col gap-1.5 z-10" onMouseDown={(e) => e.stopPropagation()}>
                      <input
                        value={editAlt} onChange={(e) => setEditAlt(e.target.value)} placeholder="Alt text"
                        className="w-full text-[10.5px] rounded bg-white/90 px-1.5 py-1 text-ink"
                      />
                      <input
                        value={editCaption} onChange={(e) => setEditCaption(e.target.value)} placeholder="Caption"
                        className="w-full text-[10.5px] rounded bg-white/90 px-1.5 py-1 text-ink"
                      />
                      <div className="flex gap-1 mt-auto">
                        <button type="button" onClick={() => saveEdit(m._id)} className="flex-1 text-[10.5px] rounded bg-white text-ink py-0.5">Save</button>
                        <button type="button" onClick={() => setEditingId(null)} className="flex-1 text-[10.5px] rounded bg-white/20 text-white py-0.5">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
