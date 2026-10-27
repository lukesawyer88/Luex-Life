// Everything Bookings and Hosting reads and writes. Hosting a party or visit is a Calendar "party or visit" event
// (date, time, place live there); this adds guests and what to get and do. Bookings are Calendar events with a
// booking reference, so they need nothing new. The database decides who sees and changes what.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { Database } from "@/lib/database.types";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import type { CalEvent } from "@/modules/calendar/data";
import { dayKey } from "@/modules/calendar/time";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type HostRow = Row<"host_events">;
export type Guest = Row<"host_guests">;
export type HostItem = Row<"host_items">;
export type Hosting = HostRow & { event: CalEvent; day: string };

export const hostKey = (familyId: string, ...rest: unknown[]) => ["hosting", familyId, ...rest];
export function refreshHosting(qc: QueryClient, familyId: string) {
  return Promise.all([qc.invalidateQueries({ queryKey: ["hosting", familyId] }), qc.invalidateQueries({ queryKey: ["cal", familyId] })]);
}

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

export function useHostingLive() {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void refreshHosting(qc, family.id), 300); };
    const ch = supabase.channel(`hosting-${family.id}`);
    for (const t of ["host_events", "host_guests", "host_items"]) ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `family_id=eq.${family.id}` }, refresh);
    ch.subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [family.id, qc]);
}

export function useHostings() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: hostKey(family.id, "list"),
    queryFn: async (): Promise<Hosting[]> => {
      const list = await rows<HostRow>(supabase.from("host_events").select("*").eq("family_id", family.id));
      if (!list.length) return [];
      const events = await rows<CalEvent>(supabase.from("cal_events").select("*").in("id", list.map((h) => h.event_id)).is("deleted_at", null));
      return list.flatMap((h) => {
        const event = events.find((e) => e.id === h.event_id);
        return event ? [{ ...h, event, day: dayKey(new Date(event.starts_at), family.timezone) }] : [];
      }).sort((a, b) => a.event.starts_at.localeCompare(b.event.starts_at));
    },
  });
}

export type HostDetail = { guests: Guest[]; items: HostItem[] };
export function useHostDetail(hostId: string | null) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: hostKey(family.id, "detail", hostId),
    enabled: !!hostId,
    queryFn: async (): Promise<HostDetail> => {
      const [guests, items] = await Promise.all([
        rows<Guest>(supabase.from("host_guests").select("*").eq("host_id", hostId!).is("deleted_at", null).order("created_at")),
        rows<HostItem>(supabase.from("host_items").select("*").eq("host_id", hostId!).is("deleted_at", null).order("created_at")),
      ]);
      return { guests, items };
    },
  });
}

/** Coming and still-to-do counts for the cards, in one go */
export function useHostSummaries(ids: string[]) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: hostKey(family.id, "summaries", ids),
    enabled: ids.length > 0,
    queryFn: async () => {
      const [guests, items] = await Promise.all([
        rows<Pick<Guest, "host_id" | "people" | "status">>(supabase.from("host_guests").select("host_id, people, status").in("host_id", ids).is("deleted_at", null)),
        rows<Pick<HostItem, "host_id" | "done_at">>(supabase.from("host_items").select("host_id, done_at").in("host_id", ids).is("deleted_at", null)),
      ]);
      const out: Record<string, { coming: number; maybe: number; left: number }> = {};
      for (const id of ids) out[id] = { coming: 0, maybe: 0, left: 0 };
      for (const g of guests) { if (g.status === "yes") out[g.host_id].coming += g.people; if (g.status === "maybe" || g.status === "invited") out[g.host_id].maybe += g.people; }
      for (const i of items) if (!i.done_at) out[i.host_id].left++;
      return out;
    },
  });
}

/** Upcoming Calendar events with a booking reference (restaurants, activities, services) */
export function useBookings(fromIso: string, toIso: string) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: ["cal", family.id, "bookings", fromIso.slice(0, 10)],
    queryFn: () => rows<CalEvent>(supabase.from("cal_events").select("*").eq("family_id", family.id).is("deleted_at", null)
      .not("booking_ref", "is", null).neq("booking_ref", "").gte("ends_at", fromIso).lte("starts_at", toIso).order("starts_at")),
  });
}

export const STATUS: { key: Guest["status"]; label: string; emoji: string }[] = [
  { key: "yes", label: "Coming", emoji: "✅" }, { key: "maybe", label: "Maybe", emoji: "🤔" },
  { key: "invited", label: "Invited", emoji: "✉️" }, { key: "no", label: "Can't come", emoji: "❌" },
];

export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function whenWords(iso: string, tz: string, allDay = false): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: tz });
  return allDay ? day : `${day}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz })}`;
}

export function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/fetch|network/i.test(m)) return "No signal. Try again in a moment";
  if (/row-level|permission/i.test(m)) return "That change is not allowed";
  return m.length < 120 ? m : "Something went wrong. Try again";
}
