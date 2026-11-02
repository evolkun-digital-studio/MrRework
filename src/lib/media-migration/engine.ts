import "server-only";
import { randomUUID } from "crypto";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { dbConnect } from "@/lib/mongodb";
import { MediaModel } from "@/models/Media";
import { MediaMigrationJobModel } from "@/models/MediaMigrationJob";
import { getMediaSource, availableMediaSources } from "./registry";
import { applyReference } from "./linker";
import { fetchImage, detectImageFormat, extractDimensions, hashBuffer, type FetchImageResult } from "./downloader";
import type { MediaReference } from "./types";

// The generic orchestration layer — mirrors the Import Engine's shape
// (atomic job claim, batched processing, per-item error isolation, capped
// error list, progress persisted after each batch) adapted for network I/O:
// a concurrency-limited pool instead of a sequential CSV stream, since
// downloads are I/O-bound and independent of each other.

const MAX_STORED_ERRORS = 300;
const PROGRESS_FLUSH_EVERY = 10;
const NON_IMAGE_EXTENSIONS = new Set(["pdf", "mp4", "mov", "avi", "zip", "doc", "docx", "css", "js", "html", "htm", "json", "xml", "txt", "mp3", "wav"]);

async function collectAllReferences(sourceKeys: string[]): Promise<Map<string, MediaReference[]>> {
  const map = new Map<string, MediaReference[]>();
  for (const key of sourceKeys) {
    const source = getMediaSource(key);
    if (!source?.collectReferences) continue;
    for await (const ref of source.collectReferences()) {
      if (!map.has(ref.url)) map.set(ref.url, []);
      map.get(ref.url)!.push(ref);
    }
  }
  return map;
}

function looksLikeNonImage(url: string): boolean {
  try {
    const ext = new URL(url).pathname.split(".").pop()?.toLowerCase();
    return !!ext && NON_IMAGE_EXTENSIONS.has(ext);
  } catch {
    return false;
  }
}

