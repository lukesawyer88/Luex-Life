// Dates and times in a family's own time zone (copied from src/modules/calendar/time.ts, server side).
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

export function validZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function parts(date: Date, tz: string): Parts {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(date)) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: WD[p.weekday] ?? 1 };
}

/** The instant when the wall clock in tz reads y-m-d h:mi:s */
export function fromWall(y: number, m: number, d: number, h: number, mi: number, tz: string, s = 0): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess;
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(t), tz);
    const diff = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - guess;
    if (diff === 0) break;
    t -= diff;
  }
  return new Date(t + s * 1000);
}

export const pad = (n: number) => String(n).padStart(2, "0");
export const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export function dayKey(date: Date, tz: string): string {
  const p = parts(date, tz);
  return keyOf(p.y, p.m, p.d);
}
export function splitKey(k: string): [number, number, number] {
  const [y, m, d] = k.split("-").map(Number);
  return [y, m, d];
}
export function dayStart(k: string, tz: string): Date {
  const [y, m, d] = splitKey(k);
  return fromWall(y, m, d, 0, 0, tz);
}
export function atTime(k: string, h: number, mi: number, tz: string): Date {
  const [y, m, d] = splitKey(k);
  return fromWall(y, m, d, h, mi, tz);
}
export function addDays(k: string, n: number): string {
  const [y, m, d] = splitKey(k);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return keyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
export function weekdayOf(k: string): number {
  const [y, m, d] = splitKey(k);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = splitKey(a);
  const [y2, m2, d2] = splitKey(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
export function timeOf(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${pad(p.h)}:${pad(p.mi)}`;
}
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const dayName = (wd: number) => DAYS[wd - 1];
