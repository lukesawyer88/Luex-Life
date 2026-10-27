// Adding a meal to the plan: from a recipe, typed in, or a takeaway. Children's meals go in as requests.
import { useQueryClient } from "@tanstack/react-query";
import { Bike, BookOpen, Search, Type } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Field, PeoplePicker, Sheet } from "@/modules/calendar/ui";

import { refreshFood, SLOT_LABEL, SLOTS, todayIn, useAvoid, type Recipe, type Slot, type Takeaway } from "./data";
import { ClashChips, dayLabel, mealClashes, syncCookEvent } from "./plan-helpers";

export type AddMealPreset = { day: string; slot: Slot; recipe?: Recipe; takeaway?: Takeaway; ask?: boolean };

type Mode = "recipe" | "text" | "takeaway";

export function AddMealSheet({ preset, onClose, recipes, takeaways, onAdded }: {
  preset: AddMealPreset | null; onClose: () => void; recipes: Recipe[]; takeaways: Takeaway[]; onAdded: (id: string | null) => void;
}) {
  const { family, members, role } = useFamilyState();
  const qc = useQueryClient();
  const avoid = useAvoid().data ?? [];
  const child = role === "child";
  const [mode, setMode] = useState<Mode>("recipe");
  const [q, setQ] = useState("");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [takeaway, setTakeaway] = useState<Takeaway | null>(null);
  const [title, setTitle] = useState("");
  const [day, setDay] = useState("");
  const [slot, setSlot] = useState<Slot>("dinner");
  const [servings, setServings] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [cook, setCook] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!preset) return;
    setMode(preset.takeaway ? "takeaway" : preset.recipe ? "recipe" : "recipe");
    setRecipe(preset.recipe ?? null);
    setTakeaway(preset.takeaway ?? null);
    setTitle(""); setQ(""); setNotes(""); setPeople([]); setCook([]);
    setDay(preset.day); setSlot(preset.ask ? "dinner" : preset.slot);
    setServings(preset.recipe ? String(preset.recipe.servings) : "");
  }, [preset]);

  const found = useMemo(() => {
    const k = q.trim().toLowerCase();
    const list = k ? recipes.filter((r) => r.title.toLowerCase().includes(k) || r.tags.some((t) => t.includes(k)) || r.ingredients.some((i) => i.name.toLowerCase().includes(k))) : recipes;
    return list.slice(0, 40);
  }, [q, recipes]);

  const draftClashes = recipe
    ? mealClashes({ people, recipe_id: recipe.id } as never, recipe, members, avoid)
    : [];

  const ready = mode === "recipe" ? !!recipe : mode === "takeaway" ? !!takeaway : title.trim().length > 0;

  async function save() {
    if (!ready || !day) return;
    setBusy(true);
    try {
      const n = Number(servings);
      const row = {
        family_id: family.id, day, slot,
        recipe_id: mode === "recipe" ? recipe!.id : null,
        takeaway_id: mode === "takeaway" ? takeaway!.id : null,
        title: mode === "text" ? title.trim() : mode === "takeaway" ? `Takeaway: ${takeaway!.name}` : "",
        servings: Number.isFinite(n) && n >= 1 && n <= 100 ? Math.round(n) : null,
        people, cook: child ? null : cook[0] ?? null, notes: notes.trim(),
      };
      const { data, error } = await supabase.from("food_plan").insert(row).select("*").single();
      if (error) throw error;
      // a dinner with a cook shows on the calendar
      if (data.cook && data.status === "planned") {
        const c = members.find((m) => m.id === data.cook);
        const name = data.title || recipe?.title || "Dinner";
        try {
          const evId = await syncCookEvent(data, name, c, family.id, family.timezone);
          if (evId) await supabase.from("food_plan").update({ cal_event_id: evId }).eq("id", data.id);
        } catch { /* the meal is saved; the calendar entry can be added again later */ }
      }
      await refreshFood(qc, family.id);
      toast.success(data.status === "requested" ? "Asked! A parent will say yes or no" : "Added to the plan");
      onAdded(data.status === "requested" ? null : data.id);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const today = todayIn(family.timezone);
  return (
    <Sheet
      open={!!preset}
      onOpenChange={(o) => !o && onClose()}
      title={preset?.ask ? "Ask for a dinner" : `Add ${SLOT_LABEL[slot].toLowerCase()}`}
      description={preset?.ask ? "A parent will say yes or no." : undefined}
      wide
      footer={
        <>
          <Button className="h-11 flex-1 rounded-full text-base font-semibold" onClick={() => void save()} disabled={!ready || busy}>{busy ? "Saving…" : preset?.ask || child ? "Ask" : "Add"}</Button>
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Chip on={mode === "recipe"} onClick={() => setMode("recipe")}><BookOpen className="size-4" /> A recipe</Chip>
          <Chip on={mode === "text"} onClick={() => setMode("text")}><Type className="size-4" /> Type it</Chip>
          {!child ? <Chip on={mode === "takeaway"} onClick={() => setMode("takeaway")}><Bike className="size-4" /> Takeaway</Chip> : null}
        </div>

        {mode === "recipe" ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a recipe" className="h-11 pl-9" aria-label="Find a recipe" />
            </div>
            <ul className="scrollbar-thin max-h-56 space-y-1 overflow-y-auto">
              {found.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => { setRecipe(r); setServings(String(r.servings)); }}
                    className={cn("flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm", recipe?.id === r.id ? "bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "bg-[var(--surface)] hover:bg-muted")}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
                    <span className="text-xs opacity-70">{r.servings} servings</span>
                  </button>
                </li>
              ))}
              {!found.length ? <li className="px-1 text-sm text-muted-foreground">{recipes.length ? "No recipes match." : "No recipes yet. Add some in Recipes, or type the meal instead."}</li> : null}
            </ul>
          </div>
        ) : null}
        {mode === "text" ? (
          <Field label="What's the meal?">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pizza night" className="h-11" maxLength={120} data-autofocus />
          </Field>
        ) : null}
        {mode === "takeaway" ? (
          <div className="flex flex-wrap gap-2">
            {takeaways.map((t) => <Chip key={t.id} on={takeaway?.id === t.id} onClick={() => setTakeaway(t)}>{t.name}</Chip>)}
            {!takeaways.length ? <p className="text-sm text-muted-foreground">No takeaways saved yet. Add them in the Takeaways tab.</p> : null}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Day">
            <Input type="date" value={day} min={child ? today : undefined} onChange={(e) => setDay(e.target.value)} className="h-11" />
          </Field>
          {!preset?.ask ? (
            <Field label="Meal">
              <div className="flex flex-wrap gap-1.5">
                {SLOTS.map((s) => <Chip key={s} on={slot === s} onClick={() => setSlot(s)}>{SLOT_LABEL[s]}</Chip>)}
              </div>
            </Field>
          ) : null}
        </div>
        {day ? <p className="-mt-2 text-xs text-muted-foreground">{dayLabel(day)}</p> : null}

        {!preset?.ask ? (
          <>
            <Field label="How many servings?" hint={recipe ? `The recipe makes ${recipe.servings}. The shopping list uses this number.` : undefined}>
              <Input type="number" inputMode="numeric" min={1} max={100} value={servings} onChange={(e) => setServings(e.target.value)} className="h-11 w-28" />
            </Field>
            <Field label="Who's eating?" hint="Leave empty for everyone.">
              <PeoplePicker members={members} value={people} onChange={setPeople} />
            </Field>
            {!child ? (
              <Field label="Who's cooking?" hint={slot === "dinner" ? "Dinners with a cook show on the Family Calendar." : undefined}>
                <PeoplePicker members={members.filter((m) => m.role !== "child" || m.user_id)} value={cook} onChange={setCook} single />
              </Field>
            ) : null}
          </>
        ) : null}
        {draftClashes.length ? <ClashChips list={draftClashes} /> : null}
        <Field label={preset?.ask ? "Anything to add? (optional)" : "Notes (optional)"}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} />
        </Field>
      </div>
    </Sheet>
  );
}
