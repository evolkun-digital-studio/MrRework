import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getOrCreateAccountUser, serializeUser } from "@/lib/account";
import { detectImageFormat } from "@/lib/media-migration/downloader";
import { checkRateLimit, getClientIp, rateLimitKey, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024; // 4MB
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Local-disk upload under public/uploads/avatars — no cloud storage wired up
// yet. `profileImage` only ever stores a URL string, so swapping this for
// S3/Cloudinary later is a change contained entirely to this one route.
export async function POST(req: NextRequest) {
  // getOrCreateAccountUser() resolves a real customer session if one exists,
  // otherwise auto-provisions a guest shadow account — meaning this endpoint
  // has no login requirement at all. Rate-limited by IP so that isn't also
  // an unbounded disk-fill vector for anonymous traffic.
  const ipLimit = checkRateLimit(rateLimitKey("avatar-upload:ip", getClientIp(req)), { windowMs: 15 * 60 * 1000, max: 20 });
  if (!ipLimit.ok) return rateLimitResponse(ipLimit);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED[file.type]) {
    return NextResponse.json({ error: "Unsupported image type. Use JPG, PNG, WEBP or GIF." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be under 4MB." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectImageFormat(bytes);
  if (!detected || !ALLOWED[detected.mime]) {
    return NextResponse.json({ error: "File content doesn't match a supported image type." }, { status: 400 });
  }

  const user = await getOrCreateAccountUser();
  // Extension comes from the SNIFFED content (`detected.ext`), not the
  // client-declared `file.type` — see admin/media/route.ts for the same
  // fix; using `ALLOWED[file.type]` here would save a file under an
  // extension that doesn't match its real bytes whenever the two disagree.
  const filename = `${user._id}-${randomUUID()}.${detected.ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", "avatars");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), bytes);

  user.profileImage = `/uploads/avatars/${filename}`;
  await user.save();

  return NextResponse.json(serializeUser(user));
}
