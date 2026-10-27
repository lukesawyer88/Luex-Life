// My calories: private to the grown-up who switched it on. Never shown to children or on shared screens.
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronLeft, ChevronRight, Loader2, Plus, ScanBarcode, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { friendlyError } from "@/lib/family";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Sheet } from "@/modules/calendar/ui";

import type { Product } from "./barcode";
import { addDaysKey, refreshFood, SLOT_LABEL, SLOTS, todayIn, useDiary, useMyFoodSettings, useRecipes, type DiaryEntry, type Slot } from "./data";
import type { FoodTarget } from "./food-page";
import { BarcodeSheet } from "./shop-barcode";

function dayTitle(k: string, today: string) {
  if (k === today) return "Today";
  if (k === addDaysKey(today, -1)) return "Yesterday";
  const d = new Date(k + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export function CaloriesTab(_: { target: FoodTarget; onGo: (t: FoodTarget) => void }) {
  const { family, role } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const [day, setDay] = useState(today);
  const diary = useDiary(day);
  const settings = useMyFoodSettings().data;
  const [adding, setAdding] = useState<Slot | null>(null);
  const entries = diary.data ?? [];
  const total = entries.reduce((n, e) => n + (e.kcal ?? 0), 0);
  const macros = entries.reduce((m, e) => ({ p: m.p + Number(e.protein ?? 0), c: m.c + Number(e.carbs ?? 0), f: m.f + Number(e.fat ?? 0) }), { p: 0, c: 0, f: 0 });
  const target = settings?.kcal_target ?? null;

  if (role === "child" || !settings?.calories_on) {
    return <Windows><RecordsWindow><p className="text-sm">Calorie tracking is switched off. Grown-ups can switch it on in Food settings.</p></RecordsWindow></Windows>;
  }

  async function remove(e: DiaryEntry) {
    const { error } = await supabase.from("food_diary").delete().eq("id", e.id);
    if (error) { toast.error(friendlyError(error)); return; }
    void refreshFood(qc, family.id);
    toast(`Removed ${e.label}`, {
      action: {
        label: "Undo",
        onClick: () => void supabase.from("food_diary").insert({ family_id: e.family_id, member_id: e.member_id, day: e.day, slot: e.slot, label: e.label, kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat }).then(() => refreshFood(qc, family.id)),
      },
    });
  }

  const summary = (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{dayTitle(day, today)}</p>
      <p className="text-4xl font-bold">{total.toLocaleString("en-GB")} <span className="text-base font-medium text-muted-foreground">kcal</span></p>
      {target ? (
        <>
          <div className="h-3 overflow-hidden rounded-full bg-[var(--surface)]">
            <div className="h-full rounded-full bg-[var(--status-blue)]" style={{ width: `${Math.min(100, (total / target) * 100)}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">Your target: {target.toLocaleString("en-GB")} kcal</p>
        </>
      ) : null}
      <p className="text-sm">Protein {Math.round(macros.p)} g · carbs {Math.round(macros.c)} g · fat {Math.round(macros.f)} g</p>
      <p className="text-xs text-muted-foreground">All figures are estimates. Only you can see this page.</p>
    </div>
  );

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3 overflow-hidden">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setDay((d) => addDaysKey(d, -1))} aria-label="Day before"><ChevronLeft className="size-5" /></Button>
          <h2 className="flex-1 truncate text-center text-lg font-bold">{dayTitle(day, today)}</h2>
          <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setDay((d) => addDaysKey(d, 1))} disabled={day >= today} aria-label="Next day"><ChevronRight className="size-5" /></Button>
        </div>
        <div className="rounded-2xl bg-background p-3 lg:hidden">{summary}</div>
        <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {SLOTS.map((slot) => {
            const list = entries.filter((e) => e.slot === slot);
            const sub = list.reduce((n, e) => n + (e.kcal ?? 0), 0);
            return (
              <section key={slot} className="rounded-2xl bg-background p-3">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="flex-1 font-semibold">{SLOT_LABEL[slot]}</h3>
                  {sub ? <span className="text-sm text-muted-foreground">{sub} kcal</span> : null}
                  <Button variant="outline" className="h-10 rounded-full" onClick={() => setAdding(slot)}><Plus className="size-4" /> Add</Button>
                </div>
                <ul>
                  {list.map((e) => (
                    <li key={e.id} className="flex min-h-11 items-center gap-2 border-t py-1 first:border-t-0">
                      <span className="min-w-0 flex-1 truncate">{e.label}</span>
                      <span className="text-sm text-muted-foreground">{e.kcal ?? "?"} kcal</span>
                      <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => void remove(e)} aria-label={`Remove ${e.label}`}><Trash2 className="size-4" /></Button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </RecordsWindow>
      <DetailWindow>{summary}</DetailWindow>
      <AddEntrySheet slot={adding} day={day} onClose={() => setAdding(null)} />
    </Windows>
  );
}

function AddEntrySheet({ slot, day, onClose }: { slot: Slot | null; day: string; onClose: () => void }) {
  const { family, me } = useFamilyState();
  const qc = useQueryClient();
  const recipes = useRecipes();
  const [mode, setMode] = useState<"type" | "recipe" | "barcode">("type");
  const [label, setLabel] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [portions, setPortions] = useState("1");
  const [product, setProduct] = useState<Product | null>(null);
  const [grams, setGrams] = useState("100");
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);

  const withNutrition = useMemo(() => (recipes.data?.recipes ?? []).filter((r) => r.nutrition?.kcal), [recipes.data]);
  const recipe = withNutrition.find((r) => r.id === recipeId) ?? null;

  function reset() {
    setMode("type"); setLabel(""); setKcal(""); setProtein(""); setCarbs(""); setFat(""); setRecipeId(null); setPortions("1"); setProduct(null); setGrams("100");
  }

  const n = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : null);

  /** what will be saved, worked out from the chosen way of adding */
  const entry = useMemo(() => {
    if (mode === "recipe" && recipe) {
      const k = Math.max(0, n(portions) ?? 1);
      const nu = recipe.nutrition ?? {};
      const m = (v?: number | null) => (v != null ? Math.round(v * k * 10) / 10 : null);
      return { label: `${recipe.title}${k !== 1 ? ` × ${k}` : ""}`, kcal: nu.kcal != null ? Math.round(nu.kcal * k) : null, protein: m(nu.protein), carbs: m(nu.carbs), fat: m(nu.fat) };
    }
    if (mode === "barcode" && product) {
      const g = Math.max(0, n(grams) ?? 100) / 100;
      const nu = product.nutrition ?? {};
      const m = (v?: number | null) => (v != null ? Math.round(v * g * 10) / 10 : null);
      return { label: `${product.name} (${Math.round(g * 100)} g)`, kcal: nu.kcal != null ? Math.round(nu.kcal * g) : null, protein: m(nu.protein), carbs: m(nu.carbs), fat: m(nu.fat) };
    }
    return { label: label.trim(), kcal: n(kcal) != null ? Math.round(n(kcal)!) : null, protein: n(protein), carbs: n(carbs), fat: n(fat) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, recipe, portions, product, grams, label, kcal, protein, carbs, fat]);

  async function save() {
    if (!slot || !entry.label) return;
    if ([entry.kcal, entry.protein, entry.carbs, entry.fat].some((v) => v !== null && (!Number.isFinite(v) || v < 0))) { toast.error("Use numbers"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("food_diary").insert({ family_id: family.id, member_id: me.id, day, slot, label: entry.label.slice(0, 120), kcal: entry.kcal, protein: entry.protein, carbs: entry.carbs, fat: entry.fat });
      if (error) throw error;
      void refreshFood(qc, family.id);
      reset();
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet
        open={!!slot}
        onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}
        title={slot ? `Add to ${SLOT_LABEL[slot].toLowerCase()}` : ""}
        description="Estimates are fine. Only you can see this."
        footer={<Button className="h-12 w-full rounded-full text-base font-semibold" disabled={busy || !entry.label} onClick={() => void save()}>{busy ? <Loader2 className="size-4 animate-spin" /> : null} Add{entry.kcal != null ? ` · ${entry.kcal} kcal` : ""}</Button>}
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <Chip on={mode === "type"} onClick={() => setMode("type")}>Type it</Chip>
          <Chip on={mode === "recipe"} onClick={() => setMode("recipe")}><BookOpen className="size-4" /> From a recipe</Chip>
          <Chip on={mode === "barcode"} onClick={() => { setMode("barcode"); if (!product) setScan(true); }}><ScanBarcode className="size-4" /> Scan a barcode</Chip>
        </div>
        {mode === "type" ? (
          <div className="space-y-3">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What did you have?" className="h-12 text-base" aria-label="What did you have" data-autofocus />
            <Input value={kcal} onChange={(e) => setKcal(e.target.value)} inputMode="numeric" placeholder="Calories (kcal)" className="h-12" aria-label="Calories" />
            <div className="grid grid-cols-3 gap-2">
              <Input value={protein} onChange={(e) => setProtein(e.target.value)} inputMode="decimal" placeholder="Protein g" className="h-12" aria-label="Protein grams" />
              <Input value={carbs} onChange={(e) => setCarbs(e.target.value)} inputMode="decimal" placeholder="Carbs g" className="h-12" aria-label="Carbs grams" />
              <Input value={fat} onChange={(e) => setFat(e.target.value)} inputMode="decimal" placeholder="Fat g" className="h-12" aria-label="Fat grams" />
            </div>
          </div>
        ) : null}
        {mode === "recipe" ? (
          <div className="space-y-3">
            {!withNutrition.length ? <p className="text-sm text-muted-foreground">No recipes have nutrition yet. Add it on a recipe (per serving) to use it here.</p> : null}
            <ul className="space-y-1.5">
              {withNutrition.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setRecipeId(r.id)} className={cn("flex min-h-12 w-full items-center gap-2 rounded-2xl border px-3 text-left", recipeId === r.id ? "border-[var(--tile-active)]" : "border-transparent bg-[var(--surface)]")}>
                    <span className="flex-1 font-medium">{r.title}</span>
                    <span className="text-sm text-muted-foreground">{r.nutrition?.kcal} kcal a serving</span>
                  </button>
                </li>
              ))}
            </ul>
            {recipe ? (
              <label className="block text-sm font-semibold">Servings eaten
                <Input value={portions} onChange={(e) => setPortions(e.target.value)} inputMode="decimal" className="mt-1 h-12" />
              </label>
            ) : null}
          </div>
        ) : null}
        {mode === "barcode" ? (
          <div className="space-y-3">
            {product ? (
              <>
                <p className="font-semibold">{product.name}</p>
                {product.nutrition?.kcal == null ? <p className="text-sm text-[var(--status-amber)]">No calorie figure for this product. Type it in instead.</p> : <p className="text-sm text-muted-foreground">{product.nutrition.kcal} kcal per 100 g (estimate)</p>}
                <label className="block text-sm font-semibold">How much (grams)
                  <Input value={grams} onChange={(e) => setGrams(e.target.value)} inputMode="numeric" className="mt-1 h-12" />
                </label>
              </>
            ) : null}
            <Button variant="outline" className="h-11 rounded-full" onClick={() => setScan(true)}><ScanBarcode className="size-4" /> {product ? "Scan another" : "Scan a barcode"}</Button>
          </div>
        ) : null}
      </Sheet>
      <BarcodeSheet open={scan} onOpenChange={setScan} onProduct={(p) => { setProduct(p); setMode("barcode"); }} />
    </>
  );
}
