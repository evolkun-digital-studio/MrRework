import { stat } from "fs/promises";
import { ImportJobModel } from "@/models/ImportJob";
import { getImporter } from "./registry";
import { parseHeaderAndPreview, streamRows } from "./csv";
import { autoMatchColumns, buildPreviewFromRows } from "./mapping";
import { withParsingProgress, yieldToEventLoop, type ParsingProgressEvent } from "./parsingProgress";

const DUPLICATE_PREVIEW_ID_CAP = 100_000;
const PROGRESS_WRITE_INTERVAL_MS = 500;

export async function prepareImportPreview(jobId: string): Promise<void> {
  const claimed = await ImportJobModel.findOneAndUpdate(
    { _id: jobId, preview: null, "progress.currentPhase": { $nin: ["parsing", "building-preview"] } },
    { $set: { "progress.currentPhase": "parsing", "progress.bytesRead": 0, "progress.rowsProcessed": 0,
      "progress.statementsParsed": 0, "progress.tablesFound": [], "progress.percentComplete": 0,
      "progress.startedAt": new Date(), "progress.estimatedRemainingMs": null, "progress.error": null } },
    { new: true }
  ).lean<any>();
  if (!claimed) return;

  const importer = getImporter(claimed.type);
  if (!importer) throw new Error(`Unknown import type "${claimed.type}".`);

  const fileSize = (await stat(claimed.filePath)).size;
  let rowsProcessed = 0;
  let statementsParsed = 0;
  let bytesRead = 0;
  const tablesFound = new Set<string>();
  const startedAt = Date.now();
  let lastWrite = 0;
  let currentPhase = "parsing";
  let phaseBasePercent = 0;
  let phaseSpanPercent = 45;
  let writeChain = Promise.resolve();

  const persistProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastWrite < PROGRESS_WRITE_INTERVAL_MS) return;
    lastWrite = now;
    const percentComplete = Math.min(99, phaseBasePercent + Math.round((Math.min(bytesRead, fileSize) / Math.max(1, fileSize)) * phaseSpanPercent));
    const elapsed = now - startedAt;
    const estimatedRemainingMs = bytesRead > 0 && bytesRead < fileSize
      ? Math.round((elapsed / bytesRead) * (fileSize - bytesRead))
      : undefined;
    const progress = {
      bytesRead: Math.min(bytesRead, fileSize), bytesTotal: fileSize, rowsProcessed, statementsParsed,
      tablesFound: [...tablesFound], percentComplete, estimatedRemainingMs, currentPhase,
    };
    writeChain = writeChain.then(() => ImportJobModel.updateOne({ _id: jobId }, { $set: { progress } })).then(() => undefined);
  };

  const report = (event: ParsingProgressEvent) => {
    if (event.passStarted) bytesRead = 0;
    if (event.bytesRead) bytesRead += event.bytesRead;
    if (event.rowsProcessed) rowsProcessed += event.rowsProcessed;
    if (event.statementsParsed) statementsParsed += event.statementsParsed;
    if (event.table) tablesFound.add(event.table);
    persistProgress();
  };

  try {
    const readRows = importer.streamRows ?? streamRows;
    const preview = await withParsingProgress(report, () =>
      importer.streamRows ? buildPreviewFromRows(readRows, claimed.filePath, 10) : parseHeaderAndPreview(claimed.filePath, 10)
    );
    const columnMapping = autoMatchColumns(preview.columns, importer.targetFields);

    await writeChain;
    currentPhase = "checking-duplicates";
    phaseBasePercent = 50;
    phaseSpanPercent = 49;
    bytesRead = 0;
    await ImportJobModel.updateOne({ _id: jobId }, { $set: { "progress.currentPhase": currentPhase, "progress.percentComplete": phaseBasePercent, "progress.bytesRead": 0 } });
    let duplicateCount = 0;
    const duplicateWarnings: string[] = [];
    if (importer.mapRow) {
      const idField = importer.identifierField ?? "sku";
      const seen = new Set<string>();
      let capped = false;
      let batch = 0;
      await withParsingProgress(report, async () => {
        for await (const raw of readRows(claimed.filePath)) {
          const mapped = importer.mapRow!(raw, columnMapping) as Record<string, unknown>;
          const id = typeof mapped[idField] === "string" ? (mapped[idField] as string).trim().toLowerCase() : "";
          if (id) {
            if (seen.has(id)) duplicateCount++;
            else if (seen.size >= DUPLICATE_PREVIEW_ID_CAP) { capped = true; break; }
            else seen.add(id);
          }
          if (++batch % 250 === 0) await yieldToEventLoop();
        }
      });
      if (capped) duplicateWarnings.push(`Possible duplicate count is a capped preview of the first ${DUPLICATE_PREVIEW_ID_CAP.toLocaleString()} unique ${idField} values. The Validation step performs the authoritative duplicate check.`);
    }

    await writeChain;
    await ImportJobModel.updateOne({ _id: jobId }, { $set: {
      totalRows: preview.totalRows,
      detectedColumns: preview.columns,
      columnMapping,
      preview: { ...preview, warnings: [...preview.warnings, ...duplicateWarnings], duplicateCount },
      progress: { bytesRead: fileSize, bytesTotal: fileSize, rowsProcessed, statementsParsed,
        tablesFound: [...tablesFound], percentComplete: 100, estimatedRemainingMs: 0, currentPhase: "completed" },
    } });
  } catch (error) {
    await writeChain;
    await ImportJobModel.updateOne({ _id: jobId }, { $set: {
      "progress.currentPhase": "failed",
      "progress.error": error instanceof Error ? error.message : "Could not parse this file.",
    } });
    throw error;
  }
}
