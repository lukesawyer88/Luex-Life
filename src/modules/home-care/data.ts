// Everything Home Care reads and writes. Everyone in the household can see it; the database decides who can change what
// (grown-ups set up bins, jobs and meters; anyone adds something to fix and changes their own until it's fixed).
// Cleaning lives in the Calendar's Chores; tradespeople in Contacts (em_contacts); warranties in Documents.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { Database } from "@/lib/database.types";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Bin = Row<"hc_bins">;
export type BinChange = Row<"hc_bin_changes">;
export type Job = Row<"hc_jobs">;
export type JobDone = Row<"hc_job_done">;
export type Repair = Row<"hc_repairs">;
export type Meter = Row<"hc_meters">;
export type Reading = Row<"hc_readings">;
export type ContactLite = { id: string; name: string; phone: string | null };

export const BUCKET = "home-files";
export const BIN_COLOURS: { key: Bin["colour"]; label: string; hex: string }[] = [
  { key: "black", label: "Black", hex: "#1f2328" }, { key: "grey", label: "Grey", hex: "#8a9099" }, { key: "blue", label: "Blue", hex: "#2f6bd8" },
  { key: "green", label: "Green", hex: "#2e9d55" }, { key: "brown", label: "Brown", hex: "#8b5a2b" }, { key: "purple", label: "Purple", hex: "#7c4dcc" },
  { key: "red", label: "Red", hex: "#d03a3a" }, { key: "yellow", label: "Yellow", hex: "#e3b31b" },
];
export const binHex = (c: string) => BIN_COLOURS.find((x) => x.key === c)?.hex ?? "#888";

/** Ready-made yearly and seasonal jobs to switch on */
export const STARTER_JOBS: { title: string; emoji: string; every: number }[] = [
  { title: "Boiler service", emoji: "🔥", every: 12 },
  { title: "Test smoke and carbon monoxide alarms", emoji: "🚨", every: 1 },
  { title: "Bleed the radiators", emoji: "🌡️", every: 12 },
  { title: "Clear the gutters", emoji: "🍂", every: 12 },
  { title: "Chimney sweep", emoji: "🧹", every: 12 },
  { title: "Descale the kettle and shower heads", emoji: "🚿", every: 3 },
  { title: "Clean the oven", emoji: "🍳", every: 6 },
  { title: "Clean the washing machine filter", emoji: "🧺", every: 3 },
  { title: "Service the car", emoji: "🚗", every: 12 },
  { title: "Gas safety check (landlord)", emoji: "📋", every: 12 },
];

export const hcKey = (familyId: string, ...rest: unknown[]) => ["hc", familyId, ...rest];
export function refreshHome(qc: QueryClient, familyId: string) {
  return qc.invalidateQueries({ queryKey: ["hc", familyId] });
}

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

export function useHomeLive() {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void refreshHome(qc, family.id), 300); };
    const ch = supabase.channel(`hc-${family.id}`);
    for (const t of ["hc_bins", "hc_bin_changes", "hc_jobs", "hc_repairs", "hc_readings"]) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `family_id=eq.${family.id}` }, refresh);
    }
    ch.subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [family.id, qc]);
}

export type BinsData = { bins: Bin[]; changes: BinChange[] };
export function useBins() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: hcKey(family.id, "bins"),
    queryFn: async (): Promise<BinsData> => {
      const [bins, changes] = await Promise.all([
        rows<Bin>(supabase.from("hc_bins").select("*").eq("family_id", family.id).is("archived_at", null).order("name")),
        rows<BinChange>(supabase.from("hc_bin_changes").select("*").eq("family_id", family.id).gte("on_date", addDays(todayIn(family.timezone), -20))),
      ]);
      return { bins, changes };
    },
  });
}

export function useJobs() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: hcKey(family.id, "jobs"),
    queryFn: () => rows<Job>(supabase.from("hc_jobs").select("*").eq("family_id", family.id).is("archived_at", null).order("next_due")),
  });
}

