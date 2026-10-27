// Everything Trips and Holidays reads and writes. A trip is a Calendar "trip" event (dates, who's going, where and the
// countdown live there); this module adds packing, before-we-go jobs, plans and ideas for days out.
// The database decides who sees and changes what (a private Calendar event keeps its trip private).
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { Database } from "@/lib/database.types";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import type { CalEvent } from "@/modules/calendar/data";
import { dayKey } from "@/modules/calendar/time";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TripRow = Row<"trips">;
export type TripItem = Row<"trip_items">;
export type Idea = Row<"trip_ideas">;
export type Trip = TripRow & { event: CalEvent; startDay: string; endDay: string };

export const tripKey = (familyId: string, ...rest: unknown[]) => ["trips", familyId, ...rest];
export function refreshTrips(qc: QueryClient, familyId: string) {
  return Promise.all([qc.invalidateQueries({ queryKey: ["trips", familyId] }), qc.invalidateQueries({ queryKey: ["cal", familyId] })]);
}

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

export function useTripsLive() {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void refreshTrips(qc, family.id), 300); };
    const ch = supabase.channel(`trips-${family.id}`);
    for (const t of ["trips", "trip_items", "trip_ideas"]) ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `family_id=eq.${family.id}` }, refresh);
    ch.subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [family.id, qc]);
}

/** Every trip I can see, with its Calendar event, soonest first (past trips last) */
export function useTrips() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: tripKey(family.id, "list"),
    queryFn: async (): Promise<Trip[]> => {
      const trips = await rows<TripRow>(supabase.from("trips").select("*").eq("family_id", family.id));
      if (!trips.length) return [];
      const events = await rows<CalEvent>(supabase.from("cal_events").select("*").in("id", trips.map((t) => t.event_id)).is("deleted_at", null));
      const tz = family.timezone;
      return trips.flatMap((t) => {
        const event = events.find((e) => e.id === t.event_id);
        if (!event) return [];
        // all-day trips end at the start of their last day
        return [{ ...t, event, startDay: dayKey(new Date(event.starts_at), tz), endDay: dayKey(new Date(event.ends_at), tz) }];
      }).sort((a, b) => a.startDay.localeCompare(b.startDay));
    },
  });
}

export function useTripItems(tripId: string | null) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: tripKey(family.id, "items", tripId),
    enabled: !!tripId,
    queryFn: () => rows<TripItem>(supabase.from("trip_items").select("*").eq("trip_id", tripId!).is("deleted_at", null).order("position").order("created_at")),
  });
}

/** Packing left for each trip (for the cards), in one query */
export function useTripProgress(ids: string[]) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: tripKey(family.id, "progress", ids),
    enabled: ids.length > 0,
    queryFn: async () => {
      const list = await rows<Pick<TripItem, "trip_id" | "kind" | "done_at">>(supabase.from("trip_items").select("trip_id, kind, done_at").in("trip_id", ids).is("deleted_at", null).neq("kind", "plan"));
      const out: Record<string, { left: number; total: number }> = {};
      for (const i of list) {
        const p = (out[i.trip_id] ??= { left: 0, total: 0 });
        p.total++;
        if (!i.done_at) p.left++;
      }
      return out;
    },
  });
}

export function useIdeas() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: tripKey(family.id, "ideas"),
    queryFn: () => rows<Idea>(supabase.from("trip_ideas").select("*").eq("family_id", family.id).is("deleted_at", null).order("created_at", { ascending: false })),
  });
}

/** Passports (from Documents) for the people going, to warn when one runs out too soon. Empty when I can't see them. */
export function usePassports(peopleIds: string[]) {
  const { family, role } = useFamilyState();
  return useQuery({
    queryKey: ["docs", family.id, "passports", [...peopleIds].sort()],
    enabled: peopleIds.length > 0 && role !== "child",
    queryFn: () => rows<{ id: string; title: string; person_id: string | null; expires_on: string | null }>(
      supabase.from("documents").select("id, title, person_id, expires_on").eq("family_id", family.id).is("deleted_at", null)
        .in("person_id", peopleIds).ilike("title", "%passport%")),
  });
}

// ---------------------------------------------------------------- ready-made lists

export const PACK_LISTS: { key: string; label: string; emoji: string; items: string[] }[] = [
  { key: "essentials", label: "Essentials", emoji: "🧳", items: ["Clothes", "Pyjamas", "Toothbrush and toothpaste", "Medicines", "Phone charger", "Glasses or contact lenses"] },
  { key: "beach", label: "Beach", emoji: "🏖️", items: ["Swimsuit", "Sun cream", "Sunglasses", "Sun hat", "Flip-flops", "Beach towel"] },
  { key: "cold", label: "Cold weather", emoji: "🧣", items: ["Warm coat", "Hat and gloves", "Jumpers", "Warm socks", "Boots"] },
  { key: "baby", label: "Baby and toddler", emoji: "🍼", items: ["Nappies and wipes", "Bottles and milk", "Snacks", "Favourite toy", "Buggy", "Change of clothes"] },
  { key: "gadgets", label: "Gadgets", emoji: "🔌", items: ["Travel adaptor", "Headphones", "Tablet", "Power bank"] },
];

export const BEFORE_WE_GO = [
  "Check passports are in date", "Travel insurance", "Who's looking after the pets", "Water the plants",
  "Stop the post or ask a neighbour", "Put the bins out", "Charge phones and tablets", "Get some currency", "Print or save the tickets",
];

export const PLAN_KINDS: { key: NonNullable<TripItem["plan_kind"]>; label: string; emoji: string }[] = [
  { key: "travel", label: "Travel", emoji: "✈️" }, { key: "stay", label: "Place to stay", emoji: "🏨" },
  { key: "car", label: "Car hire", emoji: "🚗" }, { key: "activity", label: "Activity", emoji: "🎟️" }, { key: "other", label: "Other", emoji: "📌" },
];

// ---------------------------------------------------------------- dates and words

export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}
export function addMonths(k: string, n: number): string {
  const d = new Date(`${k}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
export function shortDay(k: string): string {
  return new Date(`${k}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
export function datesWords(t: Trip): string {
  return t.startDay === t.endDay ? shortDay(t.startDay) : `${shortDay(t.startDay)} to ${shortDay(t.endDay)}`;
}
/** "12 sleeps", "Tomorrow", "On now", "Back home" */
export function countdownWords(t: Trip, today: string): string {
  const n = daysBetween(today, t.startDay);
  if (today > t.endDay) return "Been";
  if (n <= 0) return "On now";
  if (n === 1) return "Tomorrow";
  return `${n} sleeps`;
}

export function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/fetch|network/i.test(m)) return "No signal. Try again in a moment";
  if (/row-level|permission/i.test(m)) return "That change is not allowed";
  return m.length < 120 ? m : "Something went wrong. Try again";
}
