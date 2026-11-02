import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { requireAdmin, serializeAdminUser } from "@/lib/adminAuth";
import { detectImageFormat } from "@/lib/media-migration/downloader";
import { checkRateLimit, getClientIp, rateLimitKey, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

// Mirrors /api/account/avatar exactly (same constraints, same local-disk
// caveat) — kept as its own route rather than shared, since it operates on
// the admin session's user rather than the guest-account one.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const ipLimit = checkRateLimit(rateLimitKey("avatar-upload:ip", getClientIp(req)), { windowMs: 15 * 60 * 1000, max: 20 });
  if (!ipLimit.ok) return rateLimitResponse(ipLimit);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!ALLOWED[file.type]) return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image must be under 4MB." }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectImageFormat(bytes);
  if (!detected || !ALLOWED[detected.mime]) {
    return NextResponse.json({ error: "File content doesn't match a supported image type." }, { status: 400 });
  }

  // Extension/mimeType come from the SNIFFED content, not the client-declared
  // `file.type` — matches the fix already applied in admin/media/route.ts.
  // Using `ALLOWED[file.type]` here would save a file under an extension
  // that doesn't match its real bytes whenever the two disagree (e.g. a
  // real PNG mislabeled `image/jpeg` — both allow-listed, sniff still
  // passes since the content matches *some* allowed type).
  const filename = `${admin._id}-${randomUUID()}.${detected.ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", "avatars");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), bytes);

  admin.profileImage = `/uploads/avatars/${filename}`;
  await admin.save();

  return NextResponse.json({ user: serializeAdminUser(admin) });
}
