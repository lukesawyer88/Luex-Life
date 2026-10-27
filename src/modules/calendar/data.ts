// Everything the calendar reads and writes. The database decides who may see and change what;
// these hooks just ask, and keep every screen up to date when someone else changes something.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { Database } from "@/lib/database.types";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";

import type { EventLike } from "./recurrence";
import type { CalendarPrefs } from "./types";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

export type CalEvent = Row<"cal_events"> & EventLike;
export type Place = Row<"cal_places">;
export type Term = Row<"cal_terms">;
export type DayNote = Row<"cal_day_notes">;
export type Comment = Row<"cal_comments">;
export type CalFile = Row<"cal_files">;
export type LogEntry = Row<"cal_event_log">;
export type Chore = Row<"chores">;
export type ChoreDone = Row<"chore_done">;
export type Routine = Row<"routines">;
export type RoutineStep = Row<"routine_steps">;
export type RoutineRun = Row<"routine_runs">;
export type RoutineTick = Row<"routine_ticks">;
export type WishList = Row<"wish_lists">;
export type WishItem = Row<"wish_items">;
export type WishClaim = Row<"wish_claims">;
export type Feed = Omit<Row<"cal_feeds">, never>;
export type Share = Omit<Row<"cal_shares">, "token_hash">;
export type NotifPrefs = Row<"notification_prefs">;
export type Notification = Pick<Row<"notifications">, "id" | "kind" | "title" | "body" | "link" | "count" | "created_at" | "read_at">;

/** Every calendar query key starts with this, so one call refreshes them all */
export const calKey = (familyId: string, ...rest: unknown[]) => ["cal", familyId, ...rest];

export function prefsOf(family: { calendar_prefs: unknown }): CalendarPrefs {
  const p = family.calendar_prefs;
  return p && typeof p === "object" ? (p as CalendarPrefs) : {};
}

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

// ---------------------------------------------------------------- events

const EVENT_COLS = "*";

/** Events that can touch [from, to): everything repeating, plus one-offs in the window */
export function useEvents(from: Date, to: Date) {
  const { family } = useFamilyState();
  const f = from.toISOString();
  const t = to.toISOString();
  return useQuery({
    queryKey: calKey(family.id, "events", f, t),
    placeholderData: (prev) => prev,
    queryFn: () =>
      rows<CalEvent>(
        supabase
          .from("cal_events")
          .select(EVENT_COLS)
          .eq("family_id", family.id)
          .is("deleted_at", null)
          .lt("starts_at", t)
          .or(`rrule.not.is.null,ends_at.gte.${f},recurrence_of.not.is.null`)
          .order("starts_at")
          .limit(3000),
      ),
  });
}

export function useEvent(id: string | null | undefined) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: calKey(family.id, "event", id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("cal_events").select(EVENT_COLS).eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as CalEvent | null;
    },
  });
}

export function useSearchEvents(text: string) {
  const { family } = useFamilyState();
  const q = text.trim();
  return useQuery({
    queryKey: calKey(family.id, "search", q),
    enabled: q.length >= 2,
    queryFn: () =>
      rows<CalEvent>(
        supabase
          .from("cal_events")
          .select(EVENT_COLS)
          .eq("family_id", family.id)
          .is("deleted_at", null)
          .or(`title.ilike.%${q.replace(/[%,()]/g, " ")}%,notes.ilike.%${q.replace(/[%,()]/g, " ")}%,location.ilike.%${q.replace(/[%,()]/g, " ")}%`)
          .order("starts_at", { ascending: false })
          .limit(60),
      ),
  });
}

export function useEventLog(eventId: string | null) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: calKey(family.id, "log", eventId),
    enabled: !!eventId,
    queryFn: () => rows<LogEntry>(supabase.from("cal_event_log").select("*").eq("event_id", eventId!).order("at", { ascending: false }).limit(30)),
  });
}

export function useComments(eventId: string | null) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: calKey(family.id, "comments", eventId),
    enabled: !!eventId,
    queryFn: () =>
      rows<Comment>(supabase.from("cal_comments").select("*").eq("event_id", eventId!).is("deleted_at", null).order("created_at").limit(200)),
  });
}

export function useFiles(eventId: string | null) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: calKey(family.id, "files", eventId),
    enabled: !!eventId,
    queryFn: () => rows<CalFile>(supabase.from("cal_files").select("*").eq("event_id", eventId!).order("created_at")),
  });
}

/** A short-lived link to a private family file */
export function useFileUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["family-file", path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("family-files").createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

// ---------------------------------------------------------------- the rest of the calendar

export function usePlaces() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: calKey(family.id, "places"),
    queryFn: () => rows<Place>(supabase.from("cal_places").select("*").eq("family_id", family.id).order("name")),
  });
}

export function useTerms() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: calKey(family.id, "terms"),
    queryFn: () => rows<Term>(supabase.from("cal_terms").select("*").eq("family_id", family.id).order("starts_on")),
  });
}

