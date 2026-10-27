// Due-day maths for bills (shared with other Money screens).
import { addDaysKey, addMonthsKey, type Bill, type Every } from "./data";

/** Every due day of a bill from its next due date up to (and including) `to` */
export function billDueDays(b: Pick<Bill, "next_due" | "every">, to: string, max = 60): string[] {
  const out: string[] = [];
  for (let i = 0; i < max; i++) {
    let d: string;
    switch (b.every as Every) {
      case "week": d = addDaysKey(b.next_due, 7 * i); break;
      case "four_weeks": d = addDaysKey(b.next_due, 28 * i); break;
      case "month": d = addMonthsKey(b.next_due, i); break;
      case "quarter": d = addMonthsKey(b.next_due, 3 * i); break;
      default: d = addMonthsKey(b.next_due, 12 * i);
    }
    if (d > to) break;
    out.push(d);
  }
  return out;
}
