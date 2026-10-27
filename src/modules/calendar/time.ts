// Dates and times in the family's own time zone (not the device's), so everyone sees the same day.
// A "day key" is "YYYY-MM-DD" in the family's zone.

export type Parts = { y: number; m: number; d: number; h: number; mi: number; wd: number };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
    });
    fmtCache.set(tz, f);
  }
  return f;
}
const WD: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Wall-clock parts of an instant in a zone. wd: 1 = Monday ... 7 = Sunday */
export function parts(date: Date, tz: string): Parts {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(date)) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: WD[p.weekday] ?? 1 };
}

/** The instant when the wall clock in tz reads y-m-d h:mi (handles clock changes) */
export function fromWall(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess;
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(t), tz);
    const diff = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - guess;
    if (diff === 0) break;
    t -= diff;
  }
  return new Date(t);
}

export const pad = (n: number) => String(n).padStart(2, "0");
export function keyOf(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}
export function dayKey(date: Date, tz: string): string {
  const p = parts(date, tz);
  return keyOf(p.y, p.m, p.d);
}
export function splitKey(k: string): [number, number, number] {
  const [y, m, d] = k.split("-").map(Number);
  return [y, m, d];
}
/** Start of the day (00:00 in tz) */
export function dayStart(k: string, tz: string): Date {
  const [y, m, d] = splitKey(k);
  return fromWall(y, m, d, 0, 0, tz);
}
/** Add whole days to a day key (calendar maths, no time zone involved) */
export function addDays(k: string, n: number): string {
  const [y, m, d] = splitKey(k);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return keyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
export function addMonths(k: string, n: number): string {
  const [y, m] = splitKey(k);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return keyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, 1);
}
/** 1 = Monday ... 7 = Sunday */
export function weekdayOf(k: string): number {
  const [y, m, d] = splitKey(k);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}
export function weekStart(k: string, startsOn: 1 | 7 = 1): string {
  const wd = weekdayOf(k);
  const back = startsOn === 1 ? wd - 1 : wd % 7;
  return addDays(k, -back);
}
export function monthStart(k: string): string {
  const [y, m] = splitKey(k);
  return keyOf(y, m, 1);
}
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = splitKey(a);
  const [y2, m2, d2] = splitKey(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
export function todayKey(tz: string): string {
  return dayKey(new Date(), tz);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const monthName = (m: number) => MONTHS[m - 1];
export const dayName = (wd: number) => DAYS[wd - 1];
export const shortDay = (wd: number) => DAYS[wd - 1].slice(0, 3);

/** "Tuesday 27 October" */
export function longDate(k: string): string {
  const [, m, d] = splitKey(k);
  return `${dayName(weekdayOf(k))} ${d} ${monthName(m)}`;
}
/** "Tue 27 Oct" */
export function shortDate(k: string): string {
  const [, m, d] = splitKey(k);
  return `${shortDay(weekdayOf(k))} ${d} ${monthName(m).slice(0, 3)}`;
}
/** "17:30" */
export function timeOf(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${pad(p.h)}:${pad(p.mi)}`;
}
/** "HH:MM" -> minutes after midnight */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}
/** A day key and "HH:MM" in tz -> instant */
export function atTime(k: string, hhmm: string, tz: string): Date {
  const [y, m, d] = splitKey(k);
  const [h, mi] = hhmm.split(":").map(Number);
  return fromWall(y, m, d, h || 0, mi || 0, tz);
}
/** Friendly "in 3 days", "tomorrow", "today" */
export function relativeDays(from: string, to: string): string {
  const n = daysBetween(from, to);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