export function useDayNotes(fromKey: string, toKey: string) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: calKey(family.id, "notes", fromKey, toKey),
    placeholderData: (prev) => prev,
    queryFn: () =>
      rows<DayNote>(supabase.from("cal_day_notes").select("*").eq("family_id", family.id).gte("day", fromKey).lte("day", toKey)),
  });
}

export function useChores() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: calKey(family.id, "chores"),
    queryFn: () => rows<Chore>(supabase.from("chores").select("*").eq("family_id", family.id).order("created_at")),
  });
}

export function useChoreDone(fromKey: string, toKey: string) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: calKey(family.id, "chore-done", fromKey, toKey),
    placeholderData: (prev) => prev,
    queryFn: () =>
      rows<ChoreDone>(supabase.from("chore_done").select("*").eq("family_id", family.id).gte("due_on", fromKey).lte("due_on", toKey)),
  });
}

/** Stars earned (confirmed) since a day, per person – shown here, spent in Rewards and Pocket Money */
export function useStars(sinceKey: string) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: calKey(family.id, "stars", sinceKey),
    queryFn: async () => {
      const [done, runs, routines] = await Promise.all([
        rows<Pick<ChoreDone, "for_member" | "stars" | "confirmed_at">>(
          supabase.from("chore_done").select("for_member, stars, confirmed_at").eq("family_id", family.id).gte("due_on", sinceKey).not("confirmed_at", "is", null),
        ),
        rows<Pick<RoutineRun, "routine_id" | "stars">>(
          supabase.from("routine_runs").select("routine_id, stars").eq("family_id", family.id).gte("run_on", sinceKey).not("finished_at", "is", null),
        ),
        rows<Pick<Routine, "id" | "member_id">>(supabase.from("routines").select("id, member_id").eq("family_id", family.id)),
      ]);
      const owner = new Map(routines.map((r) => [r.id, r.member_id]));
      const total = new Map<string, number>();
      for (const d of done) total.set(d.for_member, (total.get(d.for_member) ?? 0) + d.stars);
      for (const r of runs) {
        const m = owner.get(r.routine_id);
        if (m) total.set(m, (total.get(m) ?? 0) + r.stars);
      }
      return total;
    },
  });
}

export function useRoutines() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: calKey(family.id, "routines"),
    queryFn: async () => {
      const [rs, steps] = await Promise.all([
        rows<Routine>(supabase.from("routines").select("*").eq("family_id", family.id).order("position").order("created_at")),
        rows<RoutineStep>(supabase.from("routine_steps").select("*").eq("family_id", family.id).order("position")),
      ]);
      return rs.map((r) => ({ ...r, steps: steps.filter((s) => s.routine_id === r.id) }));
    },
  });
}
export type RoutineWithSteps = Routine & { steps: RoutineStep[] };

export function useRoutineDay(dayK: string) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: calKey(family.id, "routine-day", dayK),
    queryFn: async () => {
      const [runs, ticks] = await Promise.all([
        rows<RoutineRun>(supabase.from("routine_runs").select("*").eq("family_id", family.id).eq("run_on", dayK)),
        rows<RoutineTick>(supabase.from("routine_ticks").select("*").eq("family_id", family.id).eq("done_on", dayK)),
      ]);
      return { runs, ticks };
    },
  });
}

export function useWishes() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: calKey(family.id, "wishes"),
    queryFn: async () => {
      const [lists, items, claims] = await Promise.all([
        rows<WishList>(supabase.from("wish_lists").select("*").eq("family_id", family.id).order("year", { ascending: false })),
        rows<WishItem>(supabase.from("wish_items").select("*").eq("family_id", family.id).is("removed_at", null).order("priority").order("position").order("created_at")),
        // the database never returns claims on your own lists
        rows<WishClaim>(supabase.from("wish_claims").select("*").eq("family_id", family.id)),
      ]);
      return { lists, items, claims };
    },
    // claims don't arrive live (on purpose), so check now and then
    refetchInterval: 60_000,
  });
}

export function useFeeds(enabled: boolean) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: calKey(family.id, "feeds"),
    enabled,
    queryFn: () =>
      rows<Feed>(
        supabase
          .from("cal_feeds")
          .select("id, family_id, name, url, type, people, visibility, viewers, active, last_synced_at, last_error, event_count, created_by_member, created_at")
          .eq("family_id", family.id)
          .order("created_at"),
      ),
  });
}

export function useShares(enabled: boolean) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: calKey(family.id, "shares"),
    enabled,
    queryFn: () =>
      rows<Share>(
        supabase
          .from("cal_shares")
          .select("id, family_id, name, kind, people, show_notes, expires_at, revoked_at, last_used_at, created_by_member, created_at")
          .eq("family_id", family.id)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false }),
      ),
  });
}

export function useNotifPrefs() {
  const { family, me } = useFamilyState();
  return useQuery({
    queryKey: calKey(family.id, "prefs", me.id),
    queryFn: async () => {
      const { data, error } = await supabase.from("notification_prefs").select("*").eq("member_id", me.id).maybeSingle();
      if (error) throw error;
      return (data as NotifPrefs | null) ?? { member_id: me.id, family_id: family.id, changes: "mine", reminders: true, weekly: true, wishlists: true, updated_at: "" };
    },
  });
}

