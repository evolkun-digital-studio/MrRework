export const IMPORT_UPLOAD_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB
export const IMPORT_UPLOAD_MAX_LABEL = "2 GB";
export const IMPORT_UPLOAD_ALLOWED_EXTENSIONS = [".csv", ".sql"] as const;

export function formatUploadBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
