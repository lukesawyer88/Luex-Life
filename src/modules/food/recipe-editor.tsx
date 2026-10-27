// Add or change a recipe. Also opened prefilled after importing a link or scanning a cookbook page.
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Camera, Clock, ListPlus, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { friendlyError } from "@/lib/family";
import { useExtra } from "@/lib/extras";
import { useFamilyState } from "@/lib/family-context";
import { fitJpeg } from "@/lib/image";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Field, Sheet } from "@/modules/calendar/ui";

import { refreshFood, uploadFoodPhoto, useFoodUrls, useRecipes, type Nutrition, type Recipe, type Step, type TimelineStep } from "./data";
import { ALLERGENS, parseIngredient, suggestAllergens, type Ingredient } from "./ingredients";

export type RecipeDraft = {
  id?: string;
  title: string;
  description: string;
  photo_path: string | null;
  source_url: string | null;
  servings: number;
  prep_min: number | null;
  cook_min: number | null;
  ingredients: Ingredient[];
  steps: Step[];
  tags: string[];
  allergens: string[];
  collections: string[];
  notes: string;
  nutrition: Nutrition | null;
  timeline: TimelineStep[] | null;
};

export function emptyDraft(): RecipeDraft {
  return {
    title: "", description: "", photo_path: null, source_url: null, servings: 4, prep_min: null, cook_min: null,
    ingredients: [], steps: [], tags: [], allergens: [], collections: [], notes: "", nutrition: null, timeline: null,
  };
}

export function draftOf(r: Recipe): RecipeDraft {
  return {
    id: r.id, title: r.title, description: r.description, photo_path: r.photo_path, source_url: r.source_url, servings: r.servings,
    prep_min: r.prep_min, cook_min: r.cook_min, ingredients: r.ingredients ?? [], steps: r.steps ?? [], tags: r.tags, allergens: r.allergens,
    collections: r.collections, notes: r.notes, nutrition: r.nutrition, timeline: r.timeline,
  };
}

const num = (s: string): number | null => {
  const n = Number(s.replace(",", "."));
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};

