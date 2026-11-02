import fs, { type WriteStream } from "fs";
import type { IncomingMessage } from "http";
import path from "path";
import { once } from "events";
import { mkdir } from "fs/promises";
import {
  IMPORT_UPLOAD_ALLOWED_EXTENSIONS,
  IMPORT_UPLOAD_MAX_BYTES,
  IMPORT_UPLOAD_MAX_LABEL,
  formatUploadBytes,
} from "./uploadLimits";

const FIELD_MAX_BYTES = 64 * 1024;
const MULTIPART_OVERHEAD_MAX_BYTES = 10 * 1024 * 1024;

export class UploadError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "UploadError";
    this.status = status;
  }
}

export interface StreamedUpload {
  fields: Record<string, string>;
  originalName: string;
  extension: string;
  filePath: string;
  fileSize: number;
}

interface MultipartPart {
  name: string;
  filename?: string;
  chunks: Buffer[];
  bytes: number;
  filePath?: string;
  stream?: WriteStream;
}

interface Options {
  request: Request;
  destinationDir: string;
  fileBaseName?: string;
  maxFileBytes?: number;
  allowedExtensions?: readonly string[];
}

interface ChunkOptions extends Omit<Options, "request"> {
  contentType: string | null;
  contentLength?: string | number | null;
  chunks: AsyncIterable<Uint8Array>;
}

interface NodeOptions extends Omit<Options, "request"> {
  request: IncomingMessage;
}

function getHeader(value: string | string[] | number | undefined | null): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (value === undefined || value === null) return null;
  return String(value);
}

async function* webChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield value;
  }
}

