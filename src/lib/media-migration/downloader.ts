import "server-only";
import dns from "dns";
import net from "net";
import crypto from "crypto";

// Everything needed to safely fetch one remote image: URL/SSRF validation,
// a size-capped streamed download with redirect re-validation, magic-byte
// format detection (never trust the claimed Content-Type alone), and
// best-effort dimension extraction — all dependency-free, matching the
// project's existing "no image-processing library" posture (see
// DEPENDENCIES.md).

// SVG is deliberately excluded — same policy, same reasoning, as
// /api/admin/media/route.ts's ALLOWED map (SVG is executable content;
// safely sanitizing it needs a dedicated SVG-aware sanitizer this app
// doesn't have). detectImageFormat() below is the single shared sniffer
// both that route and this migration pipeline call, so excluding SVG here
// — rather than in a second, separately-maintained allow-list — is what
// makes the two code paths actually enforce the same policy instead of
// two independently-maintained copies of it. This migration pipeline
// previously accepted and wrote SVGs to disk unsanitized despite the
// direct-upload route rejecting them: a stored-XSS bypass fixed here (see
// the pre-launch certification audit).
export const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const USER_AGENT = "MrRework-MediaMigration/1.0";
const FETCH_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 5;

// ---------------------------------------------------------------------------
// SSRF defense — reject any URL whose hostname (or any of its resolved IPs)
// falls in a private/loopback/link-local range, checked before *every* hop
// of a redirect chain, not just the original URL.
// ---------------------------------------------------------------------------

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata 169.254.169.254
  if (a === 0) return true; // "this network"
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const n = ip.toLowerCase();
  if (n === "::1") return true; // loopback
  if (n.startsWith("fe80:") || n.startsWith("fe8") || n.startsWith("fe9") || n.startsWith("fea") || n.startsWith("feb")) return true; // link-local fe80::/10
  if (n.startsWith("fc") || n.startsWith("fd")) return true; // unique local fc00::/7
  if (n.startsWith("::ffff:")) return isPrivateIPv4(n.replace("::ffff:", "")); // IPv4-mapped
  return false;
}

function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return false;
}

async function hostIsDangerous(hostname: string): Promise<boolean> {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower === "metadata.google.internal") return true;
  if (net.isIP(hostname)) return isPrivateIp(hostname);
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    return addresses.some((a) => isPrivateIp(a.address));
  } catch {
    return true; // DNS failure — fail closed rather than risk an unvalidated fetch
  }
}

export async function validateUrl(rawUrl: string): Promise<{ ok: boolean; reason?: string }> {
  if (rawUrl.length > 2048) return { ok: false, reason: "URL is too long." };
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Malformed URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: `Unsupported protocol "${parsed.protocol}".` };
  }
  if (await hostIsDangerous(parsed.hostname)) {
    return { ok: false, reason: "URL resolves to a private, loopback, or link-local address." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Magic-byte format detection — the claimed Content-Type header is never
// trusted alone; a mislabeled or corrupted file is rejected here.
// ---------------------------------------------------------------------------

export function detectImageFormat(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (buf.length >= 6 && buf.subarray(0, 4).toString("ascii") === "GIF8") return { mime: "image/gif", ext: "gif" };
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (buf.length >= 12 && buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") return { mime: "image/avif", ext: "avif" };
  }
  // SVG is intentionally not detected/accepted here — see the comment on
  // ALLOWED_MIME_TO_EXT above. This function returning null for SVG bytes
  // is what makes engine.ts's existing `if (!format) { ...reject... }"
  // check (processUrl(), which has no allow-list of its own) correctly
  // refuse it, the same as any other unrecognized format.
  return null;
}

// ---------------------------------------------------------------------------
// Best-effort dimension extraction — PNG/GIF/JPEG are simple fixed/marker
// formats; WEBP covers the common VP8X (extended) case. AVIF's ISOBMFF box
// structure is out of scope for a dependency-free parser — left undefined.
// ---------------------------------------------------------------------------

export function extractDimensions(buf: Buffer, mime: string): { width?: number; height?: number } {
  try {
    if (mime === "image/png" && buf.length >= 24) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (mime === "image/gif" && buf.length >= 10) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (mime === "image/jpeg") {
      let offset = 2;
      while (offset < buf.length - 9) {
        if (buf[offset] !== 0xff) { offset++; continue; }
        const marker = buf[offset + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
        const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        const segmentLength = buf.readUInt16BE(offset + 2);
        if (isSOF) {
          return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
        }
        offset += 2 + segmentLength;
      }
    }
    if (mime === "image/webp" && buf.length >= 30 && buf.subarray(12, 16).toString("ascii") === "VP8X") {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { width, height };
    }
  } catch {
    // Malformed header for an otherwise valid-looking file — dimensions are
    // a nice-to-have, not worth failing the whole download over.
  }
  return {};
}

export function hashBuffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ---------------------------------------------------------------------------
// The actual fetch — streamed with a hard byte cap, redirects followed
// manually so every hop gets re-validated against the SSRF rules above.
// ---------------------------------------------------------------------------

export interface FetchImageResult {
  ok: boolean;
  buffer?: Buffer;
  contentType?: string;
  finalUrl?: string;
  error?: string;
  permanent?: boolean; // true = don't retry (bad URL, 404, oversized, wrong type); false = transient (network/5xx)
}

export async function fetchImage(url: string, maxBytes: number): Promise<FetchImageResult> {
  let currentUrl = url;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const validation = await validateUrl(currentUrl);
    if (!validation.ok) return { ok: false, error: validation.reason, permanent: true };

    let res: Response;
    try {
      res = await fetch(currentUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "User-Agent": USER_AGENT, Accept: Object.keys(ALLOWED_MIME_TO_EXT).join(",") + ",*/*" },
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Network error.", permanent: false };
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { ok: false, error: `Redirect (${res.status}) with no Location header.`, permanent: true };
      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch {
        return { ok: false, error: "Redirect Location header is not a valid URL.", permanent: true };
      }
      continue;
    }
    if (res.status === 404 || res.status === 410) return { ok: false, error: `Not found (${res.status}).`, permanent: true };
    if (res.status === 403 || res.status === 401) return { ok: false, error: `Access denied (${res.status}).`, permanent: true };
    if (res.status >= 500) return { ok: false, error: `Server error (${res.status}).`, permanent: false };
    if (!res.ok) return { ok: false, error: `Unexpected HTTP status ${res.status}.`, permanent: true };

    const declaredLength = Number(res.headers.get("content-length") ?? "0");
    if (declaredLength > maxBytes) return { ok: false, error: `File too large (${declaredLength} bytes, max ${maxBytes}).`, permanent: true };

    const reader = res.body?.getReader();
    if (!reader) return { ok: false, error: "Response had no body.", permanent: true };

    const chunks: Buffer[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return { ok: false, error: `File exceeded the ${maxBytes}-byte limit while downloading.`, permanent: true };
        }
        chunks.push(Buffer.from(value));
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Download interrupted.", permanent: false };
    }

    return { ok: true, buffer: Buffer.concat(chunks), contentType: res.headers.get("content-type")?.split(";")[0].trim().toLowerCase(), finalUrl: currentUrl };
  }

  return { ok: false, error: "Too many redirects.", permanent: true };
}
