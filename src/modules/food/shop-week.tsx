// "Add the week's meals": every planned recipe's ingredients, scaled to the servings planned, combined,
// with "already have" ticked off for things in stock. The person checks before anything is added.
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useFamilyState } from "@/lib/family-context";
import { friendlyError } from "@/lib/family";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Sheet } from "@/modules/calendar/ui";

import { addDaysKey, refreshFood, todayIn, usePlan, useRecipes, useStock, weekStartKey, type ShopList } from "./data";
import { combine, formatQty, nameKey, scaleQty, type Ingredient } from "./ingredients";

type Line = Ingredient & { from: string[]; have: boolean; inStock: boolean; key: string };

export function AddWeekSheet({
  open, onOpenChange, lists, listId,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; lists: ShopList[]; listId: string | null;
}) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const [weekOffset, setWeekOffset] = useState(0);
  const from = addDaysKey(weekStartKey(today), weekOffset * 7);
  const to = addDaysKey(from, 6);
  const plan = usePlan(from, to);
  const recipes = useRecipes();
  const stock = useStock();
  const [target, setTarget] = useState<string | null>(listId);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const lines = useMemo((): Line[] => {
    const byId = new Map((recipes.data?.recipes ?? []).map((r) => [r.id, r]));
    const parts: (Ingredient & { from: string })[] = [];
    for (const p of plan.data ?? []) {
      if (p.status !== "planned" || !p.recipe_id || p.leftover_of) continue;
      const r = byId.get(p.recipe_id);
      if (!r) continue;
      const servings = p.servings ?? r.servings;
      for (const i of r.ingredients ?? []) {
        if (!i?.name) continue;
        parts.push({ ...i, qty: scaleQty(i.qty ?? null, r.servings, servings), from: r.id });
      }
    }
    const inStock = new Set((stock.data ?? []).map((s) => nameKey(s.name)));
    return combine(parts).map((c) => {
      const key = nameKey(c.name) + "|" + (c.unit ?? "");
      const has = inStock.has(nameKey(c.name));
      return { ...c, key, inStock: has, have: overrides[key] ?? has };
    });
  }, [plan.data, recipes.data, stock.data, overrides]);

  const meals = (plan.data ?? []).filter((p) => p.status === "planned" && p.recipe_id && !p.leftover_of).length;
  const toAdd = lines.filter((l) => !l.have);
  const listTarget = target ?? lists[0]?.id ?? null;

  async function add() {
    if (!listTarget || !toAdd.length) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("food_list_items").insert(toAdd.map((l, i) => ({
        list_id: listTarget, family_id: family.id, name: l.name.slice(0, 100),
        quantity: l.qty !== null ? Math.round(l.qty * 100) / 100 : null, unit: l.unit, note: "",
        recipe_ids: l.from.slice(0, 30), position: Date.now() / 1000 + i,
      })));
      if (error) throw error;
      toast.success(`${toAdd.length} item${toAdd.length === 1 ? "" : "s"} added`);
      void refreshFood(qc, family.id);
      setOverrides({});
      onOpenChange(false);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  const loading = plan.isLoading || recipes.isLoading;
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add the week's meals"
      description="Ingredients from the planned recipes, added up. Untick anything you already have."
      wide
      footer={
        <>
          <Button variant="outline" className="h-12 rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="h-12 flex-1 rounded-full text-base font-semibold" disabled={saving || !toAdd.length || !listTarget} onClick={() => void add()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null} Add {toAdd.length || ""} to the list
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Chip on={weekOffset === 0} onClick={() => { setWeekOffset(0); setOverrides({}); }}>This week</Chip>
        <Chip on={weekOffset === 1} onClick={() => { setWeekOffset(1); setOverrides({}); }}>Next week</Chip>
      </div>
      {lists.length > 1 ? (
        <div className="mb-3">
          <p className="mb-1 text-sm font-semibold">Add to</p>
          <div className="flex flex-wrap gap-2">
            {lists.map((l) => <Chip key={l.id} on={listTarget === l.id} onClick={() => setTarget(l.id)}>{l.emoji ? `${l.emoji} ` : ""}{l.title}</Chip>)}
          </div>
        </div>
      ) : null}
      {loading ? <p className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />Working it out…</p> : null}
      {!loading && meals === 0 ? (
        <p className="rounded-2xl bg-[var(--surface)] p-4 text-sm">No recipes are planned for that week yet. Add meals with a recipe on the meal plan first.</p>
      ) : null}
      {!loading && meals > 0 ? (
        <>
          <p className="mb-2 text-sm text-muted-foreground">From {meals} planned meal{meals === 1 ? "" : "s"}.</p>
          <ul className="space-y-1.5">
            {lines.map((l) => (
              <li key={l.key}>
                <button
                  type="button"
                  aria-pressed={!l.have}
                  onClick={() => setOverrides((o) => ({ ...o, [l.key]: !l.have }))}
                  className={cn("flex min-h-12 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left", l.have ? "border-transparent bg-[var(--surface)] opacity-60" : "border-[var(--surface-border)] bg-background")}
                >
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border-2", l.have ? "border-muted-foreground/40" : "border-[var(--tile-active)] bg-[var(--tile-active)] text-[var(--tile-active-fg)]")}>
                    {!l.have ? <Check className="size-4" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block font-medium", l.have && "line-through")}>{[formatQty(l.qty), l.unit, l.name].filter(Boolean).join(" ")}</span>
                    {l.inStock ? <span className="text-xs text-muted-foreground">Already in the fridge, freezer or cupboard</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{l.have ? "Already have" : "Add"}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Sheet>
  );
}
