// One planned meal: servings, who's eating and cooking, allergy warnings, move or copy, leftovers,
// freezing portions, "we made it", the cooking timeline, and removing with undo.
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChefHat, Clock, Copy, Move, Repeat, Snowflake, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/family";
import { useExtra } from "@/lib/extras";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Field, PeoplePicker } from "@/modules/calendar/ui";

import type { Database } from "@/lib/database.types";

import { refreshFood, SLOT_LABEL, SLOTS, todayIn, useFoodUrls, type Avoid, type PlanItem, type Recipe, type Slot, type Takeaway } from "./data";
import { ClashChips, dayLong, mealClashes, mealName, syncCookEvent } from "./plan-helpers";

type Panel = null | "move" | "copy" | "leftovers" | "freeze" | "timeline";

export function MealDetail({ item, recipe, recipes, takeaways, avoid, onClose, onOpen, hideTitle }: {
  item: PlanItem; recipe: Recipe | undefined; recipes: Recipe[]; takeaways: Takeaway[]; avoid: Avoid[];
  onClose: () => void; onOpen: (id: string) => void; hideTitle?: boolean;
}) {
  const { family, members, role, isParent, me } = useFamilyState();
  const qc = useQueryClient();
  const adult = role !== "child";
  const showIdeas = useExtra("food.ideas");
  const showHistory = useExtra("food.collections");
  const showTimeline = useExtra("food.seasonal");
  const canEdit = adult || (item.created_by === me.id && item.status === "requested");
  const name = mealName(item, recipes, takeaways);
  const photo = useFoodUrls([recipe?.photo_path]).data?.get(recipe?.photo_path ?? "");
  const cook = item.cook ? members.find((m) => m.id === item.cook) : undefined;
  const list = mealClashes(item, recipe, members, avoid);
  const [panel, setPanel] = useState<Panel>(null);
  const [servings, setServings] = useState(String(item.servings ?? recipe?.servings ?? ""));
  const leftoverOf = item.leftover_of;

  async function update(changes: Database["public"]["Tables"]["food_plan"]["Update"], ok?: string) {
    const { data, error } = await supabase.from("food_plan").update(changes).eq("id", item.id).select("*").single();
    if (error) { toast.error(friendlyError(error)); return null; }
    await refreshFood(qc, family.id);
    if (ok) toast.success(ok);
    return data as PlanItem;
  }

  /** keep the calendar entry in step after any change to day, cook or name */
  async function syncCalendar(p: PlanItem) {
    try {
      const c = p.cook ? members.find((m) => m.id === p.cook) : undefined;
      const evId = await syncCookEvent(p, mealName(p, recipes, takeaways), c, family.id, family.timezone);
      if (evId !== p.cal_event_id) await supabase.from("food_plan").update({ cal_event_id: evId }).eq("id", p.id);
    } catch {
      toast("Saved. The calendar entry couldn't be updated");
    }
  }

  async function setCook(ids: string[]) {
    const p = await update({ cook: ids[0] ?? null });
    if (p) { await syncCalendar(p); await refreshFood(qc, family.id); }
  }

  async function saveServings() {
    const n = Number(servings);
    if (!Number.isFinite(n) || n < 1 || n > 100) return;
    if (n !== (item.servings ?? recipe?.servings)) await update({ servings: Math.round(n) }, "Servings changed");
  }

  async function moveTo(day: string, slot: Slot) {
    const p = await update({ day, slot }, "Moved");
    if (p) await syncCalendar(p);
    setPanel(null);
  }

  async function copyTo(day: string, slot: Slot) {
    const { data, error } = await supabase.from("food_plan").insert({
      family_id: family.id, day, slot, recipe_id: item.recipe_id, title: item.title, servings: item.servings,
      people: item.people, takeaway_id: item.takeaway_id, notes: item.notes,
    }).select("id").single();
    if (error) { toast.error(friendlyError(error)); return; }
    await refreshFood(qc, family.id);
    setPanel(null);
    toast.success("Copied", { action: { label: "Open", onClick: () => onOpen(data.id as string) } });
  }

  async function leftovers(day: string, slot: Slot) {
    const { error } = await supabase.from("food_plan").insert({
      family_id: family.id, day, slot, title: `Leftovers: ${name}`.slice(0, 120), leftover_of: item.id, people: item.people,
    });
    if (error) { toast.error(friendlyError(error)); return; }
    await refreshFood(qc, family.id);
    setPanel(null);
    toast.success("Leftovers added to the plan");
  }

  async function freeze(portions: number) {
    const { error } = await supabase.from("food_stock").insert({
      family_id: family.id, name: name.slice(0, 100), place: "freezer", portions, from_recipe: item.recipe_id,
    });
    if (error) { toast.error(friendlyError(error)); return; }
    await refreshFood(qc, family.id);
    setPanel(null);
    toast.success(`${portions} ${portions === 1 ? "portion" : "portions"} added to the freezer`);
  }

  async function madeIt() {
    if (!recipe) return;
    const today = todayIn(family.timezone);
    const { error } = await supabase.from("food_recipes").update({
      times_made: recipe.times_made + 1, last_made: item.day > today ? today : item.day,
    }).eq("id", recipe.id);
    if (error) { toast.error(friendlyError(error)); return; }
    await refreshFood(qc, family.id);
    toast.success(`Made ${recipe.times_made + 1} ${recipe.times_made + 1 === 1 ? "time" : "times"}`);
  }

  async function remove() {
    const snapshot = item;
    if (item.cal_event_id) {
      try { await syncCookEvent({ ...item, cook: null }, name, undefined, family.id, family.timezone); } catch { /* best effort */ }
    }
    const { error } = await supabase.from("food_plan").delete().eq("id", item.id);
    if (error) { toast.error(friendlyError(error)); return; }
    await refreshFood(qc, family.id);
    onClose();
    toast("Meal removed", {
      action: {
        label: "Undo",
        onClick: async () => {
          const { data, error: e } = await supabase.from("food_plan").insert({
            family_id: snapshot.family_id, day: snapshot.day, slot: snapshot.slot, recipe_id: snapshot.recipe_id, title: snapshot.title,
            servings: snapshot.servings, people: snapshot.people, cook: snapshot.cook, leftover_of: snapshot.leftover_of,
            takeaway_id: snapshot.takeaway_id, notes: snapshot.notes, position: snapshot.position,
          }).select("*").single();
          if (e) { toast.error(friendlyError(e)); return; }
          if (data.cook) await syncCalendar(data as PlanItem);
          await refreshFood(qc, family.id);
        },
      },
    });
  }

  async function answer(yes: boolean) {
    await update({ status: yes ? "planned" : "declined" }, yes ? "Added to the plan" : "Answered");
  }

  return (
    <div className="space-y-4">
      {!hideTitle ? (
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 text-lg font-bold">{name}</h2>
          <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={onClose} aria-label="Close"><X className="size-5" /></Button>
        </div>
      ) : null}
      {photo ? <img src={photo} alt="" className="aspect-video w-full rounded-2xl object-cover" /> : null}
      <p className="text-sm text-muted-foreground">{SLOT_LABEL[item.slot as Slot]} · {dayLong(item.day)}</p>
      {item.status === "requested" ? (
        <div className="rounded-2xl bg-[var(--status-amber-soft)] p-3 text-sm">
          <p className="font-semibold">Asked for by {members.find((m) => m.id === item.requested_by)?.display_name ?? "someone"}</p>
          {isParent ? (
            <div className="mt-2 flex gap-2">
              <Button className="h-10 rounded-full px-4 font-semibold" onClick={() => void answer(true)}>Yes</Button>
              <Button variant="outline" className="h-10 rounded-full px-3" onClick={() => void answer(false)}>Not this time</Button>
            </div>
          ) : <p>Waiting for a parent.</p>}
        </div>
      ) : null}
      {item.status === "declined" ? <p className="rounded-2xl bg-[var(--surface)] p-3 text-sm">A parent said not this time.</p> : null}
      {item.notes ? <p className="rounded-2xl bg-[var(--surface)] p-3 text-sm">{item.notes}</p> : null}
      {leftoverOf ? (
        <button type="button" className="text-sm font-semibold text-[var(--status-blue)] underline" onClick={() => onOpen(leftoverOf)}>Leftovers from an earlier meal</button>
      ) : null}

      <ClashChips list={list} />

      {/* who's eating and cooking */}
      <div className="space-y-3">
        <Field label="Who's eating">
          {adult ? (
            <PeoplePicker members={members} value={item.people} onChange={(ids) => void update({ people: ids })} />
          ) : (
            <p className="text-sm">{item.people.length ? members.filter((m) => item.people.includes(m.id)).map((m) => m.display_name).join(", ") : "Everyone"}</p>
          )}
        </Field>
        {item.status === "planned" ? (
          <Field label="Who's cooking" hint={item.slot === "dinner" ? "Dinners with a cook show on the Family Calendar." : undefined}>
            {adult ? (
              <PeoplePicker members={members} value={item.cook ? [item.cook] : []} onChange={(ids) => void setCook(ids)} single />
            ) : cook ? (
              <span className="inline-flex items-center gap-2 text-sm font-medium"><MemberAvatar member={cook} size="sm" /> {cook.display_name}</span>
            ) : <p className="text-sm text-muted-foreground">Not decided yet</p>}
          </Field>
        ) : null}
        {canEdit && (recipe || item.servings) ? (
          <Field label="Servings">
            <div className="flex items-center gap-2">
              <Input type="number" inputMode="numeric" min={1} max={100} value={servings} onChange={(e) => setServings(e.target.value)} onBlur={() => void saveServings()} className="h-11 w-24" />
              {recipe ? <span className="text-xs text-muted-foreground">Recipe makes {recipe.servings}</span> : null}
            </div>
          </Field>
        ) : null}
      </div>

      {/* actions */}
      {adult && item.status === "planned" ? (
        <div className="flex flex-wrap gap-2">
          <Chip on={panel === "move"} onClick={() => setPanel(panel === "move" ? null : "move")}><Move className="size-4" /> Move</Chip>
          <Chip on={panel === "copy"} onClick={() => setPanel(panel === "copy" ? null : "copy")}><Copy className="size-4" /> Copy</Chip>
          {showIdeas ? <Chip on={panel === "leftovers"} onClick={() => setPanel(panel === "leftovers" ? null : "leftovers")}><Repeat className="size-4" /> Makes leftovers</Chip> : null}
          {showIdeas ? <Chip on={panel === "freeze"} onClick={() => setPanel(panel === "freeze" ? null : "freeze")}><Snowflake className="size-4" /> Freeze portions</Chip> : null}
          {recipe && showHistory ? <Chip on={false} onClick={() => void madeIt()}><ChefHat className="size-4" /> We made it</Chip> : null}
          {showTimeline && recipe?.timeline?.length ? <Chip on={panel === "timeline"} onClick={() => setPanel(panel === "timeline" ? null : "timeline")}><Clock className="size-4" /> Cooking timeline</Chip> : null}
        </div>
      ) : null}
      {panel === "move" ? <DayPick label="Move to" initial={item.day} slot={item.slot as Slot} onPick={(d, s) => void moveTo(d, s)} /> : null}
      {panel === "copy" ? <DayPick label="Copy to" initial={item.day} slot={item.slot as Slot} onPick={(d, s) => void copyTo(d, s)} /> : null}
      {panel === "leftovers" ? <DayPick label="Leftovers on" initial={nextDay(item.day)} slot={item.slot as Slot} onPick={(d, s) => void leftovers(d, s)} /> : null}
      {panel === "freeze" ? <Freeze onSave={(n) => void freeze(n)} /> : null}
      {panel === "timeline" && recipe?.timeline ? <Timeline steps={recipe.timeline} /> : null}
      {showHistory && recipe?.times_made ? <p className="text-xs text-muted-foreground">Made {recipe.times_made} {recipe.times_made === 1 ? "time" : "times"}{recipe.last_made ? `, last on ${dayLong(recipe.last_made)}` : ""}.</p> : null}

      {canEdit ? (
        <Button variant="outline" className="h-11 w-full rounded-full text-[var(--status-red)]" onClick={() => void remove()}><Trash2 className="size-4" /> Remove from the plan</Button>
      ) : null}
    </div>
  );
}

