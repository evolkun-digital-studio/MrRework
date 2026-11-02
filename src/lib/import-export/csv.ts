import fs from "fs";
import { parse } from "csv-parse";
import type { CsvPreview } from "./types";
import { reportParsingProgress, yieldToEventLoop } from "./parsingProgress";
export { applyMapping, autoMatchColumns } from "./mapping";

const PARSE_OPTIONS = { columns: true, bom: true, trim: true, skip_empty_lines: true, relax_column_count: true } as const;
const QUOTE = 34;
const COMMA = 44;
const LF = 10;
const CR = 13;

/**
 * Reads the first chunk of the raw file (before any CSV parsing) and flags
 * problems a parser would otherwise mask: invalid UTF-8 byte sequences, and
 * a delimiter other than comma (common from EU-locale Excel exports using
 * ";") — both cause csv-parse to either throw deep in a stream or silently
 * produce one giant unusable column, rather than a clear upload-time warning.
 */
function detectFileLevelWarnings(filePath: string): string[] {
  const warnings: string[] = [];
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(64 * 1024);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    const chunk = buf.subarray(0, bytesRead);

    try {
      new TextDecoder("utf-8", { fatal: true }).decode(chunk);
    } catch {
      warnings.push("This file doesn't look like valid UTF-8 — check that it was exported/saved with UTF-8 encoding, or some characters may import incorrectly.");
    }

    const firstLine = chunk.toString("utf-8").split(/\r?\n/, 1)[0] ?? "";
    const commas = (firstLine.match(/,/g) ?? []).length;
    const semicolons = (firstLine.match(/;/g) ?? []).length;
    const tabs = (firstLine.match(/\t/g) ?? []).length;
    if (commas === 0 && (semicolons > 2 || tabs > 2)) {
      warnings.push(`This file looks like it uses "${semicolons > tabs ? ";" : "tab"}" as a column delimiter instead of a comma — every row will be read as a single column. Re-save/export as comma-separated CSV.`);
    }
  } finally {
    fs.closeSync(fd);
  }
  return warnings;
}

/**
 * Reads headers, the first `previewCount` data rows, and a total row count
 * in a single streaming pass — never materializes the whole file in memory,
 * so this is safe to call on a multi-thousand-row CSV (Step 3 of the wizard).
 */
export async function parseHeaderAndPreview(filePath: string, previewCount = 10): Promise<CsvPreview> {
  const warnings: string[] = detectFileLevelWarnings(filePath);
  const [{ columns, rows }, totalRows] = await Promise.all([
    parsePreviewRows(filePath, previewCount),
    countCsvDataRows(filePath),
  ]);
  if (totalRows === 0) warnings.push("The file has no data rows.");
  return { totalRows, columns, rows, warnings };
}

async function parsePreviewRows(filePath: string, previewCount: number) {
  const rows: Record<string, string>[] = [];
  let columns: string[] = [];
  const source = fs.createReadStream(filePath);
  const parser = source.pipe(parse(PARSE_OPTIONS));
  // .pipe() does not forward the source's own 'error' event to the
  // destination — a missing/unreadable file previously left the `for
  // await` below waiting forever instead of throwing (reproduced live: an
  // import job whose uploaded file had been deleted from disk hung the
  // analyze/preview request indefinitely rather than failing cleanly).
  // Forwarding the error via destroy() makes it surface as a normal
  // rejection from the for-await loop, same as countCsvDataRows already
  // gets for free (it iterates the raw stream directly, not through pipe).
  source.on("error", (err) => parser.destroy(err));

  try {
    for await (const record of parser) {
      const row = record as Record<string, string>;
      if (!columns.length) columns = Object.keys(row);
      if (rows.length < previewCount) rows.push(row);
      if (rows.length >= previewCount) break;
    }
  } finally {
    parser.destroy();
  }

  return { columns, rows };
}

async function countCsvDataRows(filePath: string): Promise<number> {
  reportParsingProgress({ passStarted: true });
  const stream = fs.createReadStream(filePath);
  let records = 0;
  let inQuotes = false;
  let quotePending = false;
  let atFieldStart = true;
  let prevCR = false;
  let recordHasData = false;
  let sawAnyByte = false;

  function finishRecord() {
    if (recordHasData) records++;
    atFieldStart = true;
    recordHasData = false;
  }

  function processOutsideQuote(byte: number) {
    if (byte === QUOTE && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
      recordHasData = true;
      return;
    }

    if (byte === COMMA) {
      atFieldStart = true;
      recordHasData = true;
      return;
    }

    if (byte === CR || byte === LF) {
      finishRecord();
      prevCR = byte === CR;
      return;
    }

    atFieldStart = false;
    recordHasData = true;
  }

  for await (const chunk of stream) {
    const buf = chunk as Buffer;
    reportParsingProgress({ bytesRead: buf.length });
    for (const byte of buf) {
      sawAnyByte = true;

      if (prevCR) {
        prevCR = false;
        if (byte === LF) continue;
      }

      if (quotePending) {
        quotePending = false;
        if (byte === QUOTE) continue;
        inQuotes = false;
      }

      if (inQuotes) {
        if (byte === QUOTE) quotePending = true;
        continue;
      }

      processOutsideQuote(byte);
    }
    await yieldToEventLoop();
  }

  if (quotePending) inQuotes = false;
  if (sawAnyByte && recordHasData) finishRecord();
  return Math.max(0, records - 1);
}

/**
 * One row at a time, streamed from disk — used by both the validation pass
 * (Step 5) and the actual import run (Step 6), so neither ever holds more
 * than a handful of rows in memory regardless of file size.
 */
export async function* streamRows(filePath: string): AsyncGenerator<Record<string, string>> {
  reportParsingProgress({ passStarted: true });
  const source = fs.createReadStream(filePath);
  source.on("data", (chunk) => reportParsingProgress({ bytesRead: (chunk as Buffer).length }));
  const parser = source.pipe(parse(PARSE_OPTIONS));
  // See the identical fix/comment in parsePreviewRows() above — without
  // this, a missing/unreadable file hangs every caller of streamRows()
  // (the actual import run, and the pre-import validation pass) forever
  // instead of failing with a clear error.
  source.on("error", (err) => parser.destroy(err));
  let batch = 0;
  for await (const record of parser) {
    reportParsingProgress({ rowsProcessed: 1 });
    yield record as Record<string, string>;
    if (++batch % 250 === 0) await yieldToEventLoop();
  }
}
