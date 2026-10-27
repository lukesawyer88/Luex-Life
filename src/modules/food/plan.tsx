// The weekly meal plan: breakfast, lunch, dinner and snacks for each day, with who's eating, who's cooking,
// allergy warnings, leftovers, children's dinner requests and ideas from what's in the fridge.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Copy, Hand, Lightbulb, Plus, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { Sheet } from "@/modules/calendar/ui";

import {
  addDaysKey, foodKey, refreshFood, rows, SLOT_LABEL, SLOTS, todayIn, useAvoid, usePlan, useRecipes, useStock, useTakeaways,
  weekStartKey, type PlanItem, type Recipe, type Slot,
} from "./data";
import type { FoodTarget } from "./food-page";
import { ClashChips, dayLabel, mealClashes, mealName } from "./plan-helpers";
import { AddMealSheet, type AddMealPreset } from "./plan-add";
import { MealDetail } from "./plan-detail";
import { MealIdeas } from "./plan-ideas";

export function PlanTab({ target, onGo }: { target: FoodTarget; onGo: (t: FoodTarget) => void }) {
  const { family, members, me, role, isParent } = useFamilyState();
  const qc = useQueryClient();
  const desktop = useDesktop();
  const tz = family.timezone;
  const today = todayIn(tz);
  const adult = role !== "child";
  const [ws, setWs] = useState(() => weekStartKey(target.day ?? today));
  const we = addDaysKey(ws, 6);
  const plan = usePlan(ws, we);
  const recipesQ = useRecipes();
  const recipes = recipesQ.data?.recipes ?? [];
  const takeaways = useTakeaways().data?.takeaways ?? [];
  const avoid = useAvoid().data ?? [];
  const stock = useStock().data ?? [];
  const [openId, setOpenId] = useState<string | null>(target.planId ?? null);
  const [add, setAdd] = useState<AddMealPreset | null>(null);
  const [ideas, setIdeas] = useState(false);

  // requests waiting for a parent (any date from today), and a child's own requests
  const requests = useQuery({
    queryKey: foodKey(family.id, "requests"),
    queryFn: () => rows<PlanItem>(supabase.from("food_plan").select("*").eq("family_id", family.id).in("status", ["requested", "declined"]).gte("day", addDaysKey(today, -7)).order("day")),
  });

  // a notification link to a meal in another week: jump there
  const openFromLink = useQuery({
    queryKey: foodKey(family.id, "plan-item", target.planId ?? null),
    enabled: !!target.planId,
    queryFn: async () => (await rows<PlanItem>(supabase.from("food_plan").select("*").eq("id", target.planId!)))[0] ?? null,
  });
  useEffect(() => {
    const p = openFromLink.data;
    if (p) { setWs(weekStartKey(p.day)); setOpenId(p.id); }
  }, [openFromLink.data]);

  const items = plan.data ?? [];
  const all = useMemo(() => {
    const m = new Map<string, PlanItem>();
    for (const p of [...items, ...(requests.data ?? [])]) m.set(p.id, p);
    if (openFromLink.data) m.set(openFromLink.data.id, openFromLink.data);
    return m;
  }, [items, requests.data, openFromLink.data]);
  const open = openId ? all.get(openId) ?? null : null;
  const recipeOf = (p: PlanItem) => (p.recipe_id ? recipes.find((r) => r.id === p.recipe_id) : undefined);

  const waiting = (requests.data ?? []).filter((r) => r.status === "requested");
  const myAsks = (requests.data ?? []).filter((r) => r.requested_by === me.id);

  async function answer(p: PlanItem, yes: boolean) {
    const { error } = await supabase.from("food_plan").update({ status: yes ? "planned" : "declined" }).eq("id", p.id);
    if (error) toast.error(friendlyError(error));
    else toast.success(yes ? "Added to the plan" : "Answered");
    await refreshFood(qc, family.id);
  }

  async function copyLastWeek() {
    const prev = await rows<PlanItem>(supabase.from("food_plan").select("*").eq("family_id", family.id).eq("status", "planned").gte("day", addDaysKey(ws, -7)).lte("day", addDaysKey(ws, -1)));
    if (!prev.length) { toast("Nothing was planned last week"); return; }
    const copies = prev.filter((p) => !p.leftover_of).map((p) => ({
      family_id: family.id, day: addDaysKey(p.day, 7), slot: p.slot, recipe_id: p.recipe_id, title: p.title, servings: p.servings,
      people: p.people, cook: null, takeaway_id: p.takeaway_id, notes: p.notes, position: p.position,
    }));
    const { data, error } = await supabase.from("food_plan").insert(copies).select("id");
    if (error) { toast.error(friendlyError(error)); return; }
    await refreshFood(qc, family.id);
    const ids = (data ?? []).map((x) => x.id as string);
    toast.success(`Copied ${ids.length} ${ids.length === 1 ? "meal" : "meals"}`, {
      action: { label: "Undo", onClick: async () => { await supabase.from("food_plan").delete().in("id", ids); await refreshFood(qc, family.id); } },
    });
  }

  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(ws, i));
  const thisWeek = ws === weekStartKey(today);

  const detail = open ? (
    <MealDetail
      key={open.id}
      item={open}
      recipe={recipeOf(open)}
      recipes={recipes}
      takeaways={takeaways}
      avoid={avoid}
      onClose={() => setOpenId(null)}
      onOpen={(id) => setOpenId(id)}
    />
  ) : (
    <MealIdeas recipes={recipes} stock={stock} onPick={(r) => setAdd({ day: today, slot: "dinner", recipe: r })} />
  );

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        {/* week bar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setWs(addDaysKey(ws, -7))} aria-label="Last week"><ChevronLeft className="size-5" /></Button>
          <Button variant="outline" className="h-10 rounded-full px-3" onClick={() => setWs(weekStartKey(today))} disabled={thisWeek}>This week</Button>
          <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setWs(addDaysKey(ws, 7))} aria-label="Next week"><ChevronRight className="size-5" /></Button>
          <h2 className="min-w-[8rem] flex-1 truncate text-lg font-bold">{dayLabel(ws)} – {dayLabel(we)}</h2>
          {adult ? (
            <Button variant="outline" className="h-10 rounded-full px-3" onClick={() => void copyLastWeek()}><Copy className="size-4" /> Copy last week</Button>
          ) : (
            <Button className="h-10 rounded-full px-4 font-semibold" onClick={() => setAdd({ day: today, slot: "dinner", ask: true })}><Hand className="size-4" /> Ask for a dinner</Button>
          )}
          {!desktop ? (
            <Button variant="ghost" className="h-10 rounded-full px-3" onClick={() => setIdeas(true)}><Lightbulb className="size-4" /> Ideas</Button>
          ) : null}
        </div>

        {/* dinner requests */}
        {isParent && waiting.length ? (
          <div className="rounded-2xl bg-[var(--status-amber-soft)] p-3">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Hand className="size-4" /> Dinner requests</h3>
            <ul className="space-y-2">
              {waiting.map((r) => {
                const who = members.find((m) => m.id === r.requested_by);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface)] p-2">
                    {who ? <MemberAvatar member={who} size="sm" /> : null}
                    <span className="min-w-0 flex-1 text-sm"><b>{who?.display_name ?? "Someone"}</b> would like <b>{mealName(r, recipes, takeaways)}</b> on {dayLabel(r.day)}{r.notes ? ` · “${r.notes}”` : ""}</span>
                    <Button className="h-10 rounded-full px-4 font-semibold" onClick={() => void answer(r, true)}>Yes</Button>
                    <Button variant="outline" className="h-10 rounded-full px-3" onClick={() => void answer(r, false)}>Not this time</Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {!adult && myAsks.length ? (
          <div className="rounded-2xl bg-[var(--surface)] p-3">
            <h3 className="mb-1 text-sm font-bold">Your requests</h3>
            <ul className="space-y-1 text-sm">
              {myAsks.map((r) => (
                <li key={r.id}>{mealName(r, recipes, takeaways)} on {dayLabel(r.day)}: <b>{r.status === "requested" ? "waiting for a parent" : "not this time"}</b></li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* the week */}
        <ol className={cn("space-y-2", plan.isLoading && "opacity-60")}>
          {days.map((d) => (
            <li key={d} className={cn("glass-tile p-3", d === today && "ring-2 ring-[var(--status-blue)]")}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="font-bold">{d === today ? "Today" : dayLabel(d)}</h3>
                {d === today ? <span className="text-xs text-muted-foreground">{dayLabel(d)}</span> : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {SLOTS.map((slot) => {
                  const here = items.filter((p) => p.day === d && p.slot === slot && p.status === "planned");
                  return (
                    <div key={slot} className="min-w-0 rounded-xl bg-[var(--surface)] p-2">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{SLOT_LABEL[slot]}</span>
                        {adult ? (
                          <button type="button" className="grid size-9 place-items-center rounded-full hover:bg-muted" onClick={() => setAdd({ day: d, slot })} aria-label={`Add ${SLOT_LABEL[slot].toLowerCase()} on ${dayLabel(d)}`}>
                            <Plus className="size-4" />
                          </button>
                        ) : null}
                      </div>
                      {here.length ? (
                        <ul className="space-y-1">
                          {here.map((p) => (
                            <MealTile key={p.id} p={p} recipe={recipeOf(p)} name={mealName(p, recipes, takeaways)} selected={openId === p.id} onOpen={() => setOpenId(p.id)} avoid={avoid} />
                          ))}
                        </ul>
                      ) : <p className="px-1 py-1 text-xs text-muted-foreground">—</p>}
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
        {!items.length && !plan.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><UtensilsCrossed className="size-4" /> Nothing planned this week yet. {adult ? "Tap + to add a meal, or copy last week." : ""}</p>
        ) : null}
      </RecordsWindow>
      <DetailWindow>{detail}</DetailWindow>

      {!desktop ? (
        <>
          <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)} title={open ? mealName(open, recipes, takeaways) : ""}>
            {open ? (
              <MealDetail key={open.id} item={open} recipe={recipeOf(open)} recipes={recipes} takeaways={takeaways} avoid={avoid} onClose={() => setOpenId(null)} onOpen={(id) => setOpenId(id)} hideTitle />
            ) : null}
          </Sheet>
          <Sheet open={ideas} onOpenChange={setIdeas} title="Meal ideas">
            <MealIdeas recipes={recipes} stock={stock} onPick={(r) => { setIdeas(false); setAdd({ day: today, slot: "dinner", recipe: r }); }} hideTitle />
          </Sheet>
        </>
      ) : null}

      <AddMealSheet preset={add} onClose={() => setAdd(null)} recipes={recipes} takeaways={takeaways} onAdded={(id) => { setAdd(null); if (id) setOpenId(id); }} />
    </Windows>
  );
}

function MealTile({ p, recipe, name, selected, onOpen, avoid }: {
  p: PlanItem; recipe: Recipe | undefined; name: string; selected: boolean; onOpen: () => void; avoid: ReturnType<typeof useAvoid>["data"];
}) {
  const { members } = useFamilyState();
  const cook = p.cook ? members.find((m) => m.id === p.cook) : undefined;
  const list = mealClashes(p, recipe, members, (avoid ?? []).filter((a) => a.kind !== "dislike"));
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn("w-full rounded-lg border px-2 py-1.5 text-left text-sm transition hover:bg-muted", selected ? "border-[var(--status-blue)] bg-[var(--status-blue-soft)]" : "border-transparent bg-background")}
      >
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
          {cook ? <MemberAvatar member={cook} size="sm" className="size-6 text-[10px] ring-0 ring-offset-0" /> : null}
        </span>
        {p.leftover_of ? <span className="block text-xs text-muted-foreground">Leftovers</span> : null}
        {list.length ? <span className="mt-1 block"><ClashChips list={list} small /></span> : null}
      </button>
    </li>
  );
}

export type { Slot };
