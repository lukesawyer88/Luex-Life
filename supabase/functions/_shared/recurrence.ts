// Repeating events on the server: the same maths as src/modules/calendar/recurrence.ts (keep them in step).
import { type RRule, rrulestr } from "./rrule.ts";
import { addDays, dayKey, daysBetween, fromWall, keyOf, pad, parts, splitKey } from "./time.ts";

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
  event: E;
  seriesId: string;
  originalStart: Date;
  start: Date;
  end: Date;
  allDay: boolean;
  startDay: string;
  endDay: string;
};

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

function makeOcc<E extends EventLike>(ev: E, seriesId: string, originalStart: Date, tz: string): Occurrence<E> {
  const start = new Date(ev.starts_at);
  const end = new Date(ev.ends_at);
  const startDay = dayKey(start, tz);
  const endDay = ev.all_day ? dayKey(end, tz) : dayKey(new Date(Math.max(start.getTime(), end.getTime() - 1)), tz);
  return { event: ev, seriesId, originalStart, start, end, allDay: ev.all_day, startDay, endDay };
}

/** Every occurrence that starts in [from, to) (the server only needs starts) */
export function expandStarts<E extends EventLike>(events: E[], from: Date, to: Date, tz: string, maxPerSeries = 400): Occurrence<E>[] {
  const out: Occurrence<E>[] = [];
  const live = events.filter((e) => !e.deleted_at);
  const masters = new Map(live.filter((e) => !e.recurrence_of).map((e) => [e.id, e]));
  const overrides = new Map<string, Map<string, E>>();
  for (const e of live) {
    if (!e.recurrence_of || !e.recurrence_date) continue;
    if (!masters.has(e.recurrence_of)) {
      const o = makeOcc(e, e.recurrence_of, new Date(e.recurrence_date), tz);
      if (o.start >= from && o.start < to) out.push(o);
      continue;
    }
    let m = overrides.get(e.recurrence_of);
    if (!m) overrides.set(e.recurrence_of, (m = new Map()));
    m.set(wallKey(new Date(e.recurrence_date), tz), e);
  }
  for (const ev of masters.values()) {
    const start = new Date(ev.starts_at);
    const end = new Date(ev.ends_at);
    if (!ev.rrule) {
      if (start >= from && start < to) out.push(makeOcc(ev, ev.id, start, tz));
      continue;
    }
    const dur = end.getTime() - start.getTime();
    const spanDays = ev.all_day ? daysBetween(dayKey(start, tz), dayKey(end, tz)) : 0;
    let rule: RRule;
    try {
      rule = rrulestr(ev.rrule, { dtstart: toFloating(start, tz) }) as RRule;
    } catch {
      continue;
    }
    const ex = new Set((ev.exdates ?? []).map((x) => wallKey(new Date(x), tz)));
    const ovs = overrides.get(ev.id);
    // a day either side, because floating time and real time differ by the zone's offset
    const fFrom = new Date(toFloating(from, tz).getTime() - 86400000);
    const fTo = new Date(toFloating(to, tz).getTime() + 86400000);
    for (const f of rule.between(fFrom, fTo, true, (_d, i) => i < maxPerSeries)) {
      const orig = fromFloating(f, tz);
      const wk = wallKey(orig, tz);
      if (ex.has(wk)) continue;
      const ov = ovs?.get(wk);
      let o: Occurrence<E>;
      if (ov) o = makeOcc(ov, ev.id, orig, tz);
      else {
        let oEnd: Date;
        if (ev.all_day) {
          const [y, m, d] = splitKey(addDays(dayKey(orig, tz), spanDays));
          oEnd = fromWall(y, m, d, 0, 0, tz);
        } else oEnd = new Date(orig.getTime() + dur);
        o = makeOcc({ ...ev, starts_at: orig.toISOString(), ends_at: oEnd.toISOString() }, ev.id, orig, tz);
      }
      if (o.start >= from && o.start < to) out.push(o);
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}
