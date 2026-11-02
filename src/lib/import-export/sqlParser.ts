import fs from "fs";
import { reportParsingProgress, yieldToEventLoop } from "./parsingProgress";

// A small, purpose-built parser for mysqldump-style SQL exports (the format
// WordPress hosts, phpMyAdmin, and `wp db export` all produce) — not a
// general SQL engine. It understands exactly what's needed to reconstruct
// rows: `CREATE TABLE` (for column order, when an INSERT doesn't repeat it)
// and `INSERT INTO ... VALUES (...), (...), ...;` (the actual data). Nothing
// is ever executed against a database — see the module doc on
// customers/wooCustomerMapping.ts for why that matters here.
//
// Deliberately no `server-only` guard, unlike csv.ts: this needs to be
// importable from the standalone repair script (scripts/migrateWooCustomers.ts),
// which runs as a plain Node process outside Next's module resolution, same
// reasoning as autoMatchColumns living in mapping.ts instead of csv.ts. The
// actual server/route boundary is still enforced — every file that wires
// this into a route or touches the database (wooCustomerImporter.ts,
// wooCustomerSqlAnalyzer.ts, wooCustomerMigrationAssistant.ts) keeps its own
// `server-only` guard, which already blocks this from reaching a client
// bundle transitively.

export interface SqlRow {
  table: string;
  values: Record<string, string | null>;
}

const CHUNK_BYTES = 256 * 1024;

/**
 * Splits a SQL dump into complete top-level statements (splitting on `;`,
 * but never one that's inside a quoted string, a backtick-quoted
 * identifier, or a `--`/`#`/`/* *‍/` comment) — streamed from disk in fixed
 * chunks, buffering only the current in-progress statement, not the whole
 * file. A dump's data mostly lives in a handful of very large `INSERT`
 * statements (mysqldump batches many rows per statement); this only ever
 * holds one such statement in memory at a time, not the whole file.
 */
