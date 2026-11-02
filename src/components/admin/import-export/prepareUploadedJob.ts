import type { ImportJobClient } from "./types";

const POLL_INTERVAL_MS = 1000;

export async function prepareUploadedJob(
  job: ImportJobClient,
  onProgress?: (job: ImportJobClient) => void
): Promise<ImportJobClient> {
  const start = await fetch(`/api/admin/import-export/jobs/${job._id}/preview`, { method: "POST" });
  if (!start.ok) {
    const data = await start.json();
    throw new Error(data.error || "Could not start preview preparation.");
  }

  for (;;) {
    const res = await fetch(`/api/admin/import-export/jobs/${job._id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not read preview progress.");
    const current = data.job as ImportJobClient;
    onProgress?.(current);
    if (current.preview) return current;
    if (current.progress?.currentPhase === "failed") throw new Error(current.progress.error || "Could not parse this file.");
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