function getBoundary(contentType: string | null): string {
  const match = contentType?.match(/(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary) throw new UploadError(400, "Expected multipart/form-data upload.");
  return boundary;
}

function isPrefix(buf: Buffer, text: string): boolean {
  return buf.length >= text.length && buf.subarray(0, text.length).toString("latin1") === text;
}

function parseHeaderBlock(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of raw.split("\r\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return headers;
}

function parseDisposition(value: string | undefined): { name?: string; filename?: string } {
  const out: { name?: string; filename?: string } = {};
  if (!value) return out;

  for (const part of value.split(";")) {
    const [rawKey, ...rawValueParts] = part.trim().split("=");
    const key = rawKey.trim().toLowerCase();
    const rawValue = rawValueParts.join("=");
    if (!key || !rawValue) continue;
    const value = rawValue.trim().replace(/^"|"$/g, "");
    if (key === "name") out.name = value;
    if (key === "filename") out.filename = value;
  }

  return out;
}

function safeOriginalName(filename: string | undefined): string {
  const cleaned = (filename ?? "upload").replace(/\\/g, "/");
  return path.basename(cleaned) || "upload";
}

function matchExtension(fileName: string, allowedExtensions: readonly string[]): string | undefined {
  const lower = fileName.toLowerCase();
  return allowedExtensions.find((ext) => lower.endsWith(ext));
}

function copyTail(buf: Buffer, start: number): Buffer {
  return Buffer.from(buf.subarray(start));
}

async function writeChunk(stream: WriteStream, chunk: Buffer) {
  if (!chunk.length) return;
  if (!stream.write(chunk)) await once(stream, "drain");
}

async function closeStream(stream: WriteStream) {
  if (stream.closed || stream.destroyed) return;
  await new Promise<void>((resolve, reject) => {
    stream.once("error", reject);
    stream.end(() => resolve());
  });
}

export async function streamMultipartImportUpload({
  request,
  destinationDir,
  fileBaseName = "original",
  maxFileBytes = IMPORT_UPLOAD_MAX_BYTES,
  allowedExtensions = IMPORT_UPLOAD_ALLOWED_EXTENSIONS,
}: Options): Promise<StreamedUpload> {
  if (!request.body) throw new UploadError(400, "Missing upload body.");
  return streamMultipartImportUploadFromChunks({
    contentType: request.headers.get("content-type"),
    contentLength: request.headers.get("content-length"),
    chunks: webChunks(request.body),
    destinationDir,
    fileBaseName,
    maxFileBytes,
    allowedExtensions,
  });
}

export async function streamMultipartNodeImportUpload({
  request,
  destinationDir,
  fileBaseName = "original",
  maxFileBytes = IMPORT_UPLOAD_MAX_BYTES,
  allowedExtensions = IMPORT_UPLOAD_ALLOWED_EXTENSIONS,
}: NodeOptions): Promise<StreamedUpload> {
  return streamMultipartImportUploadFromChunks({
    contentType: getHeader(request.headers["content-type"]),
    contentLength: getHeader(request.headers["content-length"]),
    chunks: request,
    destinationDir,
    fileBaseName,
    maxFileBytes,
    allowedExtensions,
  });
}

async function streamMultipartImportUploadFromChunks({
  contentType,
  contentLength: rawContentLength,
  chunks,
  destinationDir,
  fileBaseName = "original",
  maxFileBytes = IMPORT_UPLOAD_MAX_BYTES,
  allowedExtensions = IMPORT_UPLOAD_ALLOWED_EXTENSIONS,
}: ChunkOptions): Promise<StreamedUpload> {
  const boundary = getBoundary(contentType);
  const contentLength = Number(rawContentLength ?? "0");
  if (contentLength > maxFileBytes + MULTIPART_OVERHEAD_MAX_BYTES) {
    throw new UploadError(413, `File is too large. Import uploads support files up to ${IMPORT_UPLOAD_MAX_LABEL}.`);
  }

  await mkdir(destinationDir, { recursive: true });

  const firstBoundary = Buffer.from(`--${boundary}`, "latin1");
  const delimiter = Buffer.from(`\r\n--${boundary}`, "latin1");
  const keepBytes = delimiter.length + 4;
  const fields: Record<string, string> = {};

  let state: "preamble" | "headers" | "body" | "after-boundary" | "done" = "preamble";
  let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let currentPart: MultipartPart | null = null;
  let uploaded: StreamedUpload | undefined;
  let sawFile = false;

  async function startPart(headerText: string) {
    const headers = parseHeaderBlock(headerText);
    const disposition = parseDisposition(headers["content-disposition"]);
    if (!disposition.name) throw new UploadError(400, "Malformed multipart field.");

    currentPart = { name: disposition.name, filename: disposition.filename, chunks: [], bytes: 0 };

    if (disposition.filename !== undefined) {
      if (disposition.name !== "file") throw new UploadError(400, `Unexpected file field "${disposition.name}".`);
      if (sawFile) throw new UploadError(400, "Only one import file may be uploaded at a time.");
      sawFile = true;

      const originalName = safeOriginalName(disposition.filename);
      const extension = matchExtension(originalName, allowedExtensions);
      if (!extension) {
        throw new UploadError(400, `Only ${allowedExtensions.join("/")} files are supported for import uploads.`);
      }

      const filePath = path.join(destinationDir, `${fileBaseName}${extension}`);
      currentPart.filePath = filePath;
      currentPart.stream = fs.createWriteStream(filePath, { flags: "wx" });
      // A write already in flight when the catch block below calls
      // stream.destroy() (e.g. after an over-size rejection) can still
      // complete and emit its own late 'error' event afterward. With no
      // listener for it, Node treats an unhandled 'error' event on any
      // EventEmitter as fatal and crashes the whole process — taking down
      // every other in-flight request, not just this upload. This permanent
      // listener doesn't change the success path (closeStream() still adds
      // its own one-time listener to reject() on a real close-time error);
      // it only stops a late/duplicate error from being fatal.
      currentPart.stream.on("error", (err) => {
        console.error("[multipartUpload] write stream error after part start:", err);
      });
      uploaded = { fields, originalName, extension, filePath, fileSize: 0 };
    }
  }

  async function writePartData(chunk: Buffer) {
    if (!chunk.length || !currentPart) return;

    if (currentPart.stream) {
      currentPart.bytes += chunk.length;
      if (currentPart.bytes > maxFileBytes) {
        throw new UploadError(413, `File is too large. Import uploads support files up to ${IMPORT_UPLOAD_MAX_LABEL}.`);
      }
      await writeChunk(currentPart.stream, chunk);
      if (uploaded) uploaded.fileSize = currentPart.bytes;
      return;
    }

    currentPart.bytes += chunk.length;
    if (currentPart.bytes > FIELD_MAX_BYTES) throw new UploadError(400, `Multipart field "${currentPart.name}" is too large.`);
    currentPart.chunks.push(chunk);
  }

  async function finishPart() {
    if (!currentPart) return;

    if (currentPart.stream) {
      await closeStream(currentPart.stream);
    } else {
      fields[currentPart.name] = Buffer.concat(currentPart.chunks).toString("utf8");
    }

    currentPart = null;
  }

  async function processBuffer(final = false) {
    while (state !== "done") {
      if (state === "preamble") {
        const idx = buffer.indexOf(firstBoundary);
        if (idx === -1) {
          if (final) throw new UploadError(400, "Malformed multipart upload.");
          if (buffer.length > firstBoundary.length) buffer = copyTail(buffer, buffer.length - firstBoundary.length);
          return;
        }
        buffer = buffer.subarray(idx + firstBoundary.length);
        state = "after-boundary";
      }

      if (state === "after-boundary") {
        if (buffer.length < 2) {
          if (final) throw new UploadError(400, "Malformed multipart boundary.");
          return;
        }
        if (isPrefix(buffer, "--")) {
          buffer = buffer.subarray(2);
          state = "done";
          return;
        }
        if (isPrefix(buffer, "\r\n")) {
          buffer = buffer.subarray(2);
          state = "headers";
        } else if (isPrefix(buffer, "\n")) {
          buffer = buffer.subarray(1);
          state = "headers";
        } else {
          throw new UploadError(400, "Malformed multipart boundary.");
        }
      }

      if (state === "headers") {
        const idx = buffer.indexOf("\r\n\r\n");
        if (idx === -1) {
          if (buffer.length > FIELD_MAX_BYTES) throw new UploadError(400, "Multipart headers are too large.");
          if (final) throw new UploadError(400, "Incomplete multipart headers.");
          return;
        }
        const headerText = buffer.subarray(0, idx).toString("latin1");
        buffer = buffer.subarray(idx + 4);
        await startPart(headerText);
        state = "body";
      }

      if (state === "body") {
        const idx = buffer.indexOf(delimiter);
        if (idx !== -1) {
          await writePartData(buffer.subarray(0, idx));
          await finishPart();
          buffer = copyTail(buffer, idx + delimiter.length);
          state = "after-boundary";
          continue;
        }

        const flushBytes = buffer.length - keepBytes;
        if (flushBytes > 0) {
          await writePartData(buffer.subarray(0, flushBytes));
          buffer = copyTail(buffer, flushBytes);
          continue;
        }

        if (final) throw new UploadError(400, "Incomplete multipart upload.");
        return;
      }
    }
  }

  async function appendChunk(chunk: Buffer) {
    if (state !== "body" || !currentPart?.stream || chunk.length <= keepBytes * 2) {
      buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
      await processBuffer();
      return;
    }

    if (buffer.length) {
      const crossBoundaryWindow = Buffer.concat([buffer, chunk.subarray(0, Math.min(chunk.length, delimiter.length + 4))]);
      const crossIdx = crossBoundaryWindow.indexOf(delimiter);
      if (crossIdx !== -1 && crossIdx < buffer.length) {
        await writePartData(crossBoundaryWindow.subarray(0, crossIdx));
        await finishPart();
        const consumedFromChunk = Math.max(0, crossIdx + delimiter.length - buffer.length);
        buffer = copyTail(chunk, consumedFromChunk);
        state = "after-boundary";
        await processBuffer();
        return;
      }
    }

    const idx = chunk.indexOf(delimiter);
    if (idx !== -1) {
      await writePartData(buffer);
      await writePartData(chunk.subarray(0, idx));
      await finishPart();
      buffer = copyTail(chunk, idx + delimiter.length);
      state = "after-boundary";
      await processBuffer();
      return;
    }

    if (buffer.length) await writePartData(buffer);
    await writePartData(chunk.subarray(0, chunk.length - keepBytes));
    buffer = copyTail(chunk, chunk.length - keepBytes);
  }

  try {
    for await (const value of chunks) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      await appendChunk(chunk);
    }
    await processBuffer(true);
    await finishPart();
  } catch (err) {
    const partToDestroy = currentPart as MultipartPart | null;
    if (partToDestroy?.stream) partToDestroy.stream.destroy();
    throw err;
  }

  const result = uploaded as StreamedUpload | undefined;
  if (!result || !sawFile) throw new UploadError(400, "No file provided.");
  if (result.fileSize === 0) throw new UploadError(400, "Uploaded file is empty.");
  if (result.fileSize > maxFileBytes) {
    throw new UploadError(413, `File is too large. Import uploads support files up to ${formatUploadBytes(maxFileBytes)}.`);
  }

  return result;
}