async function downloadWithRetry(url: string, maxBytes: number): Promise<FetchImageResult> {
  let last: FetchImageResult | null = null;
  for (let attempt = 0; attempt <= 2; attempt++) {
    const result = await fetchImage(url, maxBytes);
    if (result.ok || result.permanent) return result;
    last = result;
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  return last!;
}

export interface ScanSummary {
  totalReferences: number;
  distinctUrls: number;
  alreadyExisting: number;
  toDownload: number;
  perSource: { key: string; label: string; referenceCount: number }[];
}

/** Read-only pre-flight — no writes anywhere. */
export async function scanMediaReferences(sourceKeys: string[]): Promise<ScanSummary> {
  await dbConnect();
  const refsByUrl = await collectAllReferences(sourceKeys);
  const urls = [...refsByUrl.keys()];
  const existing = urls.length ? await MediaModel.find({ originalUrl: { $in: urls } }).select("originalUrl").lean<{ originalUrl: string }[]>() : [];
  const existingSet = new Set(existing.map((m) => m.originalUrl));

  const perSource = sourceKeys.map((key) => {
    const source = getMediaSource(key);
    let count = 0;
    for (const refs of refsByUrl.values()) count += refs.filter((r) => r.sourceType === key).length;
    return { key, label: source?.label ?? key, referenceCount: count };
  });

  return {
    totalReferences: [...refsByUrl.values()].reduce((n, arr) => n + arr.length, 0),
    distinctUrls: urls.length,
    alreadyExisting: existingSet.size,
    toDownload: urls.length - existingSet.size,
    perSource,
  };
}

function folderForSourceType(sourceType: string): string {
  if (sourceType === "product") return "products";
  if (sourceType === "category") return "categories";
  return "migrated";
}

/**
 * The real run. Intended to be called un-awaited (same fire-and-forget
 * pattern as runImportJob) so the triggering request returns immediately;
 * progress is polled via GET /media-migration/jobs/[id].
 */
export async function runMediaMigration(jobId: string): Promise<void> {
  await dbConnect();

  // Atomic claim — the exact race the Import Engine phase found and fixed
  // (a double-invoked trigger racing two concurrent runs) is prevented here
  // from the start, the same way.
  const job = await MediaMigrationJobModel.findOneAndUpdate(
    { _id: jobId, status: "pending" },
    { $set: { status: "running", startedAt: new Date() } },
    { new: true }
  );
  if (!job) return;

  const maxBytes = job.configuration?.maxFileSizeBytes ?? 15 * 1024 * 1024;
  const concurrency = Math.max(1, job.configuration?.maxConcurrency ?? 5);
  const startedAt = job.startedAt.getTime();

  const refsByUrl = await collectAllReferences(job.sources ?? availableMediaSources().map((s) => s.key));
  const urls = [...refsByUrl.keys()];

  const counts = { downloaded: 0, reused: 0, duplicates: 0, skipped: 0, failed: 0 };
  const errors: { url: string; message: string }[] = [];
  let totalBytes = 0;
  let processed = 0;
  const downloadedMediaIds: { mediaId: string; url: string }[] = [];
  const updatedProductIds = new Set<string>();
  const updatedCategoryIds = new Set<string>();
  let cancelled = false;
  let sinceFlush = 0;

  async function flushProgress() {
    const elapsed = Date.now() - startedAt;
    const msPerItem = processed > 0 ? elapsed / processed : 0;
    const remaining = Math.max(0, urls.length - processed);
    await MediaMigrationJobModel.updateOne(
      { _id: job._id },
      {
        $set: {
          progress: {
            processed, downloaded: counts.downloaded, reused: counts.reused, skipped: counts.skipped,
            failed: counts.failed, duplicates: counts.duplicates, currentUrl: urls[Math.min(processed, urls.length - 1)] ?? "",
            bytesDownloaded: totalBytes,
            estimatedRemainingMs: msPerItem > 0 ? Math.round(remaining * msPerItem) : undefined,
          },
        },
      }
    );
  }

  async function processUrl(url: string) {
    const refs = refsByUrl.get(url)!;
    try {
      if (looksLikeNonImage(url)) {
        counts.skipped++;
        return;
      }

      let media = await MediaModel.findOne({ originalUrl: url });
      if (!media) {
        const result = await downloadWithRetry(url, maxBytes);
        if (!result.ok || !result.buffer) {
          counts.failed++;
          if (errors.length < MAX_STORED_ERRORS) errors.push({ url, message: result.error ?? "Download failed." });
          return;
        }
        const format = detectImageFormat(result.buffer);
        if (!format) {
          counts.failed++;
          if (errors.length < MAX_STORED_ERRORS) errors.push({ url, message: "Downloaded content is not a recognized/supported image format." });
          return;
        }
        const hash = hashBuffer(result.buffer);
        const existingByHash = await MediaModel.findOne({ hash });
        if (existingByHash) {
          media = existingByHash;
          counts.duplicates++;
        } else {
          const dims = extractDimensions(result.buffer, format.mime);
          const folder = folderForSourceType(refs[0].sourceType);
          const filename = `${randomUUID()}.${format.ext}`;
          const dir = path.join(process.cwd(), "public", "media", folder);
          await mkdir(dir, { recursive: true });
          await writeFile(path.join(dir, filename), result.buffer);

          let originalFilename = filename;
          try { originalFilename = decodeURIComponent(new URL(url).pathname.split("/").pop() || filename); } catch { /* keep fallback */ }

          media = await MediaModel.create({
            filename, url: `/media/${folder}/${filename}`, folder,
            mimeType: format.mime, size: result.buffer.length,
            originalUrl: url, originalFilename,
            altText: refs[0].altText ?? "", title: refs[0].title ?? "",
            width: dims.width, height: dims.height, hash, sourceSystem: "woocommerce",
            uploadedBy: job.adminUser,
          });
          counts.downloaded++;
          totalBytes += result.buffer.length;
          downloadedMediaIds.push({ mediaId: String(media._id), url });
        }
      } else {
        counts.reused++;
      }

      for (const ref of refs) {
        await applyReference(ref, media.url);
        if (ref.sourceType === "product") updatedProductIds.add(ref.sourceId);
        else if (ref.sourceType === "category") updatedCategoryIds.add(ref.sourceId);
      }
    } catch (err) {
      // A single bad URL must never abort the run — each write above is one
      // atomic MongoDB operation, so a failure here leaves nothing partially
      // written; it's recorded and the pool moves on.
      counts.failed++;
      if (errors.length < MAX_STORED_ERRORS) errors.push({ url, message: err instanceof Error ? err.message : "Unknown error." });
    }
  }

  let nextIndex = 0;
  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= urls.length || cancelled) return;
      await processUrl(urls[i]);
      processed++;
      sinceFlush++;
      if (sinceFlush >= PROGRESS_FLUSH_EVERY) {
        sinceFlush = 0;
        await flushProgress();
        const fresh = await MediaMigrationJobModel.findById(job._id).select("cancelRequested").lean<{ cancelRequested?: boolean }>();
        if (fresh?.cancelRequested) cancelled = true;
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, urls.length)) }, worker));
    await flushProgress();

    const durationMs = Date.now() - startedAt;
    job.status = cancelled ? "cancelled" : "completed";
    job.report = {
      downloaded: counts.downloaded, reused: counts.reused, duplicates: counts.duplicates, failed: counts.failed,
      brokenUrls: errors.filter((e) => /not found|404|malformed|private|protocol/i.test(e.message)).length,
      unsupportedFormats: errors.filter((e) => /format/i.test(e.message)).length,
      totalBytes, avgDownloadSpeedBytesPerSec: durationMs > 0 ? Math.round((totalBytes / durationMs) * 1000) : 0,
      durationMs, errors, warnings: cancelled ? ["Migration was cancelled by an administrator."] : [],
    };
    job.rollbackPrep = {
      downloadedMediaIds,
      updatedProductIds: [...updatedProductIds],
      updatedCategoryIds: [...updatedCategoryIds],
    };
    await job.save();
  } catch (err) {
    job.status = "failed";
    job.report = {
      downloaded: counts.downloaded, reused: counts.reused, duplicates: counts.duplicates, failed: counts.failed,
      totalBytes, durationMs: Date.now() - startedAt,
      warnings: [err instanceof Error ? err.message : "The migration stopped unexpectedly."], errors,
    };
    await job.save();
  }
}