/** Saves a draft (new or existing); returns the recipe id */
export async function saveDraft(familyId: string, d: RecipeDraft): Promise<string> {
  const clean = {
    title: d.title.trim().slice(0, 120),
    description: d.description.trim().slice(0, 2000),
    photo_path: d.photo_path,
    source_url: d.source_url,
    servings: Math.min(100, Math.max(1, Math.round(d.servings || 1))),
    prep_min: d.prep_min,
    cook_min: d.cook_min,
    ingredients: d.ingredients
      .filter((i) => i.name.trim())
      .map((i) => ({ qty: i.qty, unit: i.unit?.trim() || null, name: i.name.trim(), ...(i.note?.trim() ? { note: i.note.trim() } : {}) })),
    steps: d.steps.filter((s) => s.text.trim()).map((s) => ({ text: s.text.trim(), timer_s: s.timer_s || null, uses: s.uses ?? [] })),
    tags: [...new Set(d.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 30),
    allergens: d.allergens,
    collections: d.collections,
    notes: d.notes.trim().slice(0, 4000),
    nutrition: d.nutrition && Object.values(d.nutrition).some((v) => v != null) ? d.nutrition : null,
    timeline: d.timeline && d.timeline.length ? d.timeline.filter((t) => t.text.trim()) : null,
  };
  if (!clean.title) throw new Error("Give the recipe a name");
  if (d.id) {
    const { error } = await supabase.from("food_recipes").update(clean as never).eq("id", d.id);
    if (error) throw error;
    return d.id;
  }
  const { data, error } = await supabase.from("food_recipes").insert({ ...clean, family_id: familyId } as never).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export function RecipeEditor({
  open, onOpenChange, initial, onSaved,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; initial: RecipeDraft | null; onSaved?: (id: string) => void;
}) {
  const { family, role } = useFamilyState();
  const qc = useQueryClient();
  const collections = useRecipes().data?.collections ?? [];
  const showCollections = useExtra("food.collections");
  const showNutrition = useExtra("food.nutrition");
  const showTimeline = useExtra("food.seasonal");
  const [d, setD] = useState<RecipeDraft>(initial ?? emptyDraft());
  const [bulk, setBulk] = useState("");
  const [tagText, setTagText] = useState("");
  const [busy, setBusy] = useState(false);
  const [extras, setExtras] = useState({ nutrition: false, timeline: false });
  const fileRef = useRef<HTMLInputElement>(null);
  const photoUrl = useFoodUrls([d.photo_path]).data?.get(d.photo_path ?? "");
  const isChild = role === "child";

  useEffect(() => {
    if (!open) return;
    const start = initial ?? emptyDraft();
    // allergens suggested from the ingredients, for the person to confirm (only for new recipes that have none)
    if (!start.id && start.allergens.length === 0 && start.ingredients.length) start.allergens = suggestAllergens(start.ingredients);
    setD(start);
    setBulk("");
    setTagText("");
    setExtras({ nutrition: !!start.nutrition, timeline: !!start.timeline?.length });
  }, [open, initial]);

  const set = <K extends keyof RecipeDraft>(k: K, v: RecipeDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setIng = (i: number, patch: Partial<Ingredient>) => set("ingredients", d.ingredients.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setStep = (i: number, patch: Partial<Step>) => set("steps", d.steps.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = <T,>(arr: T[], i: number, by: number): T[] => {
    const j = i + by;
    if (j < 0 || j >= arr.length) return arr;
    const out = [...arr];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  };

  function addBulk() {
    const lines = bulk.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const parsed = lines.map(parseIngredient);
    const all = [...d.ingredients, ...parsed];
    setD((x) => ({ ...x, ingredients: all, allergens: [...new Set([...x.allergens, ...suggestAllergens(parsed)])] }));
    setBulk("");
  }

  async function pickPhoto(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      const blob = await fitJpeg(f, 1600);
      set("photo_path", await uploadFoodPhoto(family.id, blob, "recipes"));
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      // collections removed since this recipe was saved are dropped (the database refuses unknown ones)
      const id = await saveDraft(family.id, { ...d, collections: d.collections.filter((c) => collections.some((x) => x.id === c)) });
      await refreshFood(qc, family.id);
      toast.success(d.id ? "Recipe saved" : "Recipe added");
      onOpenChange(false);
      onSaved?.(id);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const nut = d.nutrition ?? {};
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={d.id ? "Change recipe" : "New recipe"}
      footer={
        <>
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="ml-auto h-11 rounded-full px-6 text-base font-semibold" disabled={busy || !d.title.trim()} onClick={save}>Save recipe</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Name">
          <Input data-autofocus value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="Shepherd's pie" className="h-11 text-base" maxLength={120} />
        </Field>

        <div className="flex items-center gap-3">
          {photoUrl ? (
            <div className="relative">
              <img src={photoUrl} alt="" className="size-24 rounded-2xl object-cover" />
              <button type="button" aria-label="Remove photo" className="absolute -right-2 -top-2 grid size-8 place-items-center rounded-full bg-[var(--surface)] shadow" onClick={() => set("photo_path", null)}><X className="size-4" /></button>
            </div>
          ) : null}
          <Button variant="outline" className="h-11 rounded-full" disabled={busy} onClick={() => fileRef.current?.click()}><Camera className="size-4" /> {d.photo_path ? "Change photo" : "Add a photo"}</Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </div>

        <Field label="About it" hint="Optional">
          <Textarea value={d.description} onChange={(e) => set("description", e.target.value)} rows={2} maxLength={2000} />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Serves">
            <Input type="number" inputMode="numeric" min={1} max={100} value={d.servings} onChange={(e) => set("servings", Number(e.target.value) || 1)} className="h-11" />
          </Field>
          <Field label="Prep (mins)">
            <Input type="number" inputMode="numeric" min={0} value={d.prep_min ?? ""} onChange={(e) => set("prep_min", num(e.target.value))} className="h-11" />
          </Field>
          <Field label="Cook (mins)">
            <Input type="number" inputMode="numeric" min={0} value={d.cook_min ?? ""} onChange={(e) => set("cook_min", num(e.target.value))} className="h-11" />
          </Field>
        </div>

        {/* ingredients */}
        <section className="space-y-2">
          <h3 className="text-sm font-bold">Ingredients</h3>
          {d.ingredients.map((ing, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-[var(--surface)] p-2">
              <Input aria-label="Amount" className="h-10 w-16" inputMode="decimal" value={ing.qty === null ? "" : String(Math.round(ing.qty * 100) / 100)} onChange={(e) => setIng(i, { qty: num(e.target.value) })} />
              <Input aria-label="Unit" className="h-10 w-16" value={ing.unit ?? ""} onChange={(e) => setIng(i, { unit: e.target.value || null })} placeholder="g" />
              <Input aria-label="Ingredient" className="h-10 min-w-[8rem] flex-1" value={ing.name} onChange={(e) => setIng(i, { name: e.target.value })} />
              <Input aria-label="Note" className="h-10 w-full sm:w-36" value={ing.note ?? ""} onChange={(e) => setIng(i, { note: e.target.value || undefined })} placeholder="chopped" />
              <div className="flex">
                <Button variant="ghost" size="icon" className="size-9" aria-label="Move up" onClick={() => set("ingredients", move(d.ingredients, i, -1))}><ArrowUp className="size-4" /></Button>
                <Button variant="ghost" size="icon" className="size-9" aria-label="Move down" onClick={() => set("ingredients", move(d.ingredients, i, 1))}><ArrowDown className="size-4" /></Button>
                <Button variant="ghost" size="icon" className="size-9" aria-label="Remove ingredient" onClick={() => set("ingredients", d.ingredients.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          ))}
          <Textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={3} placeholder={"Type or paste, one per line:\n500g beef mince\n2 onions, chopped"} />
          <Button variant="outline" className="h-10 rounded-full" disabled={!bulk.trim()} onClick={addBulk}><ListPlus className="size-4" /> Add these ingredients</Button>
        </section>

        {/* steps */}
        <section className="space-y-2">
          <h3 className="text-sm font-bold">Steps</h3>
          {d.steps.map((s, i) => (
            <div key={i} className="space-y-2 rounded-2xl bg-[var(--surface)] p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 grid size-7 shrink-0 place-items-center rounded-full bg-[var(--tile-active)] text-sm font-bold text-[var(--tile-active-fg)]">{i + 1}</span>
                <Textarea aria-label={`Step ${i + 1}`} value={s.text} onChange={(e) => setStep(i, { text: e.target.value })} rows={2} className="flex-1" />
                <div className="flex flex-col">
                  <Button variant="ghost" size="icon" className="size-8" aria-label="Move up" onClick={() => set("steps", move(d.steps, i, -1))}><ArrowUp className="size-4" /></Button>
                  <Button variant="ghost" size="icon" className="size-8" aria-label="Move down" onClick={() => set("steps", move(d.steps, i, 1))}><ArrowDown className="size-4" /></Button>
                  <Button variant="ghost" size="icon" className="size-8" aria-label="Remove step" onClick={() => set("steps", d.steps.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-9">
                <Clock className="size-4 text-muted-foreground" />
                <Input aria-label="Timer minutes" className="h-9 w-20" inputMode="numeric" placeholder="Timer" value={s.timer_s ? String(Math.round(s.timer_s / 60)) : ""} onChange={(e) => { const m = num(e.target.value); setStep(i, { timer_s: m ? Math.round(m * 60) : null }); }} />
                <span className="text-xs text-muted-foreground">mins</span>
              </div>
              {d.ingredients.length ? (
                <div className="flex flex-wrap gap-1.5 pl-9">
                  <span className="w-full text-xs text-muted-foreground">Uses (optional)</span>
                  {d.ingredients.map((ing, k) => {
                    const on = (s.uses ?? []).includes(k);
                    return (
                      <button key={k} type="button" aria-pressed={on} onClick={() => setStep(i, { uses: on ? (s.uses ?? []).filter((x) => x !== k) : [...(s.uses ?? []), k] })}
                        className={cn("min-h-8 rounded-full border px-2.5 text-xs", on ? "border-transparent bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "border-[var(--surface-border)]")}>
                        {ing.name || "?"}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
          <Button variant="outline" className="h-10 rounded-full" onClick={() => set("steps", [...d.steps, { text: "", timer_s: null, uses: [] }])}><Plus className="size-4" /> Add a step</Button>
        </section>

        <Field label="Contains" hint="We've ticked what the ingredients suggest. Please check: this is a help, not a guarantee.">
          <div className="flex flex-wrap gap-1.5">
            {ALLERGENS.map((a) => (
              <Chip key={a.key} on={d.allergens.includes(a.key)} onClick={() => set("allergens", d.allergens.includes(a.key) ? d.allergens.filter((x) => x !== a.key) : [...d.allergens, a.key])}>{a.label}</Chip>
            ))}
          </div>
        </Field>

        <Field label="Tags" hint="For example: quick, vegetarian, batch">
          <div className="flex flex-wrap items-center gap-1.5">
            {d.tags.map((t) => (
              <button key={t} type="button" className="inline-flex min-h-9 items-center gap-1 rounded-full bg-[var(--surface)] px-3 text-sm" onClick={() => set("tags", d.tags.filter((x) => x !== t))}>{t} <X className="size-3.5" /></button>
            ))}
            <Input className="h-9 w-40" value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="Add a tag"
              onKeyDown={(e) => { if (e.key === "Enter" && tagText.trim()) { e.preventDefault(); set("tags", [...d.tags, tagText.trim().toLowerCase()]); setTagText(""); } }} />
          </div>
        </Field>

        {showCollections && collections.length ? (
          <Field label="Collections">
            <div className="flex flex-wrap gap-1.5">
              {collections.map((c) => (
                <Chip key={c.id} on={d.collections.includes(c.id)} onClick={() => set("collections", d.collections.includes(c.id) ? d.collections.filter((x) => x !== c.id) : [...d.collections, c.id])}>{c.emoji ? `${c.emoji} ` : ""}{c.title}</Chip>
              ))}
            </div>
          </Field>
        ) : null}

        {showCollections ? (
          <Field label="Notes" hint={`For example: "Tom says less chilli"`}>
            <Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={2} maxLength={4000} />
          </Field>
        ) : null}

        {showNutrition && !isChild ? (
          <section className="space-y-2">
            <Chip on={extras.nutrition} onClick={() => { const on = !extras.nutrition; setExtras((x) => ({ ...x, nutrition: on })); if (!on) set("nutrition", null); }}>Nutrition per serving (estimate)</Chip>
            {extras.nutrition ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["kcal", "protein", "carbs", "fat"] as const).map((k) => (
                  <Field key={k} label={{ kcal: "Calories", protein: "Protein (g)", carbs: "Carbs (g)", fat: "Fat (g)" }[k]}>
                    <Input inputMode="decimal" className="h-10" value={nut[k] ?? ""} onChange={(e) => set("nutrition", { ...nut, [k]: num(e.target.value) })} />
                  </Field>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {showTimeline ? <section className="space-y-2">
          <Chip on={extras.timeline} onClick={() => { const on = !extras.timeline; setExtras((x) => ({ ...x, timeline: on })); if (!on) set("timeline", null); else if (!d.timeline?.length) set("timeline", [{ before_min: 60, text: "" }]); }}>Cooking timeline (for a big meal like Christmas dinner)</Chip>
          {extras.timeline ? (
            <div className="space-y-2">
              {(d.timeline ?? []).map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input aria-label="Minutes before serving" className="h-10 w-20" inputMode="numeric" value={t.before_min} onChange={(e) => set("timeline", (d.timeline ?? []).map((x, j) => (j === i ? { ...x, before_min: Math.max(0, Math.round(num(e.target.value) ?? 0)) } : x)))} />
                  <span className="shrink-0 text-xs text-muted-foreground">mins before</span>
                  <Input aria-label="What to do" className="h-10 flex-1" value={t.text} placeholder="Turkey in the oven" onChange={(e) => set("timeline", (d.timeline ?? []).map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                  <Button variant="ghost" size="icon" className="size-9" aria-label="Remove" onClick={() => set("timeline", (d.timeline ?? []).filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                </div>
              ))}
              <Button variant="outline" className="h-10 rounded-full" onClick={() => set("timeline", [...(d.timeline ?? []), { before_min: 30, text: "" }])}><Plus className="size-4" /> Add a job</Button>
            </div>
          ) : null}
        </section> : null}

        {d.source_url ? <p className="truncate text-xs text-muted-foreground">From {d.source_url}</p> : null}
      </div>
    </Sheet>
  );
}
