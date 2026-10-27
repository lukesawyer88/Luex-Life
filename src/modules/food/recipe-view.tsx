// One recipe: photo, times, scaled ingredients, steps, family thumbs, allergy warnings, history,
// and the things you do with it (plan it, shop for it, cook it, export it).
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Archive, CalendarPlus, ChefHat, Clock, FileDown, Minus, MoreHorizontal, Pencil, Plus, ShoppingCart, ThumbsDown, ThumbsUp, Utensils,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Field, Sheet } from "@/modules/calendar/ui";

import {
  refreshFood, SLOT_LABEL, SLOTS, todayIn, useAvoid, useFoodUrls, useShopping, useStock,
  type Rating, type Recipe, type Slot,
} from "./data";
import { ALLERGENS, clashes, combine, formatIngredient, nameKey, scaleQty, type Ingredient } from "./ingredients";
import { recipesPdf } from "./recipe-pdf";

const DAY = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Who (from the family) the recipe clashes with, and why */
export function useClashes(recipe: Recipe | null) {
  const { members } = useFamilyState();
  const avoid = useAvoid().data ?? [];
  return useMemo(() => {
    if (!recipe) return [];
    return members
      .map((m) => {
        const labels = avoid.filter((a) => a.member_id === m.id && a.kind !== "diet").map((a) => a.label);
        const hit = clashes(labels, recipe.allergens, recipe.ingredients ?? []);
        return { member: m, hit };
      })
      .filter((x) => x.hit.length);
  }, [recipe, members, avoid]);
}

