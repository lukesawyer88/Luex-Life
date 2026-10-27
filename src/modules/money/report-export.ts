// Exports: every payment as a spreadsheet (CSV) and a printable summary (PDF).
import type { Member } from "@/lib/family";

import { byCategory, catLabel, sum } from "./budget-helpers";
import type { Account, Bill, Category, Payment } from "./data";

export type ExportLookups = { cats: Category[]; accounts: Account[]; bills: Bill[]; members: Member[] };

const SOURCE: Record<Payment["source"], string> = { manual: "Added by hand", import: "Imported", food: "From Food", bill: "Direct debit" };

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

export function paymentsCsv(list: Payment[], l: ExportLookups, fileName: string) {
  const name = (id: string | null) => (id ? l.members.find((m) => m.id === id)?.display_name ?? "" : "");
  const head = ["Date", "In or out", "Amount", "Currency", "Amount in pounds", "Who or what", "Category", "Account", "Note", "Paid by", "In the budget", "Child", "Bill", "How it was added", "Only me"];
  const lines = [head.map((h) => cell(h)).join(",")];
  for (const p of [...list].sort((a, b) => a.on_date.localeCompare(b.on_date))) {
    lines.push([
      cell(p.on_date, false),
      cell(p.direction === "in" ? "Money in" : "Money out"),
      cell(Number(p.amount).toFixed(2), false),
      cell(p.currency),
      cell(Number(p.amount_gbp).toFixed(2), false),
      cell(p.payee),
      cell(p.category_id ? l.cats.find((c) => c.id === p.category_id)?.name ?? "" : ""),
      cell(p.account_id ? l.accounts.find((a) => a.id === p.account_id)?.name ?? "" : ""),
      cell(p.note),
      cell(name(p.paid_by)),
      cell(p.in_budget ? "Yes" : "No"),
      cell(name(p.child_id)),
      cell(p.bill_id ? l.bills.find((b) => b.id === p.bill_id)?.name ?? "" : ""),
      cell(SOURCE[p.source] ?? p.source),
      cell(p.private_to ? "Yes" : "No"),
    ].join(","));
  }
  save(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), fileName);
}

/** PDF fonts only cover Latin-1 */
const safe = (s: string) => s.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\xFF\n]/g, "").trim();
const gbp = (n: number) => "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function summaryPdf(list: Payment[], l: ExportLookups, from: string, to: string, fileName: string) {
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
    doc.text(safe(left).slice(0, 70), M, y);
    if (right) doc.text(safe(right), W - M, y, { align: "right" });
    y += size * 0.5;
  };
  const counted = list.filter((p) => p.in_budget);
  const out = counted.filter((p) => p.direction === "out");
  const inn = counted.filter((p) => p.direction === "in");
  const day = (k: string) => new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  row("Household money summary", "", { bold: true, size: 18 });
  y += 2;
  row(`${day(from)} to ${day(to)}`, "", { size: 11 });
  y += 4;
  row("Money in", gbp(sum(inn)), { bold: true });
  row("Money out", gbp(sum(out)), { bold: true });
  row("Difference", gbp(sum(inn) - sum(out)), { bold: true });
  y += 4;

  row("Money out by category", "", { bold: true, size: 13 });
  y += 1;
  for (const [id, n] of [...byCategory(out).entries()].sort((a, b) => b[1] - a[1])) row(catLabel(l.cats.find((c) => c.id === id)), gbp(n));
  y += 4;

  const months = new Map<string, { in: number; out: number }>();
  for (const p of counted) {
    const k = p.on_date.slice(0, 7);
    const m = months.get(k) ?? { in: 0, out: 0 };
    if (p.direction === "in") m.in += Number(p.amount_gbp); else m.out += Number(p.amount_gbp);
    months.set(k, m);
  }
  row("Month by month (in / out)", "", { bold: true, size: 13 });
  y += 1;
  for (const [k, m] of [...months.entries()].sort()) {
    const label = new Date(k + "-01T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    row(label, `${gbp(m.in)}  /  ${gbp(m.out)}`);
  }
  y += 4;
  const skipped = list.length - counted.length;
  row(`${list.length} payments${skipped ? `, ${skipped} not counted in the budget` : ""}. Made with Luex Life.`, "", { size: 9 });
  doc.save(fileName);
}
