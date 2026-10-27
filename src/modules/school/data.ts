// Everything School and Activities reads and writes. Everyone in the household can see it; the database decides who
// can change what (parents set it up, grown-ups tick and swap pickups, children add and tick their own homework).
// Clubs and babysitting are ordinary Calendar events (see insertEvent in the Calendar's data); this links to them.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { Database } from "@/lib/database.types";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

export type Place = Row<"school_places">;
export type SchoolChild = Row<"school_children">;
export type SchoolDay = Row<"school_days">;
export type Activity = Row<"school_activities">;
export type Run = Row<"school_runs">;
export type RunChange = Row<"school_run_changes">;
export type Task = Row<"school_tasks">;
export type CalEventRow = Row<"cal_events">;

export const BUCKET = "school-files";
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const SCHOOL_DAYS = [1, 2, 3, 4, 5] as const;
export const DAY_NAME = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const DAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_CODE = ["", "MO", "TU", "WE", "TH", "FR", "SA", "SU"];
export const TASK_KIND_LABEL: Record<Task["kind"], string> = { form: "Form to sign", money: "Money to pay", dressup: "Dress-up day", homework: "Homework", other: "Other" };
export const PLACE_KIND_LABEL: Record<Place["kind"], string> = { school: "School", club: "Club", childcare: "Childcare" };
export const COST_EVERY_LABEL: Record<NonNullable<Activity["cost_every"]>, string> = {
  session: "a session", week: "a week", month: "a month", term: "a term", year: "a year",
};

/** Every School query key starts with this, so one call refreshes them all */
export const schoolKey = (familyId: string, ...rest: unknown[]) => ["school", familyId, ...rest];

export async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

export function refreshSchool(qc: QueryClient, familyId: string) {
  return Promise.all([qc.invalidateQueries({ queryKey: ["school", familyId] }), qc.invalidateQueries({ queryKey: ["cal", familyId] })]);
}

const LIVE_TABLES = ["school_tasks", "school_run_changes", "school_activities", "school_places"] as const;

export function useSchoolLive() {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void refreshSchool(qc, family.id), 300); };
    const ch = supabase.channel(`school-${family.id}`);
    for (const t of LIVE_TABLES) ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `family_id=eq.${family.id}` }, refresh);
    ch.subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [family.id, qc]);
}

/** The household's school set-up in one go (small: a few children, schools and clubs) */
export type SchoolSetup = {
  places: Place[];
  children: SchoolChild[];
  days: SchoolDay[];
  runs: Run[];
  activities: Activity[];
  /** the Calendar events behind the clubs (and any babysitting booked from here) */
  events: CalEventRow[];
};

export function useSchoolSetup() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: schoolKey(family.id, "setup"),
    queryFn: async (): Promise<SchoolSetup> => {
      const [places, children, days, runs, activities] = await Promise.all([
        rows<Place>(supabase.from("school_places").select("*").eq("family_id", family.id).is("archived_at", null).order("name")),
        rows<SchoolChild>(supabase.from("school_children").select("*").eq("family_id", family.id)),
        rows<SchoolDay>(supabase.from("school_days").select("*").eq("family_id", family.id)),
        rows<Run>(supabase.from("school_runs").select("*").eq("family_id", family.id)),
        rows<Activity>(supabase.from("school_activities").select("*").eq("family_id", family.id)),
      ]);
      const ids = activities.map((a) => a.event_id);
      const events = ids.length
        ? await rows<CalEventRow>(supabase.from("cal_events").select("*").in("id", ids).is("deleted_at", null))
        : [];
      return { places, children, days, runs, activities, events };
    },
  });
}

/** pickup changes from a day onwards */
export function useRunChanges(fromKey: string, toKey: string) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: schoolKey(family.id, "run-changes", fromKey, toKey),
    queryFn: () => rows<RunChange>(supabase.from("school_run_changes").select("*").eq("family_id", family.id).gte("on_date", fromKey).lte("on_date", toKey)),
  });
}

/** things to do that aren't done (plus the last two weeks of done ones) */
export function useTasks(sinceDoneKey: string) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: schoolKey(family.id, "tasks", sinceDoneKey),
    queryFn: () => rows<Task>(
      supabase.from("school_tasks").select("*").eq("family_id", family.id).is("deleted_at", null)
        .or(`done_at.is.null,done_at.gte.${sinceDoneKey}`).order("due_on", { ascending: true, nullsFirst: false }).order("created_at"),
    ),
  });
}