export function RecipeView({
  recipe, ratings, onEdit, onCook, onArchived,
}: {
  recipe: Recipe; ratings: Rating[]; onEdit: () => void; onCook: (servings: number) => void; onArchived: () => void;
}) {
  const { family, me, members, isParent, role } = useFamilyState();
  const qc = useQueryClient();
  const [servings, setServings] = useState(recipe.servings);
  const [sheet, setSheet] = useState<null | "plan" | "shop">(null);
  const [note, setNote] = useState<string | null>(null);
  const photo = useFoodUrls([recipe.photo_path]).data?.get(recipe.photo_path ?? "");
  const warn = useClashes(recipe);
  const canEdit = isParent || recipe.created_by === me.id;
  const mine = ratings.find((r) => r.member_id === me.id);
  const scaled = (i: Ingredient) => ({ ...i, qty: scaleQty(i.qty, recipe.servings, servings) });
  const today = todayIn(family.timezone);

  async function rate(value: 1 | -1) {
    try {
      if (mine && mine.value === value) {
        const { error } = await supabase.from("food_ratings").delete().eq("id", mine.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("food_ratings").upsert(
          { recipe_id: recipe.id, member_id: me.id, family_id: family.id, value, note: mine?.note ?? "" } as never,
          { onConflict: "recipe_id,member_id" },
        );
        if (error) throw error;
      }
      await refreshFood(qc, family.id);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  async function saveNote() {
    if (!mine || note === null) return;
    const { error } = await supabase.from("food_ratings").update({ note: note.trim().slice(0, 300) } as never).eq("id", mine.id);
    if (error) toast.error(friendlyError(error));
    else { setNote(null); await refreshFood(qc, family.id); }
  }

  async function madeIt() {
    const { error } = await supabase.from("food_recipes").update({ times_made: recipe.times_made + 1, last_made: today } as never).eq("id", recipe.id);
    if (error) toast.error(friendlyError(error));
    else { toast.success("Nice! Added to its history"); await refreshFood(qc, family.id); }
  }

  async function archive() {
    const { error } = await supabase.from("food_recipes").update({ archived_at: new Date().toISOString() } as never).eq("id", recipe.id);
    if (error) { toast.error(friendlyError(error)); return; }
    await refreshFood(qc, family.id);
    onArchived();
    toast("Recipe removed", {
      action: {
        label: "Undo",
        onClick: async () => {
          const { error: e2 } = await supabase.from("food_recipes").update({ archived_at: null } as never).eq("id", recipe.id);
          if (e2) toast.error(friendlyError(e2));
          await refreshFood(qc, family.id);
        },
      },
    });
  }

  async function exportPdf() {
    try {
      await recipesPdf([recipe], `${recipe.title.replace(/[^\w ]+/g, "").trim() || "recipe"}.pdf`);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  const time = (recipe.prep_min ?? 0) + (recipe.cook_min ?? 0);
  return (
    <div className="space-y-4">
      {photo ? <img src={photo} alt="" className="aspect-video w-full rounded-3xl object-cover" /> : null}
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-xl font-bold leading-tight">{recipe.title}</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" aria-label="More recipe options"><MoreHorizontal className="size-5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {canEdit ? <DropdownMenuItem onSelect={onEdit}><Pencil className="mr-2 size-4" /> Change recipe</DropdownMenuItem> : null}
            <DropdownMenuItem onSelect={() => void exportPdf()}><FileDown className="mr-2 size-4" /> Save as PDF</DropdownMenuItem>
            {canEdit ? <DropdownMenuItem onSelect={() => void archive()}><Archive className="mr-2 size-4" /> Remove recipe</DropdownMenuItem> : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {recipe.description ? <p className="text-sm text-muted-foreground">{recipe.description}</p> : null}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {time ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface)] px-3 py-1.5"><Clock className="size-4" /> {recipe.prep_min ? `${recipe.prep_min} min prep` : ""}{recipe.prep_min && recipe.cook_min ? " · " : ""}{recipe.cook_min ? `${recipe.cook_min} min cook` : ""}</span> : null}
        {recipe.allergens.map((a) => <span key={a} className="rounded-full bg-[var(--surface)] px-3 py-1.5">{ALLERGENS.find((x) => x.key === a)?.label ?? a}</span>)}
        {recipe.tags.map((t) => <span key={t} className="rounded-full border border-[var(--surface-border)] px-3 py-1.5">{t}</span>)}
      </div>

      {warn.length ? (
        <div className="space-y-1 rounded-2xl bg-[var(--status-amber-soft)] p-3 text-sm text-[var(--status-amber)]">
          {warn.map((w) => (
            <p key={w.member.id} className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 shrink-0" /> Contains {w.hit.join(", ")} — {w.member.display_name}</p>
          ))}
          <p className="text-xs">Always check labels. These warnings are a help, not a guarantee.</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button className="h-12 rounded-full px-5 text-base font-semibold" onClick={() => onCook(servings)}><ChefHat className="size-5" /> Cook</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={() => setSheet("plan")}><CalendarPlus className="size-4" /> Plan it</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={() => setSheet("shop")}><ShoppingCart className="size-4" /> Shop for it</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={() => void madeIt()}><Utensils className="size-4" /> I made this</Button>
      </div>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="flex-1 font-bold">Ingredients</h3>
          <span className="text-sm text-muted-foreground">Serves</span>
          <Button variant="outline" size="icon" className="size-10 rounded-full" aria-label="Fewer servings" disabled={servings <= 1} onClick={() => setServings((s) => Math.max(1, s - 1))}><Minus className="size-4" /></Button>
          <Input aria-label="Servings" className="h-10 w-14 text-center" inputMode="numeric" value={servings} onChange={(e) => { const n = Number(e.target.value); if (n >= 1 && n <= 100) setServings(Math.round(n)); }} />
          <Button variant="outline" size="icon" className="size-10 rounded-full" aria-label="More servings" disabled={servings >= 100} onClick={() => setServings((s) => Math.min(100, s + 1))}><Plus className="size-4" /></Button>
        </div>
        <ul className="space-y-1.5">
          {(recipe.ingredients ?? []).map((i, k) => <li key={k} className="rounded-xl bg-[var(--surface)] px-3 py-2 text-[15px]">{formatIngredient(scaled(i))}</li>)}
        </ul>
      </section>

      {recipe.steps?.length ? (
        <section>
          <h3 className="mb-2 font-bold">Method</h3>
          <ol className="space-y-2">
            {recipe.steps.map((s, k) => (
              <li key={k} className="flex gap-3 text-[15px]">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--tile-active)] text-sm font-bold text-[var(--tile-active-fg)]">{k + 1}</span>
                <span>{s.text}{s.timer_s ? <span className="ml-1 text-muted-foreground">({Math.round(s.timer_s / 60)} min)</span> : null}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {recipe.timeline?.length ? (
        <section>
          <h3 className="mb-2 font-bold">Timeline</h3>
          <ul className="space-y-1 text-sm">
            {[...recipe.timeline].sort((a, b) => b.before_min - a.before_min).map((t, k) => (
              <li key={k}><span className="font-semibold">{t.before_min >= 60 ? `${Math.floor(t.before_min / 60)} h ${t.before_min % 60 ? `${t.before_min % 60} min ` : ""}` : `${t.before_min} min `}before:</span> {t.text}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {role !== "child" && recipe.nutrition && Object.values(recipe.nutrition).some((v) => v != null) ? (
        <section className="text-sm">
          <h3 className="mb-1 font-bold">Per serving <span className="font-normal text-muted-foreground">(estimate)</span></h3>
          <p>{[recipe.nutrition.kcal != null ? `${recipe.nutrition.kcal} kcal` : "", recipe.nutrition.protein != null ? `${recipe.nutrition.protein} g protein` : "", recipe.nutrition.carbs != null ? `${recipe.nutrition.carbs} g carbs` : "", recipe.nutrition.fat != null ? `${recipe.nutrition.fat} g fat` : ""].filter(Boolean).join(" · ")}</p>
        </section>
      ) : null}

      <section>
        <h3 className="mb-2 font-bold">What the family thinks</h3>
        <div className="mb-3 flex gap-2">
          <Button variant={mine?.value === 1 ? "default" : "outline"} className="h-11 rounded-full" onClick={() => void rate(1)} aria-pressed={mine?.value === 1}><ThumbsUp className="size-4" /> Love it</Button>
          <Button variant={mine?.value === -1 ? "default" : "outline"} className="h-11 rounded-full" onClick={() => void rate(-1)} aria-pressed={mine?.value === -1}><ThumbsDown className="size-4" /> Not for me</Button>
        </div>
        {mine ? (
          note === null ? (
            <button type="button" className="mb-3 text-sm text-muted-foreground underline" onClick={() => setNote(mine.note)}>{mine.note ? `Your note: ${mine.note}` : "Add a note"}</button>
          ) : (
            <div className="mb-3 flex gap-2">
              <Input className="h-10" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Less chilli next time" />
              <Button className="h-10 rounded-full" onClick={() => void saveNote()}>Save</Button>
            </div>
          )
        ) : null}
        <ul className="space-y-1.5">
          {ratings.filter((r) => r.member_id !== me.id).map((r) => {
            const m = members.find((x) => x.id === r.member_id);
            if (!m) return null;
            return (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <MemberAvatar member={m} size="sm" className="size-7 ring-0 ring-offset-0" />
                <span className="font-semibold">{m.display_name}</span>
                {r.value === 1 ? <ThumbsUp className="size-4 text-[var(--status-green)]" /> : <ThumbsDown className="size-4 text-[var(--status-red)]" />}
                {r.note ? <span className="truncate text-muted-foreground">{r.note}</span> : null}
              </li>
            );
          })}
        </ul>
      </section>

      {recipe.notes ? (
        <section>
          <h3 className="mb-1 font-bold">Notes</h3>
          <p className="whitespace-pre-wrap text-sm">{recipe.notes}</p>
        </section>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {recipe.times_made ? `Made ${recipe.times_made} time${recipe.times_made === 1 ? "" : "s"}${recipe.last_made ? `, last on ${DAY(recipe.last_made)}` : ""}` : "Not made yet"}
        {recipe.source_url ? <> · <a className="underline" href={recipe.source_url} target="_blank" rel="noreferrer noopener">original recipe</a></> : null}
      </p>

      <PlanSheet open={sheet === "plan"} onOpenChange={(o) => setSheet(o ? "plan" : null)} recipe={recipe} servings={servings} />
      <ShopSheet open={sheet === "shop"} onOpenChange={(o) => setSheet(o ? "shop" : null)} recipe={recipe} servings={servings} />
    </div>
  );
}

function PlanSheet({ open, onOpenChange, recipe, servings }: { open: boolean; onOpenChange: (o: boolean) => void; recipe: Recipe; servings: number }) {
  const { family, role } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const [day, setDay] = useState(today);
  const [slot, setSlot] = useState<Slot>("dinner");
  const [n, setN] = useState(servings);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const { error } = await supabase.from("food_plan").insert({ family_id: family.id, day, slot, recipe_id: recipe.id, servings: n } as never);
      if (error) throw error;
      await refreshFood(qc, family.id);
      toast.success(role === "child" ? "Asked a grown-up" : "Added to the meal plan");
      onOpenChange(false);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={role === "child" ? "Ask for this meal" : "Add to the meal plan"}
      footer={<Button className="ml-auto h-11 rounded-full px-6 text-base font-semibold" disabled={busy} onClick={add}>{role === "child" ? "Ask" : "Add"}</Button>}>
      <div className="space-y-4">
        <Field label="Day"><Input type="date" className="h-11" value={day} min={today} onChange={(e) => setDay(e.target.value || today)} /></Field>
        <Field label="Meal">
          <div className="flex flex-wrap gap-1.5">{SLOTS.map((s) => <Chip key={s} on={slot === s} onClick={() => setSlot(s)}>{SLOT_LABEL[s]}</Chip>)}</div>
        </Field>
        <Field label="Servings"><Input type="number" inputMode="numeric" min={1} max={100} className="h-11 w-24" value={n} onChange={(e) => setN(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} /></Field>
      </div>
    </Sheet>
  );
}

function ShopSheet({ open, onOpenChange, recipe, servings }: { open: boolean; onOpenChange: (o: boolean) => void; recipe: Recipe; servings: number }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const shopping = useShopping().data;
  const stock = useStock().data ?? [];
  const lists = shopping?.lists ?? [];
  const [listId, setListId] = useState<string | null>(null);
  const [skip, setSkip] = useState<Set<number> | null>(null);
  const [busy, setBusy] = useState(false);
  const items = (recipe.ingredients ?? []).map((i) => ({ ...i, qty: scaleQty(i.qty, recipe.servings, servings) }));
  const inStock = useMemo(() => {
    const keys = new Set(stock.map((s) => nameKey(s.name)));
    return new Set(items.map((i, k) => (keys.has(nameKey(i.name)) ? k : -1)).filter((k) => k >= 0));
  }, [stock, items]);
  // items already in stock start unticked
  const skipped = skip ?? inStock;
  const chosenList = listId ?? lists[0]?.id ?? null;

  async function add() {
    setBusy(true);
    try {
      let lid = chosenList;
      if (!lid) {
        const { data, error } = await supabase.from("food_lists").insert({ family_id: family.id, title: "Weekly shop" } as never).select("id").single();
        if (error) throw error;
        lid = (data as { id: string }).id;
      }
      const picked = combine(items.filter((_, k) => !skipped.has(k)).map((i) => ({ ...i, from: recipe.id })));
      if (!picked.length) { onOpenChange(false); return; }
      const rowsIn = picked.map((i) => ({
        list_id: lid, family_id: family.id, name: i.name.slice(0, 100),
        quantity: i.qty && i.qty > 0 ? Math.round(i.qty * 100) / 100 : null, unit: i.unit, note: (i as Ingredient).note?.slice(0, 200) ?? "",
        recipe_ids: [recipe.id],
      }));
      const { error } = await supabase.from("food_list_items").insert(rowsIn as never);
      if (error) throw error;
      await refreshFood(qc, family.id);
      toast.success(`${picked.length} item${picked.length === 1 ? "" : "s"} added to the list`);
      setSkip(null);
      onOpenChange(false);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSkip(null); }} title="Add to the shopping list"
      description={`For ${servings} serving${servings === 1 ? "" : "s"}. Untick anything you already have.`}
      footer={<Button className="ml-auto h-11 rounded-full px-6 text-base font-semibold" disabled={busy} onClick={add}>Add to list</Button>}>
      {lists.length > 1 ? (
        <Field label="Which list">
          <div className="mb-3 flex flex-wrap gap-1.5">{lists.map((l) => <Chip key={l.id} on={chosenList === l.id} onClick={() => setListId(l.id)}>{l.emoji ? `${l.emoji} ` : ""}{l.title}</Chip>)}</div>
        </Field>
      ) : null}
      <ul className="space-y-1.5">
        {items.map((i, k) => {
          const on = !skipped.has(k);
          return (
            <li key={k}>
              <button type="button" aria-pressed={on} onClick={() => { const s = new Set(skipped); if (on) s.add(k); else s.delete(k); setSkip(s); }}
                className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px]", on ? "bg-[var(--surface)]" : "opacity-60")}>
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-md border-2", on ? "border-[var(--tile-active)] bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "border-[var(--surface-border)]")}>{on ? "✓" : ""}</span>
                <span className="flex-1">{formatIngredient(i)}</span>
                {inStock.has(k) ? <span className="text-xs text-muted-foreground">In stock</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
