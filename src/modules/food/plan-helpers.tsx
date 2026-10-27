// Small shared pieces for the meal plan, lunches and takeaways screens.
import { AlertTriangle } from "lucide-react";

import type { Member } from "@/lib/family";
import { supabase } from "@/lib/supabase";
import { insertEvent } from "@/modules/calendar/data";
import { atTime } from "@/modules/calendar/time";

import type { Avoid, PlanItem, Recipe, Takeaway } from "./data";
import { clashes } from "./ingredients";

/** what to call a planned meal */
export function mealName(p: PlanItem, recipes: Recipe[], takeaways: Takeaway[] = []): string {
  if (p.title) return p.title;
  const r = p.recipe_id ? recipes.find((x) => x.id === p.recipe_id) : undefined;
  if (r) return r.title;
  const t = p.takeaway_id ? takeaways.find((x) => x.id === p.takeaway_id) : undefined;
  return t ? `Takeaway: ${t.name}` : "Meal";
}

export type Clash = { member: Member; label: string; kind: Avoid["kind"] };

/** who can't (or won't) eat this, from their "avoid" labels */
export function mealClashes(p: PlanItem, recipe: Recipe | undefined, members: Member[], avoid: Avoid[]): Clash[] {
  if (!recipe) return [];
  const eaters = p.people.length ? members.filter((m) => p.people.includes(m.id)) : members;
  const out: Clash[] = [];
  for (const m of eaters) {
    const mine = avoid.filter((a) => a.member_id === m.id);
    if (!mine.length) continue;
    const hit = clashes(mine.map((a) => a.label), recipe.allergens ?? [], recipe.ingredients ?? []);
    for (const label of hit) {
      const a = mine.find((x) => x.label === label);
      out.push({ member: m, label, kind: a?.kind ?? "allergy" });
    }
  }
  return out;
}

export function ClashChips({ list, small }: { list: Clash[]; small?: boolean }) {
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {list.map((c) => (
        <span
          key={c.member.id + c.label}
          className={
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold " +
            (small ? "text-[11px] " : "text-xs ") +
            (c.kind === "dislike" ? "bg-[var(--surface)] text-muted-foreground" : "bg-[var(--status-red-soft)] text-[var(--status-red)]")
          }
        >
          <AlertTriangle className="size-3" />
          {c.kind === "dislike" ? `${c.member.display_name} doesn't like ${c.label}` : `Contains ${c.label} — ${c.member.display_name}`}
        </span>
      ))}
      {!small && list.some((c) => c.kind !== "dislike") ? <span className="text-xs text-muted-foreground">Always check labels.</span> : null}
    </div>
  );
}

/**
 * Keep the Family Calendar in step with who's cooking dinner: one event per dinner with a cook, 18:00–19:00.
 * Returns the event id to store on the plan (null when there's no cook any more).
 */
export async function syncCookEvent(p: PlanItem, name: string, cook: Member | undefined, familyId: string, tz: string): Promise<string | null> {
  const wanted = p.slot === "dinner" && !!cook && p.status === "planned";
  if (!wanted) {
    if (p.cal_event_id) {
      await supabase.from("cal_events").update({ deleted_at: new Date().toISOString() }).eq("id", p.cal_event_id);
    }
    return null;
  }
  const title = `Dinner: ${name} (${cook.display_name} cooking)`.slice(0, 120);
  const starts = atTime(p.day, "18:00", tz).toISOString();
  const ends = atTime(p.day, "19:00", tz).toISOString();
  if (p.cal_event_id) {
    const { data } = await supabase.from("cal_events")
      .update({ title, starts_at: starts, ends_at: ends, people: [cook.id], deleted_at: null })
      .eq("id", p.cal_event_id).select("id");
    if (data?.length) return p.cal_event_id;
  }
  const ev = await insertEvent({ family_id: familyId, title, type: "other", starts_at: starts, ends_at: ends, people: [cook.id] });
  return ev.id;
}

/** "Mon 3 Nov" */
export function dayLabel(k: string): string {
  return new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
export function dayLong(k: string): string {
  return new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
