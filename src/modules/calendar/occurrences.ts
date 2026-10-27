// Turns stored events plus birthdays and Christmas into the list of things to show for a time window.
import { useMemo } from "react";

import type { Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";

import { prefsOf, useEvents, type CalEvent } from "./data";
import { expand, type Occurrence } from "./recurrence";
import { addDays, dayKey, dayStart, fromWall, splitKey } from "./time";

export type Virtual = { kind: "birthday" | "christmas"; memberId?: string; age?: number; year: number };
export type Occ = Occurrence<CalEvent> & { virtual?: Virtual };

function virtualEvent(id: string, familyId: string, title: string, type: string, k: string, tz: string): CalEvent {
  const [y, m, d] = splitKey(k);
  const at = fromWall(y, m, d, 0, 0, tz).toISOString();
  return {
    id, family_id: familyId, title, type, all_day: true, starts_at: at, ends_at: at, rrule: null, exdates: [], recurrence_of: null,
    recurrence_date: null, people: [], visibility: "all", viewers: [], driver: null, place_id: null, location: null, travel_minutes: null,
    reminders: [], notes: null, booking_ref: null, link: null, countdown: false, done_at: null, source: "manual", feed_id: null,
    external_key: null, created_by_member: null, updated_by_member: null, version: 0, created_at: at, updated_at: at, deleted_at: null,
  } as CalEvent;
}

/** Birthdays (from each person's profile) and Christmas, for the days in [fromK, toK] */
export function virtualOccs(members: Member[], familyId: string, fromK: string, toK: string, tz: string, christmas: boolean): Occ[] {
  const out: Occ[] = [];
  const [y1] = splitKey(fromK);
  const [y2] = splitKey(toK);
  for (let y = y1; y <= y2; y++) {
    for (const m of members) {
      if (!m.birthday) continue;
      const [by, bm, bd] = splitKey(m.birthday);
      // 29 February birthdays show on 28 February in other years
      const day = bm === 2 && bd === 29 && new Date(Date.UTC(y, 1, 29)).getUTCMonth() !== 1 ? 28 : bd;
      const k = `${y}-${String(bm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (k < fromK || k > toK) continue;
      const age = y - by;
      const ev = virtualEvent(`bday-${m.id}-${y}`, familyId, `${m.display_name}'s birthday${age > 0 && age < 120 ? ` (${age})` : ""}`, "birthday", k, tz);
      ev.people = [m.id];
      const start = dayStart(k, tz);
      out.push({ key: ev.id, event: ev, seriesId: ev.id, originalStart: start, start, end: start, allDay: true, startDay: k, endDay: k, repeats: true, virtual: { kind: "birthday", memberId: m.id, age, year: y } });
    }
    if (christmas) {
      const k = `${y}-12-25`;
      if (k >= fromK && k <= toK) {
        const ev = virtualEvent(`xmas-${y}`, familyId, "Christmas Day", "social", k, tz);
        const start = dayStart(k, tz);
        out.push({ key: ev.id, event: ev, seriesId: ev.id, originalStart: start, start, end: start, allDay: true, startDay: k, endDay: k, repeats: true, virtual: { kind: "christmas", year: y } });
      }
    }
  }
  return out;
}

/** Everything to show between two day keys (inclusive), filtered to the chosen people */
export function useOccurrences(fromK: string, toK: string, peopleFilter: string[]) {
  const { family, members } = useFamilyState();
  const tz = family.timezone;
  const from = useMemo(() => dayStart(fromK, tz), [fromK, tz]);
  const to = useMemo(() => dayStart(addDays(toK, 1), tz), [toK, tz]);
  const q = useEvents(from, to);
  const christmas = prefsOf(family).christmas !== false;
  const occs = useMemo(() => {
    const real: Occ[] = expand(q.data ?? [], from, to, tz);
    const all = [...virtualOccs(members, family.id, fromK, toK, tz, christmas), ...real];
    const filtered = peopleFilter.length
      ? all.filter((o) => o.event.people.length === 0 || o.event.people.some((p) => peopleFilter.includes(p)) || (o.event.driver && peopleFilter.includes(o.event.driver)))
      : all;
    return filtered.sort((a, b) => (a.allDay === b.allDay ? a.start.getTime() - b.start.getTime() : a.allDay ? -1 : 1));
  }, [q.data, from, to, tz, members, family.id, fromK, toK, christmas, peopleFilter]);
  return { occs, isLoading: q.isLoading, error: q.error, events: q.data ?? [] };
}

/** Group occurrences by each day they cover */
export function byDay(occs: Occ[], fromK: string, toK: string): Map<string, Occ[]> {
  const map = new Map<string, Occ[]>();
  for (let k = fromK; k <= toK; k = addDays(k, 1)) map.set(k, []);
  for (const o of occs) {
    let k = o.startDay < fromK ? fromK : o.startDay;
    const last = o.endDay > toK ? toK : o.endDay;
    for (; k <= last; k = addDays(k, 1)) map.get(k)?.push(o);
  }
  return map;
}

/** Things that clash: same person (or the same driver) at overlapping times */
export function findClashes(
  draft: { start: Date; end: Date; allDay: boolean; people: string[]; driver: string | null; ignoreSeries?: string },
  occs: Occ[],
): { occ: Occ; why: "person" | "driver"; memberId: string }[] {
  if (draft.allDay) return [];
  const out: { occ: Occ; why: "person" | "driver"; memberId: string }[] = [];
  for (const o of occs) {
    if (o.allDay || o.virtual || o.seriesId === draft.ignoreSeries || o.event.type === "reminder") continue;
    if (!(o.start < draft.end && o.end > draft.start)) continue;
    const shared = draft.people.find((p) => o.event.people.includes(p));
    if (shared) out.push({ occ: o, why: "person", memberId: shared });
    else if (draft.driver && (o.event.driver === draft.driver)) out.push({ occ: o, why: "driver", memberId: draft.driver });
  }
  return out;
}

export { dayKey };