export function useMyMorning() {
  const { family, me } = useFamilyState();
  return useQuery({
    queryKey: schoolKey(family.id, "morning", me.id),
    queryFn: async () => (await rows<{ morning: boolean }>(supabase.from("school_people").select("morning").eq("member_id", me.id)))[0]?.morning ?? true,
  });
}
export async function setMyMorning(familyId: string, memberId: string, on: boolean) {
  const { data } = await supabase.from("school_people").select("member_id").eq("member_id", memberId);
  const { error } = data?.length
    ? await supabase.from("school_people").update({ morning: on }).eq("member_id", memberId)
    : await supabase.from("school_people").insert({ member_id: memberId, family_id: familyId, morning: on });
  if (error) throw error;
}

// ---------------------------------------------------------------- letter photos

export function useLetterUrls(paths: (string | null | undefined)[]) {
  const clean = [...new Set(paths.filter((p): p is string => !!p))].sort();
  return useQuery({
    queryKey: ["school-urls", clean],
    enabled: clean.length > 0,
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
    queryFn: async () => {
      const out = new Map<string, string>();
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(clean, 3600);
      if (error) throw error;
      for (const d of data ?? []) if (d.signedUrl && d.path) out.set(d.path, d.signedUrl);
      return out;
    },
  });
}

export async function uploadLetter(familyId: string, blob: Blob): Promise<string> {
  const path = `${familyId}/school/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("Couldn't save the photo. Try again");
  return path;
}

// ---------------------------------------------------------------- days and the week

export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function addDaysKey(k: string, n: number): string {
  const d = new Date(k + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 1 = Monday … 7 = Sunday */
export function weekdayOf(k: string): number {
  const d = new Date(k + "T12:00:00Z").getUTCDay();
  return d === 0 ? 7 : d;
}
export function mondayOf(k: string): string {
  return addDaysKey(k, 1 - weekdayOf(k));
}
export function shortDate(k: string): string {
  return new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
/** "16:00" in the household's time zone */
export function timeIn(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
export function dateKeyIn(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** Is a club's Calendar event on this day? (weekly on set days, daily, or a one-off) */
export function eventOnDay(e: CalEventRow, dayKey: string, tz: string): boolean {
  if (e.deleted_at) return false;
  const start = dateKeyIn(e.starts_at, tz);
  if (start > dayKey) return false;
  if (!e.rrule) return start === dayKey;
  if ((e.exdates ?? []).some((x) => dateKeyIn(x, tz) === dayKey)) return false;
  const until = /UNTIL=(\d{8})/.exec(e.rrule)?.[1];
  if (until && `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` < dayKey) return false;
  if (e.rrule.startsWith("FREQ=DAILY")) return true;
  if (e.rrule.startsWith("FREQ=WEEKLY")) {
    const by = /BYDAY=([A-Z,]+)/.exec(e.rrule)?.[1]?.split(",") ?? [DAY_CODE[weekdayOf(start)]];
    const interval = Number(/INTERVAL=(\d+)/.exec(e.rrule)?.[1] ?? 1);
    if (!by.includes(DAY_CODE[weekdayOf(dayKey)])) return false;
    if (interval > 1) {
      const weeks = Math.round((new Date(mondayOf(dayKey) + "T12:00:00Z").getTime() - new Date(mondayOf(start) + "T12:00:00Z").getTime()) / (7 * 86_400_000));
      return weeks % interval === 0;
    }
    return true;
  }
  return false;
}

/** Who's taking and picking up a child on a day (a change for that day wins over the normal week) */
export function runFor(setup: SchoolSetup, changes: RunChange[], childId: string, dayKey: string) {
  const change = changes.find((c) => c.member_id === childId && c.on_date === dayKey);
  if (change) return { drop_by: change.drop_by, pick_by: change.pick_by, pick_time: change.pick_time, changed: true, note: change.note };
  const wd = weekdayOf(dayKey);
  const r = setup.runs.find((x) => x.member_id === childId && x.weekday === wd);
  return r ? { drop_by: r.drop_by, pick_by: r.pick_by, pick_time: r.pick_time, changed: false, note: "" } : null;
}

export function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
export const money = (n: number | string | null | undefined) => gbp.format(Number(n ?? 0));

export function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/fetch|network/i.test(m)) return "No signal. Try again in a moment";
  if (/row-level|permission/i.test(m)) return "That change is not allowed";
  return m.length < 120 ? m : "Something went wrong. Try again";
}