function nextDay(k: string) {
  const d = new Date(k + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function DayPick({ label, initial, slot, onPick }: { label: string; initial: string; slot: Slot; onPick: (day: string, slot: Slot) => void }) {
  const [day, setDay] = useState(initial);
  const [s, setS] = useState<Slot>(slot);
  return (
    <div className="space-y-2 rounded-2xl bg-[var(--surface)] p-3">
      <Field label={label}>
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-11" />
      </Field>
      <div className="flex flex-wrap gap-1.5">{SLOTS.map((x) => <Chip key={x} on={s === x} onClick={() => setS(x)}>{SLOT_LABEL[x]}</Chip>)}</div>
      <Button className="h-11 w-full rounded-full font-semibold" disabled={!day} onClick={() => onPick(day, s)}>Done</Button>
    </div>
  );
}

function Freeze({ onSave }: { onSave: (n: number) => void }) {
  const [n, setN] = useState("3");
  const v = Math.round(Number(n));
  return (
    <div className="flex items-end gap-2 rounded-2xl bg-[var(--surface)] p-3">
      <Field label="Portions to freeze">
        <Input type="number" inputMode="numeric" min={1} max={100} value={n} onChange={(e) => setN(e.target.value)} className="h-11 w-24" />
      </Field>
      <Button className="h-11 rounded-full px-5 font-semibold" disabled={!(v >= 1 && v <= 100)} onClick={() => onSave(v)}>Add to freezer</Button>
    </div>
  );
}

/** pick the serving time; each job shows its clock time, in order, with big ticks */
function Timeline({ steps }: { steps: { before_min: number; text: string }[] }) {
  const [serve, setServe] = useState("13:00");
  const [done, setDone] = useState<Set<number>>(new Set());
  const [h, m] = serve.split(":").map(Number);
  const serveMin = (h || 0) * 60 + (m || 0);
  const ordered = steps.map((s, i) => ({ ...s, i })).sort((a, b) => b.before_min - a.before_min);
  const clock = (mins: number) => {
    const t = ((mins % 1440) + 1440) % 1440;
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  };
  return (
    <div className="space-y-2 rounded-2xl bg-[var(--surface)] p-3">
      <Field label="Serving at">
        <Input type="time" value={serve} onChange={(e) => setServe(e.target.value)} className="h-11 w-32" />
      </Field>
      <ol className="space-y-1.5">
        {ordered.map((s) => {
          const on = done.has(s.i);
          return (
            <li key={s.i}>
              <button
                type="button"
                onClick={() => setDone((d) => { const n = new Set(d); if (n.has(s.i)) n.delete(s.i); else n.add(s.i); return n; })}
                className={cn("flex min-h-12 w-full items-center gap-3 rounded-xl bg-background px-3 text-left", on && "opacity-50")}
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border-2", on ? "border-[var(--status-green)] bg-[var(--status-green)] text-white" : "border-[var(--surface-border)]")}>
                  {on ? <Check className="size-5" /> : null}
                </span>
                <span className="w-14 shrink-0 font-bold tabular-nums">{clock(serveMin - s.before_min)}</span>
                <span className={cn("min-w-0 flex-1 text-sm", on && "line-through")}>{s.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
