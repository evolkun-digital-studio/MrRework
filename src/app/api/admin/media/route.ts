import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { dbConnect } from "@/lib/mongodb";
import { MediaModel } from "@/models/Media";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { detectImageFormat, extractDimensions, hashBuffer } from "@/lib/media-migration/downloader";
import { checkRateLimit, getClientIp, rateLimitKey, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

// SVG is deliberately NOT in this allow-list. Unlike every format below,
// SVG is executable content — an uploaded file containing <script> or an
// on*="" event-handler attribute runs as real JS, in this app's own origin,
// the moment anyone opens it directly (files are served verbatim from
// /media/** on the same domain, not a separate cookie-less asset host).
// Sanitizing SVG safely (stripping <script>, event handlers,
// <foreignObject>, javascript: URLs, etc.) needs a dedicated, actively
// maintained SVG-aware sanitizer — sanitize-html (already a dependency
// here) is built for HTML content, not the SVG/XML namespace, and doing it
// with ad-hoc regex is exactly the kind of thing that reliably has bypasses.
// Rejecting the format outright is the safe option this architecture
// supports today without adding a new dependency; revisit only alongside a
// real SVG sanitizer if this becomes a real product requirement.
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
};

// GET — list media, optionally scoped to a folder or filtered by filename.
// Paginated (mirrors the exact page/limit pattern already used by
// media-migration/jobs/route.ts) — a hardcoded .limit(200) here previously
// made anything uploaded before the 200 most recent assets permanently
// unreachable through the admin UI.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const sp = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};
  const folder = sp.get("folder");
  if (folder) filter.folder = folder;
  const q = sp.get("q")?.trim();
  if (q) filter.filename = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(100, Number(sp.get("limit")) || 60);

  const [items, total, folders] = await Promise.all([
    MediaModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    MediaModel.countDocuments(filter),
    MediaModel.distinct("folder"),
  ]);

  return NextResponse.json({ items, folders, total, page, limit, pages: Math.ceil(total / limit) });
}

// POST — upload a new asset. Reuses the exact local-disk pattern already
// established for account avatars (see /api/account/avatar) — same
// constraints, same "prepare for cloud storage later" caveat.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const ipLimit = checkRateLimit(rateLimitKey("media-upload:ip", getClientIp(req)), { windowMs: 15 * 60 * 1000, max: 120 });
  if (!ipLimit.ok) return rateLimitResponse(ipLimit);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const folder = String(form?.get("folder") ?? "uploads").replace(/[^a-z0-9-_]/gi, "") || "uploads";
  if (!file || !(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!ALLOWED[file.type]) return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image must be under 8MB." }, { status: 400 });

  // `file.type` is the client-sent Content-Type and isn't trustworthy on its
  // own — confirm the actual bytes are really an image of the claimed kind
  // before writing anything to disk (reuses the same magic-byte sniffing
  // already used for media-migration downloads).
  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectImageFormat(bytes);
  if (!detected || !ALLOWED[detected.mime]) {
    return NextResponse.json({ error: "File content doesn't match a supported image type." }, { status: 400 });
  }

  await dbConnect();

  // Dedupe by content hash (same SHA-256 dedup the migration importer
  // already does) — uploading the exact same bytes twice through the admin
  // Media Library previously created a second file + a second DB doc every
  // time. If an identical file already exists, hand back that existing
  // record instead of writing a duplicate.
  const hash = hashBuffer(bytes);
  const existing = await MediaModel.findOne({ hash }).lean();
  if (existing) return NextResponse.json({ media: existing, deduped: true }, { status: 200 });

  // Extension and stored mimeType come from the SNIFFED content (`detected`),
  // never the client-declared `file.type` — otherwise a file whose real
  // bytes and claimed Content-Type disagree (already rejected above if
  // `detected.mime` isn't itself allow-listed, but the two can still differ
  // from each other, e.g. a real PNG mislabeled as image/jpeg) would be
  // written to disk under a name/metadata that doesn't match its actual
  // content — a type-confusion gap for anything downstream that trusts the
  // stored mimeType or sniffs the file by its extension.
  const filename = `${randomUUID()}.${detected.ext}`;
  const dir = path.join(process.cwd(), "public", "media", folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), bytes);

  // Best-effort width/height, same hand-rolled parser the migration importer
  // already uses — previously only migrated assets got these populated;
  // directly-uploaded ones always had them undefined.
  const { width, height } = extractDimensions(bytes, detected.mime);

  const media = await MediaModel.create({
    filename: file.name || filename, url: `/media/${folder}/${filename}`, folder,
    mimeType: detected.mime, size: file.size, uploadedBy: admin._id, hash, width, height,
  });

  logActivity({ type: "media_upload", adminUserId: String(admin._id), targetType: "Media", targetId: String(media._id), message: `${admin.email} uploaded "${media.filename}".` });

  return NextResponse.json({ media }, { status: 201 });
}