export function useJobHistory(jobId: string | null) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: hcKey(family.id, "job-done", jobId),
    enabled: !!jobId,
    queryFn: () => rows<JobDone>(supabase.from("hc_job_done").select("*").eq("job_id", jobId!).order("done_on", { ascending: false }).limit(10)),
  });
}

export function useRepairs() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: hcKey(family.id, "repairs"),
    queryFn: () => rows<Repair>(supabase.from("hc_repairs").select("*").eq("family_id", family.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(200)),
  });
}

export type MetersData = { meters: Meter[]; readings: Reading[] };
export function useMeters() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: hcKey(family.id, "meters"),
    queryFn: async (): Promise<MetersData> => {
      const [meters, readings] = await Promise.all([
        rows<Meter>(supabase.from("hc_meters").select("*").eq("family_id", family.id).is("archived_at", null).order("name")),
        rows<Reading>(supabase.from("hc_readings").select("*").eq("family_id", family.id).is("deleted_at", null).order("read_on", { ascending: false }).limit(300)),
      ]);
      return { meters, readings };
    },
  });
}

/** Tradespeople and other numbers from Contacts, to pick from */
export function useContactList() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: hcKey(family.id, "contacts"),
    queryFn: () => rows<ContactLite>(supabase.from("em_contacts").select("id, name, phone").eq("family_id", family.id).is("deleted_at", null).order("name")),
  });
}

// ---------------------------------------------------------------- photos

export function usePhotoUrls(paths: (string | null | undefined)[]) {
  const clean = [...new Set(paths.filter((p): p is string => !!p))].sort();
  return useQuery({
    queryKey: ["hc-urls", clean],
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

export async function uploadPhoto(familyId: string, blob: Blob): Promise<string> {
  const path = `${familyId}/home/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("Couldn't save the photo. Try again");
  return path;
}

// ---------------------------------------------------------------- dates and the bin rota (mirrors hc_bin_is_day / hc_bin_person)

export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function addDays(k: string, n: number): string {
  const d = new Date(`${k}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}
const mod = (a: number, n: number) => ((a % n) + n) % n;

export function isBinDay(b: Bin, d: string) {
  return mod(daysBetween(b.first_on, d), 7 * b.every_weeks) === 0;
}
export function binPerson(b: Bin, changes: BinChange[], d: string): string | null {
  const c = changes.find((x) => x.bin_id === b.id && x.on_date === d);
  if (c?.who) return c.who;
  if (!b.people.length) return null;
  const k = Math.floor(daysBetween(b.first_on, d) / (7 * b.every_weeks));
  return b.people[mod(k, b.people.length)];
}

export type Collection = { bin: Bin; on: string; normal: string; who: string | null; moved: boolean };
/** Every collection from `from` for `days` days, with moves and skips applied */
export function collections(data: BinsData, from: string, days: number): Collection[] {
  const out: Collection[] = [];
  const to = addDays(from, days);
  for (const b of data.bins) {
    // look a little either side so collections moved into the window are found
    for (let i = -14; i <= days + 14; i++) {
      const d = addDays(from, i);
      if (!isBinDay(b, d)) continue;
      const c = data.changes.find((x) => x.bin_id === b.id && x.on_date === d);
      if (c?.skip) continue;
      const on = c?.move_to ?? d;
      if (on < from || on >= to) continue;
      out.push({ bin: b, on, normal: d, who: binPerson(b, data.changes, d), moved: !!c?.move_to });
    }
  }
  return out.sort((a, b) => a.on.localeCompare(b.on) || a.bin.name.localeCompare(b.bin.name));
}

export function dayWords(k: string, today: string): string {
  if (k === today) return "Today";
  if (k === addDays(today, 1)) return "Tomorrow";
  return new Date(`${k}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}
export function shortDate(k: string): string {
  return new Date(`${k}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
export function everyWords(months: number): string {
  if (months === 1) return "Every month";
  if (months === 12) return "Every year";
  if (months % 12 === 0) return `Every ${months / 12} years`;
  return `Every ${months} months`;
}

export function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/fetch|network/i.test(m)) return "No signal. Try again in a moment";
  if (/row-level|permission/i.test(m)) return "That change is not allowed";
  return m.length < 120 ? m : "Something went wrong. Try again";
}