async function* streamStatements(filePath: string): AsyncGenerator<string> {
  reportParsingProgress({ passStarted: true });
  const stream = fs.createReadStream(filePath, { encoding: "utf-8", highWaterMark: CHUNK_BYTES });
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;
  let statementStart = 0;
  // The scanner's own resume point — distinct from `statementStart` (which
  // only marks where the *current, still-unresolved* statement began, for
  // slicing it out once its terminating `;` is finally found). A single
  // statement that's larger than one CHUNK_BYTES read (a real-world
  // mysqldump can easily emit one INSERT with tens of thousands of tuples,
  // many megabytes long — e.g. WooCommerce's ActionScheduler tables) needs
  // more than one scan() call before its `;` shows up. Previously `scan()`
  // restarted its walk at `statementStart` on *every* call — re-processing
  // everything already seen so far. That's more than just wasteful (O(n²)
  // for a statement spanning many chunks, confirmed: a 133MB real-world
  // dump's ~130MB single INSERT took 150+ seconds and 34 BILLION character
  // ops to rescan, vs. 133M for one honest pass): the re-walk starts fresh
  // at `i = statementStart`, but `inSingle`/`inDouble`/etc. are *not* reset
  // to match that position — they're whatever this function's *previous*
  // call left them as, at whatever *later* position it actually stopped at.
  // `statementStart` is always a position with every flag false (by
  // construction — the branches that recognize `;` only run when nothing is
  // open), so replaying from there while every flag secretly still reflects
  // some later, active quote/comment isn't idempotent: it can misread a
  // real opening quote as a stray closing one, flip parity, and — as
  // confirmed against the real file above — leave the scanner permanently
  // stuck `inDouble`/`inSingle` for the rest of the file, silently merging
  // everything after into the one still-open "statement" and never seeing
  // another CREATE TABLE/INSERT again. `pos` fixes both problems the same
  // way: every character is visited exactly once, ever, and the flags it
  // carries into the next call are always the flags that were actually true
  // at the position it resumes from.
  let pos = 0;

  // `finalFlush` distinguishes "no more data exists" from "no more data has
  // arrived yet." Several branches below decide their outcome from a
  // 2-character lookahead (`next`) — a doubled `''`/`""` escape, `--`, `/*`.
  // Mid-stream, `next` can be `undefined` purely because the next chunk
  // hasn't been read yet, not because the file actually ends there; treating
  // that as a real answer (e.g. "not a doubled quote, so this closes the
  // string") can misclassify a closing quote that was actually the first
  // half of an escaped `''` split across a chunk boundary. Once `inSingle`
  // (or `inDouble`) is wrongly cleared, every subsequent quote in the file
  // flips parity from there on — silently merging or corrupting statements
  // for the entire rest of the file, not just the one boundary. So mid-
  // stream, the loop stops one character short, leaving the last buffered
  // character for the *next* call (by which point its real neighbor is
  // available) — only the final flush, once the stream has truly ended, is
  // allowed to resolve a lookahead against `undefined` for real.
  function scan(finalFlush: boolean): string[] {
    const out: string[] = [];
    let i = pos;
    const limit = finalFlush ? buf.length : Math.max(i, buf.length - 1);
    while (i < limit) {
      const c = buf[i];
      const next = buf[i + 1];

      if (inLineComment) {
        if (c === "\n") inLineComment = false;
        i++;
        continue;
      }
      if (inBlockComment) {
        if (c === "*" && next === "/") { inBlockComment = false; i += 2; continue; }
        i++;
        continue;
      }
      if (inSingle) {
        if (c === "\\") { i += 2; continue; } // escaped char, skip both
        if (c === "'") {
          if (next === "'") { i += 2; continue; } // doubled-quote escape
          inSingle = false;
        }
        i++;
        continue;
      }
      if (inDouble) {
        if (c === "\\") { i += 2; continue; }
        if (c === '"') {
          if (next === '"') { i += 2; continue; }
          inDouble = false;
        }
        i++;
        continue;
      }
      if (inBacktick) {
        if (c === "`") inBacktick = false;
        i++;
        continue;
      }

      if (c === "'") { inSingle = true; i++; continue; }
      if (c === '"') { inDouble = true; i++; continue; }
      if (c === "`") { inBacktick = true; i++; continue; }
      if (c === "-" && next === "-") { inLineComment = true; i += 2; continue; }
      if (c === "#") { inLineComment = true; i++; continue; }
      if (c === "/" && next === "*") { inBlockComment = true; i += 2; continue; }
      if (c === ";") {
        out.push(buf.slice(statementStart, i));
        i++;
        statementStart = i;
        continue;
      }
      i++;
    }
    pos = i;
    return out;
  }

  for await (const chunk of stream) {
    reportParsingProgress({ bytesRead: Buffer.byteLength(chunk as string, "utf8") });
    buf += chunk as string;
    for (const stmt of scan(false)) {
      const trimmed = stmt.trim();
      if (trimmed) {
        reportParsingProgress({ statementsParsed: 1 });
        yield trimmed;
      }
    }
    // Keep only the unconsumed tail so the buffer doesn't grow across the
    // whole file — everything before statementStart has already been
    // yielded or was pure whitespace/comment. `pos` (always >= statementStart)
    // shifts by the same amount so it still points at the same logical
    // character after the slice.
    if (statementStart > CHUNK_BYTES) {
      buf = buf.slice(statementStart);
      pos -= statementStart;
      statementStart = 0;
    }
    await yieldToEventLoop();
  }
  // True end of stream — resolve whatever's left, including the one
  // possibly-deferred trailing character from the last mid-stream scan().
  for (const stmt of scan(true)) {
    const trimmed = stmt.trim();
    if (trimmed) {
      reportParsingProgress({ statementsParsed: 1 });
      yield trimmed;
    }
  }
  const rest = buf.slice(statementStart).trim();
  if (rest) {
    reportParsingProgress({ statementsParsed: 1 });
    yield rest;
  }
}

