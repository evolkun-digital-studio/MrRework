"use client";
import { useEffect, useRef, useState } from "react";

export interface MediaUploadQueueItem {
  id: string;
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

let seq = 0;

// Shared sequential upload-queue engine behind both MediaPicker (the modal
// picker used by Products/Categories/Collections/Blog) and the standalone
// Media Library page — one real implementation (byte-level XHR progress,
// per-file retry/cancel, sequential processing so a big batch doesn't burst
// dozens of concurrent multipart requests at once) instead of two
// independently-drifting copies. The Media Library page previously had its
// own upload loop that discarded every response — no success/failure
// feedback at all beyond one shared spinner.
export function useMediaUpload(onUploaded: (media: any) => void) {
  const [queue, setQueue] = useState<MediaUploadQueueItem[]>([]);
  const xhrRefs = useRef<Map<string, XMLHttpRequest>>(new Map());

  // Sequential runner: whenever the queue changes, start the next "queued"
  // item only if nothing is currently "uploading". A retried file is just
  // set back to "queued" and picked up the same way.
  useEffect(() => {
    if (queue.some((i) => i.status === "uploading")) return;
    const next = queue.find((i) => i.status === "queued");
    if (next) uploadOne(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  function uploadOne(item: MediaUploadQueueItem) {
    setQueue((qs) => qs.map((i) => (i.id === item.id ? { ...i, status: "uploading", progress: 0, error: undefined } : i)));

    const fd = new FormData();
    fd.append("file", item.file);
    const xhr = new XMLHttpRequest();
    xhrRefs.current.set(item.id, xhr);
    xhr.open("POST", "/api/admin/media");
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
      setQueue((qs) => qs.map((i) => (i.id === item.id ? { ...i, progress: pct } : i)));
    };
    xhr.onload = () => {
      xhrRefs.current.delete(item.id);
      let data: any = {};
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : {}; } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data.media) {
        setQueue((qs) => qs.map((i) => (i.id === item.id ? { ...i, status: "done", progress: 100 } : i)));
        onUploaded(data.media);
      } else {
        setQueue((qs) => qs.map((i) => (i.id === item.id ? { ...i, status: "error", error: data.error ?? "Upload failed." } : i)));
      }
    };
    xhr.onerror = () => {
      xhrRefs.current.delete(item.id);
      setQueue((qs) => qs.map((i) => (i.id === item.id ? { ...i, status: "error", error: "Upload failed." } : i)));
    };
    xhr.onabort = () => {
      xhrRefs.current.delete(item.id);
      setQueue((qs) => qs.filter((i) => i.id !== item.id));
    };
    xhr.send(fd);
  }

  function enqueue(files: File[]) {
    const items: MediaUploadQueueItem[] = files.map((file) => ({ id: `q${++seq}`, file, status: "queued", progress: 0 }));
    setQueue((qs) => [...qs, ...items]);
  }

  function retry(id: string) {
    setQueue((qs) => qs.map((i) => (i.id === id ? { ...i, status: "queued", progress: 0, error: undefined } : i)));
  }

  // Doubles as "cancel" (aborts an in-flight/queued upload) and "dismiss"
  // (removes a finished/failed row) — a queued or uploading item is stopped
  // via its XHR (onabort removes it from the queue); a done/error item has
  // no in-flight request, so it's just filtered out directly.
  function remove(id: string) {
    const xhr = xhrRefs.current.get(id);
    if (xhr) { xhr.abort(); return; }
    setQueue((qs) => qs.filter((i) => i.id !== id));
  }

  // Aborts everything in flight and clears the queue — call when the
  // consuming UI closes/unmounts mid-batch instead of letting orphaned
  // requests keep running.
  function reset() {
    xhrRefs.current.forEach((xhr) => xhr.abort());
    xhrRefs.current.clear();
    setQueue([]);
  }

  return { queue, enqueue, retry, remove, reset };
}
