// Shared CSV-cell escaping for every client-side report export
// (reportExport.ts, migrationReportExport.ts, mediaMigrationReportExport.ts)
// — previously each file had its own copy of this exact function. Browser
// code only (no "server-only" import, no Node built-ins), since all three
// callers build their CSV directly in the admin's browser from data already
// in page state.
//
// Beyond quoting on comma/quote/newline, a cell whose value starts with
// `=`, `+`, `-`, or `@` is prefixed with a leading `'` before quoting. Excel
// and Google Sheets treat a leading `=`/`+`/`-`/`@` as the start of a
// formula regardless of the surrounding quotes, so a value that reaches
// this function from imported/external data (e.g. a WooCommerce attribute
// name flowing into the Compatibility Analysis report) could otherwise
// execute as a formula the moment an admin opens the downloaded file —
// classic CSV/formula injection. The leading apostrophe forces spreadsheet
// software to treat the cell as literal text instead.
export function csvEscape(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
