// Small sums shared by This month and Reports.
import type { Category, Payment } from "./data";

/** payments that count towards the budget, in one direction, between two dates (inclusive) */
export function counted(list: Payment[], dir: "in" | "out", from: string, to: string): Payment[] {
  return list.filter((p) => p.in_budget && p.direction === dir && p.on_date >= from && p.on_date <= to);
}

export function sum(list: Payment[]): number {
  return list.reduce((n, p) => n + Number(p.amount_gbp), 0);
}

/** total per category id ("" = no category) */
export function byCategory(list: Payment[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of list) {
    const k = p.category_id ?? "";
    m.set(k, (m.get(k) ?? 0) + Number(p.amount_gbp));
  }
  return m;
}

export function catLabel(c: Category | undefined): string {
  if (!c) return "No category";
  return `${c.emoji ? c.emoji + " " : ""}${c.name}`;
}

/** "YYYY-MM" month keys, oldest first, ending with the month of `day` */
export function lastMonths(day: string, n: number): string[] {
  const [y, m] = day.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function monthShort(ym: string): string {
  return new Date(ym + "-01T12:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
}