/** One `(v1, 'v2', NULL, ...)` tuple -> parsed values, in order. */
function parseValueTuple(tuple: string): (string | null)[] {
  const values: (string | null)[] = [];
  let i = 0;
  const n = tuple.length;
  while (i < n) {
    while (i < n && /\s/.test(tuple[i])) i++;
    if (i >= n) break;

    if (tuple[i] === ",") { i++; continue; }

    if (tuple[i] === "'") {
      i++;
      let out = "";
      while (i < n) {
        const c = tuple[i];
        if (c === "\\" && i + 1 < n) { out += unescapeChar(tuple[i + 1]); i += 2; continue; }
        if (c === "'" && tuple[i + 1] === "'") { out += "'"; i += 2; continue; }
        if (c === "'") { i++; break; }
        out += c;
        i++;
      }
      values.push(out);
    } else {
      let start = i;
      while (i < n && tuple[i] !== ",") i++;
      const raw = tuple.slice(start, i).trim();
      values.push(raw.toUpperCase() === "NULL" ? null : raw);
    }

    while (i < n && /\s/.test(tuple[i])) i++;
    if (i < n && tuple[i] === ",") i++;
  }
  return values;
}

function unescapeChar(c: string): string {
  switch (c) {
    case "n": return "\n";
    case "r": return "\r";
    case "t": return "\t";
    case "0": return "\0";
    case "\\": return "\\";
    case "'": return "'";
    case '"': return '"';
    default: return c;
  }
}

/** Splits `(a, b), (c, d), (e, f)` into ["a, b", "c, d", "e, f"] — respecting
 *  quoted strings so a comma or paren inside a value never breaks a tuple. */
async function* splitTuples(valuesList: string): AsyncGenerator<string> {
  let depth = 0;
  let inSingle = false;
  let start = -1;
  let yielded = 0;
  for (let i = 0; i < valuesList.length; i++) {
    const c = valuesList[i];
    if (inSingle) {
      if (c === "\\") { i++; continue; }
      if (c === "'") inSingle = false;
      continue;
    }
    if (c === "'") { inSingle = true; continue; }
    if (c === "(") { if (depth === 0) start = i + 1; depth++; continue; }
    if (c === ")") {
      depth--;
      if (depth === 0 && start >= 0) {
        yield valuesList.slice(start, i);
        start = -1;
        if (++yielded % 250 === 0) await yieldToEventLoop();
      }
      continue;
    }
  }
}

