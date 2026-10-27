// Repeating events: turning a stored rule (RFC 5545, e.g. "FREQ=WEEKLY;BYDAY=MO") into actual dates,
// always in the family's time zone so "every Monday at 17:00" stays at 17:00 when the clocks change.
import { RRule, rrulestr } from "rrule";

import { addDays, dayKey, daysBetween, fromWall, keyOf, monthName, pad, parts, shortDay, splitKey, weekdayOf } from "./time";

export type EventLike = {
  id: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  rrule: string | null;
  exdates: string[];
  recurrence_of: string | null;
  recurrence_date: string | null;
  deleted_at?: string | null;
};

export type Occurrence<E extends EventLike> = {
  /** unique per occurrence */
  key: string;
  /** the row to show (an override row when this one date was changed) */
  event: E;
  /** the series this belongs to (its own id when it doesn't repeat) */
  seriesId: string;
  /** when this occurrence was originally due (for "just this one" changes) */
  originalStart: Date;
  start: Date;
  end: Date;
  allDay: boolean;
  startDay: string;
  /** last day it covers (inclusive) */
  endDay: string;
  repeats: boolean;
};

/** "Floating" time: the wall-clock reading stored as if it were UTC, which is what the repeat maths works in */
function toFloating(d: Date, tz: string): Date {
  const p = parts(d, tz);
  return new Date(Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi));
}
function fromFloating(f: Date, tz: string): Date {
  return fromWall(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate(), f.getUTCHours(), f.getUTCMinutes(), tz);
}
function wallKey(d: Date, tz: string): string {
  const p = parts(d, tz);
  return `${keyOf(p.y, p.m, p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

function makeOcc<E extends EventLike>(ev: E, seriesId: string, originalStart: Date, tz: string, repeats: boolean): Occurrence<E> {
  const start = new Date(ev.starts_at);
  const end = new Date(ev.ends_at);
  const startDay = dayKey(start, tz);
  let endDay: string;
  if (ev.all_day) endDay = dayKey(end, tz);
  else {
    // an event ending exactly at midnight belongs to the day before
    const e2 = new Date(Math.max(start.getTime(), end.getTime() - 1));
    endDay = dayKey(e2, tz);
  }
  return { key: `${seriesId}:${originalStart.toISOString()}`, event: ev, seriesId, originalStart, start, end, allDay: ev.all_day, startDay, endDay, repeats };
}

/** Every occurrence that touches [from, to) */
export function expand<E extends EventLike>(events: E[], from: Date, to: Date, tz: string, maxPerSeries = 800): Occurrence<E>[] {
  const out: Occurrence<E>[] = [];
  const overrides = new Map<string, Map<string, E>>();
  const live = events.filter((e) => !e.deleted_at);
  const masterIds = new Set(live.filter((e) => !e.recurrence_of).map((e) => e.id));
  for (const e of live) {
    if (!e.recurrence_of || !e.recurrence_date) continue;
    if (!masterIds.has(e.recurrence_of)) {
      // its series isn't loaded: show it on its own
      const o = makeOcc(e, e.recurrence_of, new Date(e.recurrence_date), tz, true);
      if (o.start < to && o.end >= from) out.push(o);
      continue;
    }
    let m = overrides.get(e.recurrence_of);
    if (!m) overrides.set(e.recurrence_of, (m = new Map()));
    m.set(wallKey(new Date(e.recurrence_date), tz), e);
  }

  for (const ev of live) {
    if (ev.recurrence_of) continue;
    const start = new Date(ev.starts_at);
    const end = new Date(ev.ends_at);
    if (!ev.rrule) {
      const o = makeOcc(ev, ev.id, start, tz, false);
      if (o.start < to && (o.end > from || o.start >= from || (o.allDay && o.endDay >= dayKey(from, tz)))) out.push(o);
      continue;
    }
    const dur = end.getTime() - start.getTime();
    const spanDays = ev.all_day ? daysBetween(dayKey(start, tz), dayKey(end, tz)) : 0;
    const fStart = toFloating(start, tz);
    let rule: RRule;
    try {
      rule = rrulestr(ev.rrule, { dtstart: fStart }) as RRule;
    } catch {
      continue;
    }
    // look back far enough to catch long events that started before the window
    const lookBack = ev.all_day ? (spanDays + 1) * 86400000 : dur + 86400000;
    const fFrom = new Date(toFloating(from, tz).getTime() - lookBack);
    const fTo = toFloating(to, tz);
    const ex = new Set((ev.exdates ?? []).map((x) => wallKey(new Date(x), tz)));
    const ovs = overrides.get(ev.id);
    const dates = rule.between(fFrom, fTo, true, (_d, i) => i < maxPerSeries);
    for (const f of dates) {
      const orig = fromFloating(f, tz);
      const wk = wallKey(orig, tz);
      if (ex.has(wk)) continue;
      const ov = ovs?.get(wk);
      if (ov) {
        const o = makeOcc(ov, ev.id, orig, tz, true);
        if (o.start < to && o.end >= from) out.push(o);
        continue;
      }
      let oStart: Date;
      let oEnd: Date;
      if (ev.all_day) {
        const k = dayKey(orig, tz);
        const [y, m, d] = splitKey(addDays(k, spanDays));
        oStart = orig;
        oEnd = fromWall(y, m, d, 0, 0, tz);
      } else {
        oStart = orig;
        oEnd = new Date(orig.getTime() + dur);
      }
      const o = makeOcc({ ...ev, starts_at: oStart.toISOString(), ends_at: oEnd.toISOString() }, ev.id, orig, tz, true);
      if (o.start < to && (o.end > from || (o.allDay && o.endDay >= dayKey(from, tz)))) out.push(o);
    }
  }
  out.sort((a, b) => (a.allDay === b.allDay ? a.start.getTime() - b.start.getTime() : a.allDay ? -1 : 1));
  return out;
}

/** Does an occurrence cover a day? */
export function onDay(o: { startDay: string; endDay: string }, k: string): boolean {
  return o.startDay <= k && o.endDay >= k;
}

/** Next date a repeating rule falls on, on or after a day (used for chores) */
export function datesBetween(rule: string, startKey: string, fromKey: string, toKey: string): string[] {
  const [y, m, d] = splitKey(startKey);
  let r: RRule;
  try {
    r = rrulestr(rule, { dtstart: new Date(Date.UTC(y, m - 1, d, 12)) }) as RRule;
  } catch {
    return [];
  }
  const [y1, m1, d1] = splitKey(fromKey);
  const [y2, m2, d2] = splitKey(toKey);
  return r
    .between(new Date(Date.UTC(y1, m1 - 1, d1)), new Date(Date.UTC(y2, m2 - 1, d2, 23, 59)), true, (_x, i) => i < 1000)
    .map((x) => keyOf(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()));
}

/** How many times a rule has happened from its start up to (not including) a day: used for whose turn it is */
export function countBefore(rule: string, startKey: string, k: string): number {
  if (k <= startKey) return 0;
  return datesBetween(rule, startKey, startKey, addDays(k, -1)).length;
}

// ---------------------------------------------------------------- the repeat picker

export type RepeatPreset = "none" | "daily" | "weekdays" | "weekly" | "fortnightly" | "monthly" | "monthly-weekday" | "quarterly" | "yearly" | "custom";

export type RepeatSpec = {
  preset: RepeatPreset;
  /** custom only */
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  /** 1 = Monday ... 7 = Sunday */
  days: number[];
  ends: "never" | "on" | "after";
  until: string;
  count: number;
};

const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export function defaultSpec(startKey: string): RepeatSpec {
  return { preset: "none", freq: "WEEKLY", interval: 1, days: [weekdayOf(startKey)], ends: "never", until: addDays(startKey, 90), count: 10 };
}

/** nth weekday of the month for a day: [n, weekday] with n = -1 for "last" */
export function nthWeekday(k: string): [number, number] {
  const [, , d] = splitKey(k);
  const n = Math.ceil(d / 7);
  const nextWeek = addDays(k, 7);
  const isLast = splitKey(nextWeek)[1] !== splitKey(k)[1];
  return [isLast && n >= 4 ? -1 : n, weekdayOf(k)];
}

export function specToRule(spec: RepeatSpec, startKey: string): string | null {
  let core: string;
  switch (spec.preset) {
    case "none": return null;
    case "daily": core = "FREQ=DAILY"; break;
    case "weekdays": core = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"; break;
    case "weekly": core = `FREQ=WEEKLY;BYDAY=${BYDAY[weekdayOf(startKey) - 1]}`; break;
    case "fortnightly": core = `FREQ=WEEKLY;INTERVAL=2;BYDAY=${BYDAY[weekdayOf(startKey) - 1]}`; break;
    case "monthly": core = "FREQ=MONTHLY"; break;
    case "monthly-weekday": {
      const [n, wd] = nthWeekday(startKey);
      core = `FREQ=MONTHLY;BYDAY=${n}${BYDAY[wd - 1]}`;
      break;
    }
    case "quarterly": core = "FREQ=MONTHLY;INTERVAL=3"; break;
    case "yearly": core = "FREQ=YEARLY"; break;
    case "custom": {
      const iv = Math.max(1, Math.min(99, Math.round(spec.interval || 1)));
      core = `FREQ=${spec.freq}` + (iv > 1 ? `;INTERVAL=${iv}` : "");
      if (spec.freq === "WEEKLY") {
        const ds = (spec.days.length ? spec.days : [weekdayOf(startKey)]).slice().sort();
        core += `;BYDAY=${ds.map((x) => BYDAY[x - 1]).join(",")}`;
      }
      break;
    }
  }
  if (spec.ends === "on" && spec.until) {
    const [y, m, d] = splitKey(spec.until);
    core += `;UNTIL=${y}${pad(m)}${pad(d)}T235959Z`;
  } else if (spec.ends === "after") {
    core += `;COUNT=${Math.max(1, Math.min(999, Math.round(spec.count || 1)))}`;
  }
  return core;
}

function field(rule: string, name: string): string | undefined {
  return rule.split(";").find((p) => p.startsWith(name + "="))?.slice(name.length + 1);
}

export function ruleToSpec(rule: string | null, startKey: string): RepeatSpec {
  const spec = defaultSpec(startKey);
  if (!rule) return spec;
  const freq = (field(rule, "FREQ") ?? "WEEKLY") as RepeatSpec["freq"];
  const interval = Number(field(rule, "INTERVAL") ?? 1);
  const byday = field(rule, "BYDAY");
  const until = field(rule, "UNTIL");
  const count = field(rule, "COUNT");
  if (until) {
    spec.ends = "on";
    spec.until = `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`;
  } else if (count) {
    spec.ends = "after";
    spec.count = Number(count);
  }
  spec.freq = freq;
  spec.interval = interval;
  const wd = BYDAY[weekdayOf(startKey) - 1];
  if (byday && freq === "WEEKLY") spec.days = byday.split(",").map((x) => BYDAY.indexOf(x) + 1).filter((x) => x > 0);
  if (freq === "DAILY" && interval === 1) spec.preset = "daily";
  else if (freq === "WEEKLY" && byday === "MO,TU,WE,TH,FR" && interval === 1) spec.preset = "weekdays";
  else if (freq === "WEEKLY" && byday === wd && interval === 1) spec.preset = "weekly";
  else if (freq === "WEEKLY" && byday === wd && interval === 2) spec.preset = "fortnightly";
  else if (freq === "MONTHLY" && !byday && interval === 1) spec.preset = "monthly";
  else if (freq === "MONTHLY" && byday && /^-?\d[A-Z]{2}$/.test(byday) && interval === 1) spec.preset = "monthly-weekday";
  else if (freq === "MONTHLY" && !byday && interval === 3) spec.preset = "quarterly";
  else if (freq === "YEARLY" && interval === 1) spec.preset = "yearly";
  else spec.preset = "custom";
  return spec;
}

const ORD = ["", "first", "second", "third", "fourth", "fifth"];

/** Plain English: "Every 2 weeks on Mon and Wed, until 20 Dec 2026" */
export function describeRule(rule: string | null, startKey: string): string {
  if (!rule) return "Does not repeat";
  const freq = field(rule, "FREQ");
  const interval = Number(field(rule, "INTERVAL") ?? 1);
  const byday = field(rule, "BYDAY");
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[freq ?? "WEEKLY"] ?? "week";
  let s: string;
  if (freq === "WEEKLY" && byday === "MO,TU,WE,TH,FR" && interval === 1) s = "Every weekday";
  else if (interval === 1) s = unit === "day" ? "Every day" : `Every ${unit}`;
  else if (interval === 2 && unit === "week") s = "Every other week";
  else s = `Every ${interval} ${unit}s`;
  if (freq === "WEEKLY" && byday && byday !== "MO,TU,WE,TH,FR") {
    const names = byday.split(",").map((x) => shortDay(BYDAY.indexOf(x) + 1));
    s += ` on ${names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0]}`;
  }
  if (freq === "MONTHLY") {
    if (byday && /^-?\d[A-Z]{2}$/.test(byday)) {
      const n = Number(byday.slice(0, -2));
      s += ` on the ${n === -1 ? "last" : ORD[n]} ${shortDay(BYDAY.indexOf(byday.slice(-2)) + 1)}`;
    } else s += ` on the ${splitKey(startKey)[2]}${suffix(splitKey(startKey)[2])}`;
  }
  if (freq === "YEARLY") {
    const [, m, d] = splitKey(startKey);
    s += ` on ${d} ${monthName(m)}`;
  }
  const until = field(rule, "UNTIL");
  const count = field(rule, "COUNT");
  if (until) s += `, until ${Number(until.slice(6, 8))} ${monthName(Number(until.slice(4, 6))).slice(0, 3)} ${until.slice(0, 4)}`;
  else if (count) s += `, ${count} times`;
  return s;
}

function suffix(n: number) {
  if (n >= 11 && n <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

/** End a series just before a date (for "this and all after" changes) */
export function untilBefore(rule: string, cut: Date, tz: string): string {
  const prevDay = addDays(dayKey(cut, tz), -1);
  const [y, m, d] = splitKey(prevDay);
  const kept = rule.split(";").filter((p) => !p.startsWith("UNTIL=") && !p.startsWith("COUNT="));
  return [...kept, `UNTIL=${y}${pad(m)}${pad(d)}T235959Z`].join(";");
}

/** Remove UNTIL/COUNT so a split-off series doesn't inherit an end that no longer fits */
export function withoutCount(rule: string): string {
  return rule.split(";").filter((p) => !p.startsWith("COUNT=")).join(";");
}
