// Rewards history exports: a spreadsheet (CSV) and a printable summary (PDF).
import { POT_LABEL, type Pot } from "./data";

export type HistoryLine = {
  day: string; at: string; what: string; note: string; stars: number; money: number; status: string; pot: Pot | null;
  starsAfter: number; moneyAfter: number;
};

/** a CSV cell; text that a spreadsheet would run as a formula is made safe */
function cell(v: string | number | null | undefined, text = true): string {
  let s = v == null ? "" : String(v);
  if (text && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const STATUS: Record<string, string> = { ok: "Added", waiting: "Waiting for a parent", declined: "Not added" };

export function historyCsv(lines: HistoryLine[], fileName: string) {
  const head = ["Date", "What", "Note", "Stars", "Money", "Pot", "Status", "Stars after", "Money after"];
  const out = [head.map((h) => cell(h)).join(",")];
  for (const l of [...lines].reverse()) {
    out.push([
      cell(l.day, false), cell(l.what), cell(l.note),
      cell(l.stars || "", false), cell(l.money ? l.money.toFixed(2) : "", false),
      cell(l.pot ? POT_LABEL[l.pot] : ""), cell(STATUS[l.status] ?? l.status),
      cell(l.stars ? l.starsAfter : "", false), cell(l.money ? l.moneyAfter.toFixed(2) : "", false),
    ].join(","));
  }
  save(new Blob(["﻿" + out.join("\r\n")], { type: "text/csv;charset=utf-8" }), fileName);
}

/** PDF fonts only cover Latin-1 */
const safe = (s: string) => s.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/★/g, "stars").replace(/[^\x20-\xFF\n]/g, "").trim();
const gbp = (n: number) => (n < 0 ? "-" : "") + "£" + Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDay = (k: string) => new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export async function historyPdf(lines: HistoryLine[], name: string, from: string, to: string, fileName: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 16, W = 210, BOTTOM = 282;
  let y = M;
  const need = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
  const row = (left: string, right: string, opts: { bold?: boolean; size?: number } = {}) => {
    const size = opts.size ?? 11;
    need(size * 0.5);
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(safe(left).slice(0, 80), M, y);
    if (right) doc.text(safe(right), W - M, y, { align: "right" });
    y += size * 0.5;
  };
  const ok = lines.filter((l) => l.status === "ok");
  row(`${name}: stars and money`, "", { bold: true, size: 18 });
  y += 1;
  row(`${longDay(from)} to ${longDay(to)}`, "", { size: 11 });
  y += 4;
  row("Stars earned", String(ok.filter((l) => l.stars > 0).reduce((n, l) => n + l.stars, 0)), { bold: true });
  row("Stars spent", String(-ok.filter((l) => l.stars < 0).reduce((n, l) => n + l.stars, 0)), { bold: true });
  row("Money in", gbp(ok.filter((l) => l.money > 0).reduce((n, l) => n + l.money, 0)), { bold: true });
  row("Money out", gbp(-ok.filter((l) => l.money < 0).reduce((n, l) => n + l.money, 0)), { bold: true });
  y += 4;
  // what it came from
  const kinds = new Map<string, { stars: number; money: number }>();
  for (const l of ok) {
    const k = kinds.get(l.what) ?? { stars: 0, money: 0 };
    k.stars += l.stars; k.money += l.money;
    kinds.set(l.what, k);
  }
  row("By kind", "", { bold: true, size: 13 });
  y += 1;
  for (const [k, v] of [...kinds.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    row(k, [v.stars ? `${v.stars > 0 ? "+" : ""}${v.stars} stars` : "", v.money ? gbp(v.money) : ""].filter(Boolean).join("   "));
  }
  y += 4;
  row("Every entry", "", { bold: true, size: 13 });
  y += 1;
  for (const l of [...lines].reverse()) {
    const amt = [l.stars ? `${l.stars > 0 ? "+" : ""}${l.stars} stars` : "", l.money ? gbp(l.money) : ""].filter(Boolean).join("  ");
    row(`${l.day}  ${l.what}${l.note ? ` - ${l.note}` : ""}${l.status !== "ok" ? ` (${STATUS[l.status] ?? l.status})` : ""}`, amt, { size: 9 });
  }
  doc.save(fileName);
}
