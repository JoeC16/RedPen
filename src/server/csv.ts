/**
 * Minimal RFC 4180 CSV parser: commas, double-quoted fields, "" escapes,
 * CRLF or LF line endings. Blank lines are skipped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/**
 * Serialise rows to CSV. Cells that a spreadsheet would treat as a formula
 * (starting with = + - @ tab or CR) are prefixed with a quote mark, so pupil
 * or teacher text can never run as a formula in the markbook.
 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export const PUPIL_CODE = /^[A-Za-z0-9_-]{1,32}$/;
export const MAX_PUPILS_PER_IMPORT = 200;

export type PupilImport = {
  rows: { code: string; name: string | null }[];
  errors: { line: number; message: string }[];
};

/**
 * Parse a class list. Needs a header row with a `code` column; a `name`
 * column is optional. Codes are case-sensitive and must be unique.
 */
export function parsePupilCsv(text: string): PupilImport {
  const all = parseCsv(text);
  const errors: PupilImport["errors"] = [];
  const header = all[0]?.map((h) => h.trim().toLowerCase());
  if (!header || !header.includes("code")) {
    return { rows: [], errors: [{ line: 1, message: "The first row must be a header with a 'code' column." }] };
  }
  const codeIdx = header.indexOf("code");
  const nameIdx = header.indexOf("name");
  const body = all.slice(1);
  if (body.length > MAX_PUPILS_PER_IMPORT) {
    return { rows: [], errors: [{ line: 1, message: `At most ${MAX_PUPILS_PER_IMPORT} pupils per import.` }] };
  }
  const seen = new Set<string>();
  const rows: PupilImport["rows"] = [];
  body.forEach((r, i) => {
    const line = i + 2;
    const code = (r[codeIdx] ?? "").trim();
    const name = nameIdx >= 0 ? (r[nameIdx] ?? "").trim() : "";
    if (!PUPIL_CODE.test(code)) {
      errors.push({ line, message: `Code "${code.slice(0, 40)}" must be 1 to 32 letters, digits, - or _.` });
    } else if (seen.has(code)) {
      errors.push({ line, message: `Code ${code} appears more than once.` });
    } else if (name.length > 100) {
      errors.push({ line, message: `Name for ${code} is longer than 100 characters.` });
    } else {
      seen.add(code);
      rows.push({ code, name: name || null });
    }
  });
  if (rows.length === 0 && errors.length === 0) errors.push({ line: 2, message: "No pupils found under the header." });
  return { rows, errors };
}