function stripQuotes(identifier: string): string {
  return identifier.trim().replace(/^[`"[]|[`"\]]$/g, "");
}

/** `CREATE TABLE `wp_users` (`ID` bigint, `user_login` varchar(60), ...)` -> ["ID", "user_login", ...]. */
function parseCreateTableColumns(statement: string): string[] {
  const openIdx = statement.indexOf("(");
  if (openIdx === -1) return [];
  let depth = 0;
  let end = -1;
  for (let i = openIdx; i < statement.length; i++) {
    if (statement[i] === "(") depth++;
    else if (statement[i] === ")") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return [];
  const body = statement.slice(openIdx + 1, end);

  const columns: string[] = [];
  let depth2 = 0;
  let fieldStart = 0;
  const fields: string[] = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "(") depth2++;
    else if (body[i] === ")") depth2--;
    else if (body[i] === "," && depth2 === 0) { fields.push(body.slice(fieldStart, i)); fieldStart = i + 1; }
  }
  fields.push(body.slice(fieldStart));

  for (const field of fields) {
    const trimmed = field.trim();
    if (/^(PRIMARY|UNIQUE|KEY|CONSTRAINT|INDEX|FOREIGN|FULLTEXT)\b/i.test(trimmed)) continue;
    const m = trimmed.match(/^[`"[]?([A-Za-z0-9_]+)[`"\]]?/);
    if (m) columns.push(m[1]);
  }
  return columns;
}

/**
 * Streams every row of the requested tables from a mysqldump-style SQL
 * file — one full pass over the file, never materializing the whole dump or
 * a whole table in memory. Column order comes from the INSERT statement's
 * own column list when present (phpMyAdmin/`--complete-insert` exports
 * always include it); when a dump omits it (plain `mysqldump` default),
 * falls back to whatever `CREATE TABLE` for that table declared — which
 * must therefore appear before its `INSERT`s in the file, exactly as every
 * real dump orders them.
 */
// streamStatements() guarantees a `;` inside a comment never splits a
// statement early, but it doesn't strip the comment text itself — a
// statement can still come back as e.g. "-- Table structure for wp_posts\nCREATE
// TABLE ...". Real mysqldump/phpMyAdmin exports put a comment line before
// almost every CREATE TABLE/INSERT block, so without stripping them here,
// the keyword-sniffing below (`upper.startsWith("INSERT")`) would silently
// skip nearly every statement in a real-world dump — not a hypothetical
// edge case, the normal shape of the input this parser exists to read.
function stripLeadingComments(text: string): string {
  let s = text;
  for (;;) {
    const trimmed = s.replace(/^\s+/, "");
    if (trimmed.startsWith("--") || trimmed.startsWith("#")) {
      const nl = trimmed.indexOf("\n");
      s = nl === -1 ? "" : trimmed.slice(nl + 1);
      continue;
    }
    if (trimmed.startsWith("/*")) {
      const end = trimmed.indexOf("*/");
      s = end === -1 ? "" : trimmed.slice(end + 2);
      continue;
    }
    return trimmed;
  }
}

export interface TableDiscoveryEntry {
  table: string;
  createTableStatements: number;
  insertStatements: number;
  rowCount: number;
}

/**
 * One full, unfiltered pass over a SQL dump — tallies every table name found
 * in CREATE TABLE / INSERT [IGNORE] INTO / REPLACE INTO statements,
 * regardless of whether any importer is actually looking for it. Built from
 * the exact same primitives as streamSqlTables() (streamStatements,
 * stripLeadingComments, stripQuotes, splitTuples), not a second parser.
 * Purely diagnostic: turns a confusing "0 rows" result into a concrete
 * answer — "this file has these N tables, none of which look like
 * customer/order/review/content data" — instead of leaving an admin to
 * guess whether the parser is broken or the export just doesn't contain
 * what they're trying to import. See mapping.ts's buildPreviewFromRows().
 */
export async function discoverTables(filePath: string): Promise<TableDiscoveryEntry[]> {
  const counts = new Map<string, TableDiscoveryEntry>();
  const entryFor = (table: string): TableDiscoveryEntry => {
    let entry = counts.get(table);
    if (!entry) { entry = { table, createTableStatements: 0, insertStatements: 0, rowCount: 0 }; counts.set(table, entry); }
    return entry;
  };

  for await (const rawStatement of streamStatements(filePath)) {
    const statement = stripLeadingComments(rawStatement);
    if (!statement) continue;
    const upper = statement.slice(0, 20).toUpperCase();

    if (upper.startsWith("CREATE TABLE")) {
      const nameMatch = statement.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([`"[]?[A-Za-z0-9_]+[`"\]]?)/i);
      if (!nameMatch) continue;
      entryFor(stripQuotes(nameMatch[1]).toLowerCase()).createTableStatements++;
      continue;
    }

    if (!upper.startsWith("INSERT") && !upper.startsWith("REPLACE")) continue;
    const nameMatch = statement.match(/(?:INSERT\s+(?:IGNORE\s+)?INTO|REPLACE\s+INTO)\s+([`"[]?[A-Za-z0-9_]+[`"\]]?)/i);
    if (!nameMatch) continue;
    const table = stripQuotes(nameMatch[1]).toLowerCase();
    const entry = entryFor(table);
    entry.insertStatements++;

    const afterTable = statement.slice(statement.indexOf(nameMatch[1]) + nameMatch[1].length);
    const valuesIdx = afterTable.search(/\bVALUES\b/i);
    if (valuesIdx === -1) continue;
    const valuesList = afterTable.slice(valuesIdx + "VALUES".length);
    for await (const _tuple of splitTuples(valuesList)) entry.rowCount++;
  }

  return [...counts.values()].sort((a, b) => b.rowCount - a.rowCount);
}

export async function* streamSqlTables(filePath: string, tables: string[]): AsyncGenerator<SqlRow> {
  const wantedNames = tables.map((t) => t.toLowerCase());
  const wanted = new Set(wantedNames);
  // WordPress's table prefix (`wp_` by default) is admin-configurable — a
  // common security-hardening practice — so a dump using e.g. `wpxx_users`
  // has no table literally named "wp_users", and every exact-match lookup
  // below would silently find nothing for the whole file (confirmed: this
  // was reported as "Total Rows = 0" / "Columns Detected = 0" on the
  // Customer Migration wizard's Preview step for a custom-prefix export).
  // Every caller in this codebase requests tables using the "wp_" convention
  // (see wooCustomerSqlSource.ts and siblings) — matching by the suffix
  // after the first underscore (e.g. "users", "usermeta") lets any actual
  // prefix resolve to the same request, without each SQL source needing its
  // own prefix-detection logic. `canonicalBySuffix` maps that suffix back to
  // the caller's originally-requested name, so a row's `table` field always
  // comes back as what the caller asked for — downstream code that branches
  // on `row.table` (e.g. wooContentSqlSource.ts comparing against
  // "wp_terms") keeps working unmodified regardless of the dump's real prefix.
  const canonicalBySuffix = new Map<string, string>();
  for (const name of wantedNames) {
    const idx = name.indexOf("_");
    if (idx > 0) canonicalBySuffix.set(name.slice(idx + 1), name);
  }
  const resolveTable = (rawTable: string): string | null => {
    if (wanted.has(rawTable)) return rawTable;
    const idx = rawTable.indexOf("_");
    if (idx <= 0) return null;
    return canonicalBySuffix.get(rawTable.slice(idx + 1)) ?? null;
  };

  const createColumns = new Map<string, string[]>();
  const reportedTables = new Set<string>();

  for await (const rawStatement of streamStatements(filePath)) {
    const statement = stripLeadingComments(rawStatement);
    if (!statement) continue;
    const upper = statement.slice(0, 20).toUpperCase();

    if (upper.startsWith("CREATE TABLE")) {
      const nameMatch = statement.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([`"[]?[A-Za-z0-9_]+[`"\]]?)/i);
      if (!nameMatch) continue;
      const table = resolveTable(stripQuotes(nameMatch[1]).toLowerCase());
      if (table) createColumns.set(table, parseCreateTableColumns(statement));
      continue;
    }

    // `REPLACE INTO` is a common mysqldump/phpMyAdmin alternative to `INSERT
    // INTO ... ON DUPLICATE KEY UPDATE` — functionally the same "write these
    // rows" statement, just a different keyword. Previously only `INSERT`
    // (optionally `INSERT IGNORE`) was recognized here, so a dump using
    // `REPLACE INTO` for its data statements was silently skipped in its
    // entirety — the same "Total Rows = 0" symptom as the prefix issue above.
    if (!upper.startsWith("INSERT") && !upper.startsWith("REPLACE")) continue;
    const nameMatch = statement.match(/(?:INSERT\s+(?:IGNORE\s+)?INTO|REPLACE\s+INTO)\s+([`"[]?[A-Za-z0-9_]+[`"\]]?)/i);
    if (!nameMatch) continue;
    const table = resolveTable(stripQuotes(nameMatch[1]).toLowerCase());
    if (!table) continue;
    if (!reportedTables.has(table)) {
      reportedTables.add(table);
      reportParsingProgress({ table });
    }

    // Optional explicit column list right after the table name: `(a, b, c)`,
    // distinct from the VALUES tuples that follow the VALUES keyword.
    let columns = createColumns.get(table) ?? [];
    const afterTable = statement.slice(statement.indexOf(nameMatch[1]) + nameMatch[1].length);
    const valuesIdx = afterTable.search(/\bVALUES\b/i);
    if (valuesIdx === -1) continue;
    const columnListPart = afterTable.slice(0, valuesIdx).trim();
    if (columnListPart.startsWith("(")) {
      const closeIdx = columnListPart.lastIndexOf(")");
      const rawCols = columnListPart.slice(1, closeIdx === -1 ? undefined : closeIdx);
      columns = rawCols.split(",").map((c) => stripQuotes(c));
    }
    if (!columns.length) continue; // no column info available at all — nothing safe to map

    const valuesList = afterTable.slice(valuesIdx + "VALUES".length);
    let tupleBatch = 0;
    for await (const tuple of splitTuples(valuesList)) {
      const parsed = parseValueTuple(tuple);
      const row: Record<string, string | null> = {};
      columns.forEach((col, i) => { row[col] = parsed[i] ?? null; });
      reportParsingProgress({ rowsProcessed: 1 });
      yield { table, values: row };
      if (++tupleBatch % 250 === 0) await yieldToEventLoop();
    }
  }
}
