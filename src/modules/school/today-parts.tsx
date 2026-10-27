// Small pieces shared by Today and The week: what a child's day looks like, worked out from the set-up.
import type { Member } from "@/lib/family";

import { eventOnDay, hhmm, runFor, timeIn, weekdayOf, type RunChange, type SchoolSetup, type Task } from "./data";

export type DayPlan = {
  bring: string[];
  lunch: "dinner" | "packed" | null;
  clubs: { id: string; title: string; time: string; kit: string[] }[];
  run: ReturnType<typeof runFor>;
  due: Task[];
};

/** Everything about one child's day */
export function dayPlan(setup: SchoolSetup, changes: RunChange[], tasks: Task[], childId: string, dayKey: string, tz: string, dueUntil?: string): DayPlan {
  const wd = weekdayOf(dayKey);
  const d = setup.days.find((x) => x.member_id === childId && x.weekday === wd);
  const events = new Map(setup.events.map((e) => [e.id, e]));
  const clubs = setup.activities
    .filter((a) => a.member_id === childId)
    .map((a) => ({ a, e: events.get(a.event_id) }))
    .filter((x): x is { a: (typeof setup.activities)[number]; e: NonNullable<typeof x.e> } => !!x.e && eventOnDay(x.e, dayKey, tz))
    .map(({ a, e }) => ({ id: a.id, title: e.title, time: timeIn(e.starts_at, tz), kit: a.kit }))
    .sort((x, y) => x.time.localeCompare(y.time));
  const until = dueUntil ?? dayKey;
  const due = tasks.filter((t) => !t.done_at && (t.member_id === childId || t.member_id === null) && t.due_on && t.due_on <= until);
  return { bring: d?.bring ?? [], lunch: (d?.lunch as DayPlan["lunch"]) ?? null, clubs, run: runFor(setup, changes, childId, dayKey), due };
}

export function nameOf(members: Member[], id: string | null | undefined): string {
  return members.find((m) => m.id === id)?.display_name ?? "Someone";
}

/** "Ann takes them · Gran picks up at 15:15" */
export function runText(members: Member[], run: DayPlan["run"]): string {
  if (!run || (!run.drop_by && !run.pick_by)) return "";
  const parts: string[] = [];
  if (run.drop_by) parts.push(`${nameOf(members, run.drop_by)} takes them`);
  if (run.pick_by) parts.push(`${nameOf(members, run.pick_by)} picks up${run.pick_time ? ` at ${hhmm(run.pick_time)}` : ""}`);
  return parts.join(" · ");
}

export const LUNCH_LABEL = { dinner: "School dinner", packed: "Packed lunch" } as const;
