// Everything Rewards and Pocket Money reads and writes. The database decides who sees what: your own stars, habits and
// money, plus your children's when you're a parent. These hooks ask, and keep screens fresh.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { Database } from "@/lib/database.types";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

export type RewardSettings = Row<"reward_settings">;
export type RewardPerson = Row<"reward_people">;
export type StarEntry = Row<"star_entries">;
export type Habit = Row<"habits">;
export type HabitLog = Row<"habit_logs">;
export type Reward = Row<"rewards">;
export type RewardGive = Row<"reward_gives">;
export type RewardClaim = Row<"reward_claims">;
export type PocketEntry = Row<"pocket_entries">;
export type PocketGoal = Row<"pocket_goals">;
export type RewardJob = Row<"reward_jobs">;
export type Balance = { member_id: string; stars: number; spend: number; save: number; give: number; waiting: number };

export const BUCKET = "reward-files";
export const POTS = ["spend", "save", "give"] as const;
export type Pot = (typeof POTS)[number];
export const POT_LABEL: Record<Pot, string> = { spend: "Spend", save: "Save", give: "Give" };
export const ALERTS = ["goal", "approval", "pay", "streak", "cheer"] as const;
export const ALERT_LABEL: Record<(typeof ALERTS)[number], string> = {
  goal: "Goals reached", approval: "Things waiting for an OK", pay: "Pocket money and payments", streak: "Habit nudges at 7pm", cheer: "Cheers from a buddy",
};
export const STAR_KIND_LABEL: Record<StarEntry["kind"], string> = {
  chore: "Chore", routine: "Routine", goal: "Goal", habit: "Habit", claim: "Reward", give: "Shared reward", swap: "Swapped for money",
  bonus: "Bonus", deduction: "Taken off", job: "Job", week: "Weekly bonus",
};
export const MONEY_KIND_LABEL: Record<PocketEntry["kind"], string> = {
  pay: "Pocket money", chore: "Chore", job: "Job", bonus: "Bonus", deduction: "Taken off", spend: "Spent", cash: "Cash handed over",
  gift: "Gift", interest: "Interest", match: "Matched", advance: "Advance", repay: "Advance paid back", move: "Moved", swap: "Stars swapped",
  tooth_fairy: "Tooth fairy", birthday: "Birthday money", week: "Weekly bonus", other: "Other",
};

/** Every Rewards query key starts with this, so one call refreshes them all */
export const rewardKey = (familyId: string, ...rest: unknown[]) => ["rewards", familyId, ...rest];

export async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

export function refreshRewards(qc: QueryClient, familyId: string) {
  return qc.invalidateQueries({ queryKey: ["rewards", familyId] });
}

const LIVE_TABLES = ["star_entries", "habit_logs", "pocket_entries", "reward_claims", "reward_jobs", "reward_gives", "rewards"] as const;

export function useRewardsLive() {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void refreshRewards(qc, family.id), 300); };
    const ch = supabase.channel(`rewards-${family.id}`);
    for (const t of LIVE_TABLES) ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `family_id=eq.${family.id}` }, refresh);
    ch.subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [family.id, qc]);
}

// ---------------------------------------------------------------- queries

/** Household settings (made on the first visit) */
export function useRewardSettings() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: rewardKey(family.id, "settings"),
    queryFn: async () => {
      let s = (await rows<RewardSettings>(supabase.from("reward_settings").select("*").eq("family_id", family.id)))[0];
      if (!s) {
        const { error } = await supabase.rpc("reward_setup");
        if (error) throw error;
        s = (await rows<RewardSettings>(supabase.from("reward_settings").select("*").eq("family_id", family.id)))[0];
      }
      return s ?? null;
    },
  });
}

// kept on the device as plain lists (Maps don't survive being saved for offline use), turned into Maps when read
const balanceMap = (list: Balance[]) => new Map(list.map((b) => [b.member_id, b]));
const personMap = (list: RewardPerson[]) => new Map(list.map((p) => [p.member_id, p]));

/** Stars and pots for me, and for the children when I'm a parent */
export function useBalances() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: rewardKey(family.id, "balances"),
    select: balanceMap,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reward_balances");
      if (error) throw error;
      return ((data ?? []) as Balance[]).map((b) => ({ ...b, spend: Number(b.spend), save: Number(b.save), give: Number(b.give) }));
    },
  });
}

export function usePeopleSettings() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: rewardKey(family.id, "people"),
    select: personMap,
    queryFn: () => rows<RewardPerson>(supabase.from("reward_people").select("*").eq("family_id", family.id)),
  });
}

