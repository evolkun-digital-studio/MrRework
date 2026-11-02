import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "crypto";
import { mkdir, rm } from "fs/promises";
import path from "path";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/mongodb";
import { ImportJobModel } from "@/models/ImportJob";
import { UserModel } from "@/models/User";
import { ActivityLogModel } from "@/models/ActivityLog";
import { getImporter } from "@/lib/import-export/registry";
import { streamMultipartNodeImportUpload, UploadError } from "@/lib/import-export/multipartUpload";
import { IMPORT_UPLOAD_ALLOWED_EXTENSIONS, IMPORT_UPLOAD_MAX_BYTES } from "@/lib/import-export/uploadLimits";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

const ADMIN_COOKIE = "epure_admin_sid";
function getQueryString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getCookie(req: NextApiRequest, name: string): string {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return "";
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function requireAdmin(req: NextApiRequest) {
  const token = getCookie(req, ADMIN_COOKIE);
  if (!token) return null;
  await dbConnect();

  const tokenHash = hashToken(token);
  const user = await UserModel.findOne({
    role: "admin",
    status: "active",
    "adminSessions.tokenHash": tokenHash,
  });
  if (!user) return null;

  const session = user.adminSessions.find((s: any) => s.tokenHash === tokenHash);
  if (!session || session.expiresAt < new Date()) return null;
  return user;
}

function logImportUpload(admin: any, job: any, importerLabel: string) {
  ActivityLogModel.create({
    type: "import_upload",
    adminUser: String(admin._id),
    targetType: "ImportJob",
    targetId: String(job._id),
    message: `${admin.email} uploaded "${job.fileName}" for a ${importerLabel} import.`,
  }).catch(() => {});
}

// Pre-execution wizard states that just never got resumed — an admin
// abandoned the upload wizard partway through (see docs/ROADMAP.md's
// "ImportJob wizard leaves multiple stale/abandoned jobs" note). Deliberately
// excludes "importing" (a job actually in progress, or crashed mid-run —
// either way, not this cleanup's call to make) and the terminal states
// (completed/failed/cancelled), which are already-finished history rows.
const STALE_STATUSES = ["uploaded", "mapped", "validated"];
const STALE_JOB_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Opportunistic cleanup, run on each Import Center page view (same pattern
// as adminAuth.ts's session pruning on login) — no cron/scheduler exists in
// this app (see docs/DEPLOYMENT.md), so a lazy sweep tied to an existing,
// already-admin-authenticated read is the lowest-risk way to do this
// without adding new infrastructure. Marks each stale job "cancelled"
// (preserving it as an Import History row, per the model's own comment)
// and best-effort removes its uploaded file — never touches a job that's
// actually running or already finished.
async function cleanupStaleImportJobs() {
  const cutoff = new Date(Date.now() - STALE_JOB_MAX_AGE_MS);
  const stale = await ImportJobModel.find({ status: { $in: STALE_STATUSES }, createdAt: { $lt: cutoff } })
    .select("_id filePath")
    .lean<{ _id: unknown; filePath: string }[]>();
  if (!stale.length) return;

  await Promise.all(
    stale.map((job) => rm(path.dirname(job.filePath), { recursive: true, force: true }).catch(() => {}))
  );

  await ImportJobModel.updateMany(
    { _id: { $in: stale.map((j) => j._id) } },
    {
      $set: {
        status: "cancelled",
        "progress.currentPhase": "cancelled",
        "progress.error": "Automatically cancelled after 7 days with no activity.",
      },
    }
  );
}

async function listJobs(req: NextApiRequest, res: NextApiResponse) {
  // Best-effort — a cleanup failure must never break the Import Center's
  // actual job list.
  await cleanupStaleImportJobs().catch(() => {});

  const filter: Record<string, unknown> = {};
  const type = getQueryString(req.query.type);
  if (type) filter.type = type;
  const status = getQueryString(req.query.status);
  if (status) filter.status = status;

  const page = Math.max(1, Number(getQueryString(req.query.page)) || 1);
  const limit = Math.min(50, Number(getQueryString(req.query.limit)) || 10);

  const [items, total] = await Promise.all([
    ImportJobModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("adminUser", "email firstName lastName")
      .select("-preview -validation -report.errors")
      .lean(),
    ImportJobModel.countDocuments(filter),
  ]);

  res.status(200).json({ items, total, page, limit, pages: Math.ceil(total / limit) });
}

async function createJob(req: NextApiRequest, res: NextApiResponse, admin: any) {
  const _id = new Types.ObjectId();
  const dir = path.join(process.cwd(), "storage", "imports", String(_id));
  await mkdir(dir, { recursive: true });

  let upload;
  try {
    upload = await streamMultipartNodeImportUpload({
      request: req,
      destinationDir: dir,
      maxFileBytes: IMPORT_UPLOAD_MAX_BYTES,
      allowedExtensions: IMPORT_UPLOAD_ALLOWED_EXTENSIONS,
    });
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    if (err instanceof UploadError) return res.status(err.status).json({ error: err.message });
    return res.status(400).json({ error: "Upload failed while streaming the file to disk." });
  }

  const type = String(getQueryString(req.query.type) || upload.fields.type || "");
  if (!type) {
    await rm(dir, { recursive: true, force: true });
    return res.status(400).json({ error: "Import type is required." });
  }

  const importer = getImporter(type);
  if (!importer) {
    await rm(dir, { recursive: true, force: true });
    return res.status(400).json({ error: `Unknown import type "${type}".` });
  }
  if (importer.status !== "available") {
    await rm(dir, { recursive: true, force: true });
    return res.status(400).json({ error: `The "${importer.label}" importer is not available yet.` });
  }

  const acceptedExtensions = importer.acceptedExtensions ?? [".csv"];
  if (!acceptedExtensions.includes(upload.extension)) {
    await rm(dir, { recursive: true, force: true });
    return res.status(400).json({ error: `Only ${acceptedExtensions.join("/")} files are supported for ${importer.label}.` });
  }

  const job = await ImportJobModel.create({
    _id,
    type,
    status: "uploaded",
    fileName: upload.originalName,
    fileSize: upload.fileSize,
    filePath: upload.filePath,
    totalRows: 0,
    detectedColumns: [],
    columnMapping: {},
    preview: null,
    progress: { bytesRead: 0, bytesTotal: upload.fileSize, rowsProcessed: 0, statementsParsed: 0,
      tablesFound: [], percentComplete: 0, currentPhase: "uploaded" },
    adminUser: admin._id,
  });

  logImportUpload(admin, job, importer.label);
  res.status(201).json({ job });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized." });

  if (req.method === "GET") return listJobs(req, res);
  if (req.method === "POST") return createJob(req, res, admin);

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed." });
}
