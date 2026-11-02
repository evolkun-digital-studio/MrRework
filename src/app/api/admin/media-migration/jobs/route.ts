import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/mongodb";
import { MediaMigrationJobModel } from "@/models/MediaMigrationJob";
import { requireAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activityLog";
import { availableMediaSources } from "@/lib/media-migration/registry";

export const dynamic = "force-dynamic";

// Hard server-side ceilings — independent of whatever the client requests.
// fetchImage() (src/lib/media-migration/downloader.ts) buffers each entire
// download in memory before writing it to disk, so worst-case memory use is
// roughly maxFileSizeBytes × maxConcurrency all in flight at once; without a
// ceiling here, a request body of e.g. { maxFileSizeBytes: 5_000_000_000,
// maxConcurrency: 50 } would be accepted as-is and could push the process
// toward OOM.
const HARD_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
const HARD_MAX_CONCURRENCY = 20;

// GET — history (mirrors the Import Center's job history pattern).
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  await dbConnect();
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.min(50, Number(req.nextUrl.searchParams.get("limit")) || 10);

  const [items, total] = await Promise.all([
    MediaMigrationJobModel.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("adminUser", "email firstName lastName").lean(),
    MediaMigrationJobModel.countDocuments(),
  ]);

  return NextResponse.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
}

// POST — creates the checkpoint before any download starts. Body:
// { sources?: string[], maxConcurrency?, maxFileSizeBytes?, expected: {...} }
// — `expected` is passed straight through from the client's already-fetched
// /scan result, not recomputed here.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const requested: string[] | undefined = Array.isArray(body?.sources) ? body.sources : undefined;
  const sources = requested?.length ? requested : availableMediaSources().map((s) => s.key);

  await dbConnect();
  const job = await MediaMigrationJobModel.create({
    adminUser: admin._id,
    sources,
    status: "pending",
    configuration: {
      maxConcurrency: Math.min(Number(body?.maxConcurrency) || 5, HARD_MAX_CONCURRENCY),
      maxFileSizeBytes: Math.min(Number(body?.maxFileSizeBytes) || 15 * 1024 * 1024, HARD_MAX_FILE_SIZE_BYTES),
    },
    expected: {
      totalReferences: Number(body?.expected?.totalReferences) || 0,
      distinctUrls: Number(body?.expected?.distinctUrls) || 0,
    },
  });

  logActivity({
    type: "media_migration_created", adminUserId: String(admin._id), targetType: "MediaMigrationJob", targetId: String(job._id),
    message: `${admin.email} started a media migration for ${sources.join(", ")}.`,
    meta: { sources, expected: job.expected },
  });

  return NextResponse.json({ job }, { status: 201 });
}