export function useStarHistory(memberId: string | null, limit = 200) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: rewardKey(family.id, "stars", memberId, limit),
    enabled: !!memberId,
    queryFn: () => rows<StarEntry>(supabase.from("star_entries").select("*").eq("member_id", memberId!).order("created_at", { ascending: false }).limit(limit)),
  });
}

/** money records for one person between two dates (inclusive), newest first */
export function usePocketEntries(memberId: string | null, from?: string, to?: string) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: rewardKey(family.id, "pocket", memberId, from, to),
    enabled: !!memberId,
    queryFn: () => {
      let q = supabase.from("pocket_entries").select("*").eq("member_id", memberId!);
      if (from) q = q.gte("on_date", from);
      if (to) q = q.lte("on_date", to);
      return rows<PocketEntry>(q.order("on_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000));
    },
  });
}

/** everything waiting for a parent's OK (spending, gifts, shop requests) */
export function useWaiting() {
  const { family, isParent } = useFamilyState();
  return useQuery({
    queryKey: rewardKey(family.id, "waiting"),
    enabled: isParent,
    queryFn: async () => {
      const [money, claims] = await Promise.all([
        rows<PocketEntry>(supabase.from("pocket_entries").select("*").eq("family_id", family.id).eq("status", "waiting").order("created_at")),
        rows<RewardClaim>(supabase.from("reward_claims").select("*").eq("family_id", family.id).eq("status", "waiting").order("created_at")),
      ]);
      return { money, claims };
    },
  });
}

/** habits I can see (mine, my children's, and ones I'm a buddy on) with the last 60 days of ticks */
export function useHabits(since: string) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: rewardKey(family.id, "habits", since),
    queryFn: async () => {
      const [habits, logs] = await Promise.all([
        rows<Habit>(supabase.from("habits").select("*").eq("family_id", family.id).is("archived_at", null).order("position").order("created_at")),
        rows<HabitLog>(supabase.from("habit_logs").select("*").eq("family_id", family.id).gte("day", since)),
      ]);
      return { habits, logs };
    },
  });
}

export function useRewards() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: rewardKey(family.id, "rewards"),
    queryFn: async () => {
      const [rewards, gives, claims] = await Promise.all([
        rows<Reward>(supabase.from("rewards").select("*").eq("family_id", family.id).is("archived_at", null).order("created_at")),
        rows<RewardGive>(supabase.from("reward_gives").select("*").eq("family_id", family.id)),
        rows<RewardClaim>(supabase.from("reward_claims").select("*").eq("family_id", family.id).order("created_at", { ascending: false }).limit(300)),
      ]);
      return { rewards, gives, claims };
    },
  });
}

export function useGoals() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: rewardKey(family.id, "goals"),
    queryFn: () => rows<PocketGoal>(supabase.from("pocket_goals").select("*").eq("family_id", family.id).is("archived_at", null).order("created_at")),
  });
}

export function useJobs() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: rewardKey(family.id, "jobs"),
    queryFn: () => rows<RewardJob>(supabase.from("reward_jobs").select("*").eq("family_id", family.id).is("archived_at", null).order("created_at", { ascending: false })),
  });
}

// ---------------------------------------------------------------- photos (chores and jobs)

export function useRewardPhotoUrls(paths: (string | null | undefined)[]) {
  const clean = [...new Set(paths.filter((p): p is string => !!p))].sort();
  return useQuery({
    queryKey: ["reward-urls", clean],
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

/** Upload a (shrunk) proof photo into my own folder; returns its path */
export async function uploadProofPhoto(familyId: string, memberId: string, blob: Blob): Promise<string> {
  const path = `${familyId}/rewards/${memberId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("Couldn't save the photo. Try again");
  return path;
}

/** Let a proof photo go once it's been checked (best effort) */
export async function removeProofPhoto(path: string | null | undefined) {
  if (path) await supabase.storage.from(BUCKET).remove([path]);
}

// ---------------------------------------------------------------- numbers and dates

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
export function money(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return gbp.format(Number.isFinite(v) ? v : 0);
}

export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function addDaysKey(k: string, n: number): string {
  const d = new Date(k + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Monday of the week containing k */
export function mondayOf(k: string): string {
  const d = new Date(k + "T12:00:00Z");
  return addDaysKey(k, -((d.getUTCDay() + 6) % 7));
}
export function shortDate(k: string): string {
  return new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** age in whole years from a "YYYY-MM-DD" birthday (null when unknown) */
export function ageFrom(birthday: string | null | undefined, today: string): number | null {
  if (!birthday) return null;
  const [by, bm, bd] = birthday.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** Friendly message from a database error */
export function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/fetch|network/i.test(m)) return "No signal. Try again in a moment";
  if (/row-level|permission/i.test(m)) return "That change is not allowed";
  return m.length < 120 ? m : "Something went wrong. Try again";
}
