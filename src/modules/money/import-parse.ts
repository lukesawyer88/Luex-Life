// Reading bank statements (CSV and OFX/QFX) into plain lines. Pure functions: no screens, no database.
import type { ImportMapping } from "./data";

/** One line from a statement. amount is signed: below zero is money out. */
export type StatementLine = { date: string; payee: string; amount: number; fitid: string | null };

// ---------------------------------------------------------------- CSV

/** Split CSV text into rows of cells (quotes, doubled quotes, commas/semicolons/tabs, a leading BOM, CRLF). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const sep = detectSeparator(src);
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === sep) { row.push(cell.trim()); cell = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((x) => x !== "")) out.push(row);
      row = []; cell = "";
      continue;
    }
    cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== "")) out.push(row);
  return out;
}

function detectSeparator(src: string): string {
  const sample = src.split(/\r?\n/).slice(0, 10).join("\n");
  const count = (ch: string) => {
    let n = 0; let q = false;
    for (const c of sample) { if (c === '"') q = !q; else if (!q && c === ch) n++; }
    return n;
  };
  const scores = [",", ";", "\t"].map((ch) => [ch, count(ch)] as const).sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 ? scores[0][0] : ",";
}

/** Index of the header row (the column names), or -1 when the file starts straight with data */
export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i];
    if (r.some((c) => /\bdate\b/i.test(c)) && r.filter((c) => c && parseAmount(c) === null).length >= 2) return i;
  }
  // no "date" heading: if the first row has no date in it, treat it as the header
  if (rows.length > 1 && !rows[0].some((c) => parseDate(c, "dmy") || parseDate(c, "ymd"))) return 0;
  return -1;
}

/** A bank's "fingerprint": its column names (or how many columns it has) */
export function csvSignature(rows: string[][], headerRow: number): string {
  if (headerRow >= 0) return rows[headerRow].map((c) => c.toLowerCase().replace(/\s+/g, " ").trim()).join("|").slice(0, 500);
  return `columns:${rows[0]?.length ?? 0}`;
}

/** A best guess at which column is which, from the column names and the first lines */
export function guessMapping(rows: string[][], headerRow: number): ImportMapping {
  const header = headerRow >= 0 ? rows[headerRow].map((c) => c.toLowerCase()) : [];
  const data = rows.slice(headerRow + 1, headerRow + 31);
  const width = Math.max(...rows.slice(0, 30).map((r) => r.length), 0);
  const find = (re: RegExp, not?: RegExp) => header.findIndex((h) => re.test(h) && !(not && not.test(h)));
  const nums = (i: number) => data.filter((r) => r[i] && parseAmount(r[i]) !== null).length;
  const dates = (i: number) => data.filter((r) => r[i] && (parseDate(r[i], "dmy") || parseDate(r[i], "ymd") || parseDate(r[i], "mdy"))).length;

  let date = find(/date/, /value date|process/);
  if (date < 0) date = find(/date/);
  if (date < 0) for (let i = 0; i < width; i++) if (dates(i) >= Math.max(1, data.length / 2)) { date = i; break; }
  let payee = find(/description|details|payee|narrative|merchant|counter ?party|transaction|name|memo|reference/, /date|amount|type|balance/);
  let out = find(/paid out|money out|debit|withdraw|spent/);
  let inn = find(/paid in|money in|credit|deposit|received/);
  let amount = find(/^amount|amount\b|value/, /balance/);
  if (out >= 0 && inn >= 0) amount = -1;
  if (amount < 0 && (out < 0 || inn < 0)) {
    out = -1; inn = -1;
    for (let i = 0; i < width; i++) if (i !== date && !/balance/.test(header[i] ?? "") && nums(i) >= Math.max(1, data.length / 2)) { amount = i; break; }
  }
  if (payee < 0) {
    let best = -1; let bestLen = 0;
    for (let i = 0; i < width; i++) {
      if (i === date || i === amount || i === out || i === inn) continue;
      const len = data.reduce((n, r) => n + (r[i] && parseAmount(r[i]) === null ? r[i].length : 0), 0);
      if (len > bestLen) { bestLen = len; best = i; }
    }
    payee = best;
  }
  return {
    date: Math.max(0, date),
    dateFormat: guessDateFormat(data.map((r) => r[Math.max(0, date)] ?? "")),
    payee: Math.max(0, payee),
    amount: amount >= 0 ? amount : null,
    out: amount >= 0 ? null : out,
    in: amount >= 0 ? null : inn,
    outIsPositive: false,
    skipRows: headerRow + 1,
  };
}

