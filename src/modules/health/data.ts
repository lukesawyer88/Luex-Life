// Everything Family Health reads and writes (parents only; the database checks). Dates and reminders only, never
// medical records. Appointments are Calendar events, so they need nothing new.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { Database } from "@/lib/database.types";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import type { CalEvent } from "@/modules/calendar/data";
import { expand } from "@/modules/calendar/recurrence";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Med = Row<"health_meds">;
export type Dose = Row<"health_doses">;
export type Check = Row<"health_checks">;

export const healthKey = (familyId: string, ...rest: unknown[]) => ["health", familyId, ...rest];
export const refreshHealth = (qc: QueryClient, familyId: string) => qc.invalidateQueries({ queryKey: ["health", familyId] });

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

export function useHealthLive() {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void refreshHealth(qc, family.id), 300); };
    const ch = supabase.channel(`health-${family.id}`);
    for (const t of ["health_meds", "health_doses", "health_checks"]) ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `family_id=eq.${family.id}` }, refresh);
    ch.subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [family.id, qc]);
}

export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function nowHm(tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
}
export const addDaysKey = (k: string, n: number) => new Date(Date.parse(`${k}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const dateWords = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Medicine still running (or starting) today */
export function useMeds(enabled = true) {
  const { family } = useFamilyState();
  const today = todayIn(family.timezone);
  return useQuery({
    queryKey: healthKey(family.id, "meds", today),
    enabled,
    queryFn: () => rows<Med>(supabase.from("health_meds").select("*").eq("family_id", family.id).is("deleted_at", null)
      .or(`end_on.is.null,end_on.gte.${today}`).order("created_at")),
  });
}

export function useDoses(day: string, enabled = true) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: healthKey(family.id, "doses", day),
    enabled,
    refetchInterval: 60_000,
    queryFn: () => rows<Dose>(supabase.from("health_doses").select("*").eq("family_id", family.id).eq("on_date", day)),
  });
}

/** Today's doses, in time order, each with whether it's been given */
export type DoseSlot = { med: Med; at: string; dose: Dose | undefined };
export function slotsFor(meds: Med[], doses: Dose[], day: string): DoseSlot[] {
  return meds
    .filter((m) => m.start_on <= day && (!m.end_on || m.end_on >= day))
    .flatMap((m) => m.times.map((at) => ({ med: m, at, dose: doses.find((d) => d.med_id === m.id && d.at_time === at) })))
    .sort((a, b) => a.at.localeCompare(b.at) || a.med.name.localeCompare(b.med.name));
}

export async function tickDose(qc: QueryClient, familyId: string, s: DoseSlot, day: string) {
  const given = !s.dose?.given_at;
  const { error } = await supabase.from("health_doses")
    .upsert({ family_id: familyId, med_id: s.med.id, on_date: day, at_time: s.at, given_at: given ? new Date().toISOString() : null }, { onConflict: "med_id,on_date,at_time" });
  if (error) throw error;
  await refreshHealth(qc, familyId);
}

export function useChecks() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: healthKey(family.id, "checks"),
    queryFn: () => rows<Check>(supabase.from("health_checks").select("*").eq("family_id", family.id).is("deleted_at", null).is("done_at", null).order("due_on")),
  });
}

/** Upcoming Calendar appointments (the next date of a repeating one) */
export function useAppointments(from: Date, to: Date) {
  const { family } = useFamilyState();
  const f = from.toISOString();
  return useQuery({
    queryKey: ["cal", family.id, "appointments", f.slice(0, 13)],
    queryFn: async () => {
      const list = await rows<CalEvent>(supabase.from("cal_events").select("*").eq("family_id", family.id).eq("type", "appointment").is("deleted_at", null)
        .lt("starts_at", to.toISOString()).or(`rrule.not.is.null,ends_at.gte.${f},recurrence_of.not.is.null`).limit(2000));
      const seen = new Set<string>();
      return expand(list, from, to, family.timezone).sort((x, y) => x.start.getTime() - y.start.getTime())
        .filter((o) => (seen.has(o.seriesId) ? false : (seen.add(o.seriesId), true)));
    },
  });
}

export const TIMES = ["07:00", "08:00", "12:00", "14:00", "18:00", "20:00"];

export const CHECK_IDEAS: { title: string; every: number | null; emoji: string }[] = [
  { title: "Dentist", every: 6, emoji: "🦷" }, { title: "Eye test", every: 24, emoji: "👓" }, { title: "Hearing check", every: 12, emoji: "👂" },
  { title: "Flu jab", every: 12, emoji: "💉" }, { title: "Booster jab", every: null, emoji: "💉" }, { title: "Health visitor check", every: null, emoji: "👶" },
  { title: "Smear test", every: 36, emoji: "🩺" }, { title: "Blood pressure check", every: 12, emoji: "❤️" },
];

export function everyWords(m: number | null): string {
  if (!m) return "Once";
  if (m % 12 === 0) return m === 12 ? "Every year" : `Every ${m / 12} years`;
  return m === 1 ? "Every month" : `Every ${m} months`;
}

export function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/fetch|network/i.test(m)) return "No signal. Try again in a moment";
  if (/row-level|permission/i.test(m)) return "That change is not allowed";
  if (/violates check constraint/i.test(m)) return "Check the dates and times";
  return m.length < 120 ? m : "Something went wrong. Try again";
}
