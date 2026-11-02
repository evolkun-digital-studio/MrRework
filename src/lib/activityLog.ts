import "server-only";
import { ActivityLogModel } from "@/models/ActivityLog";

// Fire-and-forget by design — logging must never be why an admin action
// fails. Every admin route that mutates something calls this once instead
// of writing to ActivityLogModel directly, so the shape stays consistent.
export function logActivity(entry: {
  type: string;
  adminUserId?: string;
  targetType?: string;
  targetId?: string;
  message: string;
  meta?: unknown;
}) {
  ActivityLogModel.create({
    type: entry.type,
    adminUser: entry.adminUserId,
    targetType: entry.targetType ?? "",
    targetId: entry.targetId ?? "",
    message: entry.message,
    meta: entry.meta,
  }).catch(() => {});
}