export function guessDateFormat(samples: string[]): ImportMapping["dateFormat"] {
  let dmy = false; let mdy = false;
  for (const s of samples) {
    const t = s.trim();
    if (/^\d{4}[-/.]/.test(t)) return "ymd";
    const m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ]\d{2,4}/.exec(t);
    if (m) { if (Number(m[1]) > 12) dmy = true; if (Number(m[2]) > 12) mdy = true; }
  }
  return mdy && !dmy ? "mdy" : "dmy";
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** A statement date as "YYYY-MM-DD", or null */
export function parseDate(s: string, fmt: ImportMapping["dateFormat"]): string | null {
  const t = (s ?? "").trim().replace(/T.*$/, "").replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, "");
  if (!t) return null;
  let y: number; let m: number; let d: number;
  let r = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = /^(\d{8})$/.exec(t))) { y = +t.slice(0, 4); m = +t.slice(4, 6); d = +t.slice(6, 8); }
  else if ((r = /^(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/. ,]+(\d{2,4})$/.exec(t))) {
    d = +r[1]; m = MONTHS[r[2].toLowerCase().slice(0, 3)] ?? 0; y = +r[3];
  } else if ((r = /^([A-Za-z]{3,9})[ -](\d{1,2}),?[ -](\d{2,4})$/.exec(t))) {
    m = MONTHS[r[1].toLowerCase().slice(0, 3)] ?? 0; d = +r[2]; y = +r[3];
  } else if ((r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(t))) {
    if (fmt === "mdy") { m = +r[1]; d = +r[2]; } else { d = +r[1]; m = +r[2]; }
    y = +r[3];
  } else return null;
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || y < 1990 || y > 2100) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > last) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "£1,234.50", "-12.00", "(12.00)", "12.00 DR", "1.234,50" → a number; null when it isn't one */
export function parseAmount(s: string): number | null {
  let t = (s ?? "").trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/\s*(DR|D)$/i.test(t)) { neg = true; t = t.replace(/\s*(DR|D)$/i, ""); }
  t = t.replace(/\s*(CR|C)$/i, "");
  t = t.replace(/[£$€\s ]|GBP|EUR|USD/gi, "");
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1); } else if (t.startsWith("+")) t = t.slice(1);
  if (t.endsWith("-")) { neg = !neg; t = t.slice(0, -1); }
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(t) || /^\d+,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}

/** Turn CSV rows into statement lines using a column mapping. Rows that don't make sense are left out (and counted). */
export function applyMapping(rows: string[][], map: ImportMapping): { lines: StatementLine[]; skipped: number } {
  const lines: StatementLine[] = [];
  let skipped = 0;
  for (const r of rows.slice(map.skipRows ?? 0)) {
    const date = parseDate(r[map.date] ?? "", map.dateFormat);
    let amount: number | null = null;
    if (map.amount != null) {
      const a = parseAmount(r[map.amount] ?? "");
      if (a !== null) amount = map.outIsPositive ? -a : a;
    } else {
      const o = map.out != null ? parseAmount(r[map.out] ?? "") : null;
      const i = map.in != null ? parseAmount(r[map.in] ?? "") : null;
      if (o) amount = -Math.abs(o);
      else if (i) amount = Math.abs(i);
      else if (o === 0 || i === 0) amount = 0;
    }
    if (!date || amount === null || amount === 0) { skipped++; continue; }
    lines.push({ date, payee: tidyPayee(r[map.payee] ?? ""), amount, fitid: null });
  }
  return { lines, skipped };
}

// ---------------------------------------------------------------- OFX / QFX

export function isOfx(text: string): boolean {
  return /OFXHEADER|<OFX>/i.test(text.slice(0, 2000));
}

/** Read the transactions in an OFX or QFX file (old SGML style, with or without closing tags) */
export function parseOfx(text: string): StatementLine[] {
  const out: StatementLine[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const raw of blocks) {
    const b = raw.split(/<\/STMTTRN>/i)[0];
    const tag = (name: string) => {
      const m = new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(b);
      return m ? decodeEntities(m[1].trim()) : "";
    };
    const date = parseDate(tag("DTPOSTED").slice(0, 8), "ymd");
    const amount = parseAmount(tag("TRNAMT"));
    if (!date || amount === null || amount === 0) continue;
    const name = tag("NAME");
    const memo = tag("MEMO");
    out.push({ date, payee: tidyPayee(name || memo), amount, fitid: tag("FITID") || null });
  }
  return out;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'");
}

// ---------------------------------------------------------------- matching

export function tidyPayee(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 120);
}

/** For comparing payees: lower case, letters and numbers only */
export function normPayee(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * A key for each line that stays the same if the same statement (or an overlapping one) is imported again:
 * account, date, amount, payee and the bank's own id when there is one, plus a count for identical lines.
 */
export function importKeys(lines: StatementLine[], accountId: string): string[] {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const base = [accountId, l.date, l.amount.toFixed(2), normPayee(l.payee).replace(/ /g, "").slice(0, 60), l.fitid ? l.fitid.slice(0, 60) : ""].join("|");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}#${n}`.slice(0, 200);
  });
}

/** Does a payment already typed in look like this statement line? (same day, amount and direction; payees agree or one is blank) */
export function looksSame(line: StatementLine, p: { on_date: string; amount: number | string; direction: string; payee: string }): boolean {
  if (p.on_date !== line.date) return false;
  if (Math.abs(Number(p.amount) - Math.abs(line.amount)) > 0.005) return false;
  if ((line.amount < 0 ? "out" : "in") !== p.direction) return false;
  const a = normPayee(p.payee);
  const b = normPayee(line.payee);
  if (!a || !b) return true;
  return a.includes(b) || b.includes(a) || a.split(" ")[0] === b.split(" ")[0];
}

/** The bill this line pays, if any: the bill's payee words appear in the line and it's within 5 days of the due date */
export function matchBill<B extends { id: string; payee_match: string | null; name: string; next_due: string }>(line: StatementLine, bills: B[]): B | null {
  if (line.amount >= 0) return null;
  const p = normPayee(line.payee);
  if (!p) return null;
  for (const b of bills) {
    const m = normPayee(b.payee_match || "");
    if (m.length < 2 || !p.includes(m)) continue;
    const days = Math.abs((Date.parse(line.date) - Date.parse(b.next_due)) / 86_400_000);
    if (days <= 5) return b;
  }
  return null;
}