export async function saveNotifPrefs(memberId: string, familyId: string, p: Pick<NotifPrefs, "changes" | "reminders" | "weekly" | "wishlists">) {
  const { error } = await supabase
    .from("notification_prefs")
    .upsert({ member_id: memberId, family_id: familyId, ...p }, { onConflict: "member_id" });
  if (error) throw error;
}

export function useNotifications() {
  const { family, me } = useFamilyState();
  return useQuery({
    queryKey: calKey(family.id, "notifications", me.id),
    refetchInterval: 60_000,
    queryFn: () =>
      rows<Notification>(
        supabase
          .from("notifications")
          .select("id, kind, title, body, link, count, created_at, read_at")
          .eq("member_id", me.id)
          .order("created_at", { ascending: false })
          .limit(30),
      ),
  });
}

// ---------------------------------------------------------------- live updates

const LIVE_TABLES = ["cal_events", "cal_comments", "cal_day_notes", "chore_done", "routine_ticks", "routine_runs", "wish_items"];

/** Refresh the calendar whenever anyone in the family changes something */
export function useCalendarLive() {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void qc.invalidateQueries({ queryKey: ["cal", family.id] }), 300);
    };
    const ch = supabase.channel(`cal-${family.id}`);
    for (const t of LIVE_TABLES) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `family_id=eq.${family.id}` }, refresh);
    }
    ch.subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
  }, [family.id, qc]);
}

export function refreshCalendar(qc: QueryClient, familyId: string) {
  return qc.invalidateQueries({ queryKey: ["cal", familyId] });
}

// ---------------------------------------------------------------- saving events safely

export type EventDraft = Partial<
  Pick<
    CalEvent,
    | "title" | "type" | "all_day" | "starts_at" | "ends_at" | "rrule" | "exdates" | "people" | "visibility" | "viewers"
    | "driver" | "place_id" | "location" | "travel_minutes" | "reminders" | "notes" | "booking_ref" | "link" | "countdown"
    | "done_at" | "deleted_at"
  >
>;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Thrown when someone else changed the same thing while you were editing */
export class EditClash extends Error {
  constructor(public fields: string[], public latest: CalEvent) {
    super("Someone else changed this while you were editing");
  }
}

/** Only the fields that actually changed */
export function diff(original: CalEvent, draft: EventDraft): EventDraft {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(draft)) {
    if (!same((original as Record<string, unknown>)[k], v)) out[k] = v;
  }
  return out as EventDraft;
}

/**
 * Save changes without wiping anyone else's. Sends only the changed fields; if the event changed meanwhile,
 * it merges automatically when the other person changed different things, and asks only when you both
 * changed the same thing (unless `force`).
 */
export async function saveEventChanges(original: CalEvent, draft: EventDraft, force = false): Promise<CalEvent> {
  const changes = diff(original, draft);
  if (Object.keys(changes).length === 0) return original;
  const first = await supabase.from("cal_events").update(changes).eq("id", original.id).eq("version", original.version).select(EVENT_COLS);
  if (first.error) throw first.error;
  if (first.data && first.data.length) return first.data[0] as CalEvent;

  const { data: latest, error } = await supabase.from("cal_events").select(EVENT_COLS).eq("id", original.id).maybeSingle();
  if (error) throw error;
  if (!latest) throw new Error("This event was removed, or you can no longer change it");
  const l = latest as CalEvent;
  const clashes = Object.keys(changes).filter(
    (k) => !same((l as Record<string, unknown>)[k], (original as Record<string, unknown>)[k]) && !same((l as Record<string, unknown>)[k], (changes as Record<string, unknown>)[k]),
  );
  if (clashes.length && !force) throw new EditClash(clashes, l);
  const second = await supabase.from("cal_events").update(changes).eq("id", l.id).eq("version", l.version).select(EVENT_COLS);
  if (second.error) throw second.error;
  if (!second.data?.length) throw new Error("Someone is changing this right now. Please try again");
  return second.data[0] as CalEvent;
}

export async function insertEvent(row: Omit<EventDraft, "deleted_at"> & { family_id: string; title: string; starts_at: string; ends_at: string; recurrence_of?: string | null; recurrence_date?: string | null }) {
  const { data, error } = await supabase.from("cal_events").insert(row).select(EVENT_COLS).single();
  if (error) throw error;
  return data as CalEvent;
}

// ---------------------------------------------------------------- friendly field names

export const FIELD_NAMES: Record<string, string> = {
  title: "name", type: "type", all_day: "all day", starts_at: "time", ends_at: "time", rrule: "repeat", exdates: "repeat",
  people: "who it's for", visibility: "who sees it", viewers: "who sees it", driver: "who's taking them", place_id: "place",
  location: "place", travel_minutes: "journey time", reminders: "reminders", notes: "notes", booking_ref: "booking reference",
  link: "link", countdown: "countdown", done_at: "done", deleted_at: "removed",
};
