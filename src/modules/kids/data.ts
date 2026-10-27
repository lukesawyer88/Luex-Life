// Everything Kids' Space reads and writes. The database decides who sees and changes what:
// rules (parents write; the child and grown-ups read), screen time asks (the child asks; parents answer),
// milestones and "all about me" (the household reads).
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { Database } from "@/lib/database.types";
import type { Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type KidRule = Row<"kid_rules">;
export type KidAsk = Row<"kid_asks">;
export type Milestone = Row<"kid_milestones">;
export type About = Row<"kid_about">;

export const kidsKey = (familyId: string, ...rest: unknown[]) => ["kids", familyId, ...rest];
export const refreshKids = (qc: QueryClient, familyId: string) => qc.invalidateQueries({ queryKey: ["kids", familyId] });

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

export function useKidsLive() {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void refreshKids(qc, family.id), 300); };
    const ch = supabase.channel(`kids-${family.id}`);
    for (const t of ["kid_rules", "kid_asks", "kid_milestones", "kid_about"]) ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `family_id=eq.${family.id}` }, refresh);
    ch.subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [family.id, qc]);
}

/** The children in the household (a child sees only themselves) */
export function useChildren(): Member[] {
  const { members, me, role } = useFamilyState();
  if (role === "child") return [me];
  return members.filter((m) => m.role === "child" && !m.archived_at);
}

export function useRules(childId: string | null) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: kidsKey(family.id, "rules", childId),
    enabled: !!childId,
    queryFn: () => rows<KidRule>(supabase.from("kid_rules").select("*").eq("child_id", childId!).is("deleted_at", null).order("position").order("created_at")),
  });
}

/** Today's asks for one child, newest first (parents and the child) */
export function useAsks(childId: string | null) {
  const { family } = useFamilyState();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  return useQuery({
    queryKey: kidsKey(family.id, "asks", childId),
    enabled: !!childId,
    queryFn: () => rows<KidAsk>(supabase.from("kid_asks").select("*").eq("child_id", childId!).gte("created_at", since).order("created_at", { ascending: false })),
  });
}

/** Asks waiting for a parent, across all children (for the Home card) */
export function useOpenAsks(enabled: boolean) {
  const { family } = useFamilyState();
  const since = new Date(Date.now() - 3 * 3600_000).toISOString();
  return useQuery({
    queryKey: kidsKey(family.id, "open-asks"),
    enabled,
    refetchInterval: 60_000,
    queryFn: () => rows<KidAsk>(supabase.from("kid_asks").select("*").eq("family_id", family.id).eq("status", "asked").gte("created_at", since).order("created_at")),
  });
}

export function useMilestones(childId: string | null) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: kidsKey(family.id, "milestones", childId),
    enabled: !!childId,
    queryFn: () => rows<Milestone>(supabase.from("kid_milestones").select("*").eq("child_id", childId!).is("deleted_at", null).order("on_date", { ascending: false }).order("created_at", { ascending: false })),
  });
}

export function useAbout(childId: string | null) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: kidsKey(family.id, "about", childId),
    enabled: !!childId,
    queryFn: async () => (await rows<About>(supabase.from("kid_about").select("*").eq("child_id", childId!)))[0] ?? null,
  });
}

export async function answerAsk(qc: QueryClient, familyId: string, id: string, status: "yes" | "no") {
  const { error } = await supabase.from("kid_asks").update({ status }).eq("id", id);
  if (error) throw error;
  await refreshKids(qc, familyId);
}

export const RULE_IDEAS: { emoji: string; title: string }[] = [
  { emoji: "📱", title: "1 hour on school days" }, { emoji: "🎮", title: "2 hours at weekends" },
  { emoji: "📚", title: "Homework first" }, { emoji: "🌙", title: "Screens off by 7pm" },
  { emoji: "🍽️", title: "No phones at the table" }, { emoji: "🛏️", title: "Phones stay downstairs at night" },
];

export const MILESTONE_IDEAS: { emoji: string; title: string }[] = [
  { emoji: "😊", title: "First smile" }, { emoji: "🦷", title: "First tooth" }, { emoji: "👣", title: "First steps" },
  { emoji: "💬", title: "First word" }, { emoji: "🎒", title: "First day at school" }, { emoji: "🦷", title: "Lost a tooth" },
  { emoji: "🚲", title: "Rode a bike" }, { emoji: "🏊", title: "Learned to swim" }, { emoji: "📖", title: "Read a book on my own" },
];

export const QUESTIONS: { key: string; label: string; emoji: string; placeholder: string }[] = [
  { key: "colour", label: "Favourite colour", emoji: "🎨", placeholder: "Purple" },
  { key: "food", label: "Favourite food", emoji: "🍕", placeholder: "Pizza" },
  { key: "animal", label: "Favourite animal", emoji: "🦦", placeholder: "Otters" },
  { key: "game", label: "Favourite game or toy", emoji: "🧸", placeholder: "Lego" },
  { key: "friend", label: "Best friend", emoji: "🤝", placeholder: "Sam" },
  { key: "good_at", label: "I'm really good at", emoji: "⭐", placeholder: "Drawing" },
  { key: "learning", label: "I'm learning", emoji: "🧠", placeholder: "Times tables" },
  { key: "grow_up", label: "When I grow up I want to be", emoji: "🚀", placeholder: "A vet" },
];

/** "2 years 3 months", or "5 months", from a birthday to a date (both yyyy-mm-dd) */
export function ageOn(birthday: string | null | undefined, on: string): string | null {
  if (!birthday || on < birthday) return null;
  const [by, bm, bd] = birthday.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  let months = (y - by) * 12 + (m - bm) - (d < bd ? 1 : 0);
  if (months < 1) {
    const days = Math.round((Date.parse(`${on}T12:00:00Z`) - Date.parse(`${birthday}T12:00:00Z`)) / 86400000);
    const weeks = Math.floor(days / 7);
    return weeks >= 1 ? `${weeks} ${weeks === 1 ? "week" : "weeks"}` : `${days} ${days === 1 ? "day" : "days"}`;
  }
  const years = Math.floor(months / 12);
  months -= years * 12;
  if (years < 2) { const all = years * 12 + months; return `${all} ${all === 1 ? "month" : "months"}`; }
  return months ? `${years} years ${months} ${months === 1 ? "month" : "months"}` : `${years} years`;
}

export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export const dateWords = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/kid_asks_one_open|duplicate key/i.test(m)) return "You've already asked. Wait for an answer";
  if (/fetch|network/i.test(m)) return "No signal. Try again in a moment";
  if (/row-level|permission/i.test(m)) return "That change is not allowed";
  return m.length < 120 ? m : "Something went wrong. Try again";
}
