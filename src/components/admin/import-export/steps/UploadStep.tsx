"use client";
import { useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet, X } from "lucide-react";
import { Button, Banner } from "@/components/admin/ui";
import { IMPORT_UPLOAD_MAX_BYTES, IMPORT_UPLOAD_MAX_LABEL, formatUploadBytes } from "@/lib/import-export/uploadLimits";

export default function UploadStep({
  type, acceptedExtensions = [".csv"], onUploaded,
}: {
  type: string;
  acceptedExtensions?: string[];
  onUploaded: (job: any) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File | undefined | null) {
    if (!f) return;
    setError("");
    const lower = f.name.toLowerCase();
    if (!acceptedExtensions.some((ext) => lower.endsWith(ext))) { setError(`Only ${acceptedExtensions.join("/")} files are supported.`); return; }
    if (f.size > IMPORT_UPLOAD_MAX_BYTES) { setError(`File is too large — the maximum is ${IMPORT_UPLOAD_MAX_LABEL}.`); return; }
    setFile(f);
    setUploadProgress(null);
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    setError("");
    try {
      const form = new FormData();
      form.append("type", type);
      form.append("file", file);
      const data = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/admin/import-export/jobs?type=${encodeURIComponent(type)}`);
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const pct = Math.min(100, Math.round((event.loaded / event.total) * 100));
          setUploadProgress(pct);
        };
        xhr.onload = () => {
          let payload: any = {};
          try {
            payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
          } catch {
            payload = {};
          }
          if (xhr.status < 200 || xhr.status >= 300) reject(new Error(payload.error || "Upload failed."));
          else resolve(payload);
        };
        xhr.onerror = () => reject(new Error("Upload failed."));
        xhr.onabort = () => reject(new Error("Upload was cancelled."));
        xhr.send(form);
      });
      onUploaded(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <h2 className="text-[15px] font-semibold">Upload your {acceptedExtensions.join("/")} file</h2>
      <p className="text-[12.5px] text-stone mt-1 mb-5">Maximum file size {IMPORT_UPLOAD_MAX_LABEL}.</p>

      {error && <Banner tone="error">{error}</Banner>}

      {!file ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
          onClick={() => inputRef.current?.click()}
          className={`mt-3 border-2 border-dashed rounded-brand py-14 text-center cursor-pointer transition ${
            dragOver ? "border-ink dark:border-[#f3efe8] bg-paper-2 dark:bg-[#26221b]" : "border-line dark:border-[#332e26] hover:border-ink dark:hover:border-[#f3efe8]"
          }`}
        >
          <UploadCloud size={28} className="mx-auto text-stone" />
          <p className="text-[13px] mt-3">Drag & drop your {acceptedExtensions.join("/")} file here</p>
          <p className="text-[12px] text-stone mt-1">or click to browse</p>
          <input ref={inputRef} type="file" accept={acceptedExtensions.join(",")} className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
        </div>
      ) : (
        <div className="mt-3 border border-line dark:border-[#332e26] rounded-brand p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <FileSpreadsheet size={20} className="text-stone shrink-0" />
              <div className="min-w-0">
                <div className="text-[13px] font-medium truncate">{file.name}</div>
                <div className="text-[11.5px] text-stone">{formatUploadBytes(file.size)}</div>
              </div>
            </div>
          <button type="button" onClick={() => setFile(null)} className="text-stone hover:text-ink dark:hover:text-[#f3efe8] shrink-0" aria-label="Remove file">
            <X size={16} />
          </button>
        </div>
      )}

      {uploading && (
        <div className="mt-4">
          <div className="h-2 rounded-full bg-paper-2 dark:bg-[#26221b] overflow-hidden">
            <div className="h-full bg-ink dark:bg-[#f3efe8] transition-[width]" style={{ width: `${uploadProgress ?? 0}%` }} />
          </div>
          <div className="mt-2 text-[11.5px] text-stone">
            {uploadProgress === 100 ? "Upload saved. Opening preview..." : `Uploading${uploadProgress !== null ? ` ${uploadProgress}%` : "..."}`}
          </div>
        </div>
      )}

      <div className="flex justify-end mt-6">
        <Button disabled={!file || uploading} onClick={upload}>{uploading ? "Uploading…" : "Upload & Continue"}</Button>
      </div>
    </div>
  );
}
