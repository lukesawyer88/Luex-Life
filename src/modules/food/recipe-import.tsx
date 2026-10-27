// Two quick ways to bring a recipe in: a website link, or a photo of a cookbook page (read on the phone).
// Both open the recipe editor prefilled, so the person checks everything before it's saved.
import { Camera, Link2, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { fitJpeg } from "@/lib/image";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Field, Sheet } from "@/modules/calendar/ui";

import { uploadFoodPhoto } from "./data";
import { parseIngredient } from "./ingredients";
import { emptyDraft, type RecipeDraft } from "./recipe-editor";
import { recognise } from "./scan-text";

type Imported = {
  title: string; description: string; servings: number | null; prepMin: number | null; cookMin: number | null;
  ingredients: string[]; steps: string[]; tags: string[]; kcal: number | null; sourceUrl: string; photo: { base64: string; type: string } | null;
};

async function errorText(e: unknown): Promise<string> {
  // supabase-js puts the function's JSON reply on the error's context
  const ctx = (e as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try { const j = await ctx.json(); if (j?.error) return String(j.error); } catch { /* fall through */ }
  }
  return "Couldn't read that page. Check the link and your signal";
}

/** the website's picture, shrunk and saved under this person's own rules (none if that fails) */
async function savePhoto(familyId: string, photo: Imported["photo"]): Promise<string | null> {
  if (!photo) return null;
  try {
    const bin = atob(photo.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], "recipe", { type: photo.type });
    return await uploadFoodPhoto(familyId, await fitJpeg(file, 1600), "recipes");
  } catch {
    return null;
  }
}

export function ImportLinkSheet({ open, onOpenChange, onDraft }: { open: boolean; onOpenChange: (o: boolean) => void; onDraft: (d: RecipeDraft) => void }) {
  const { family } = useFamilyState();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke("recipe-import", { body: { url: url.trim() } });
      if (error) { setErr(await errorText(error)); return; }
      const r = (data as { recipe?: Imported; error?: string })?.recipe;
      if (!r) { setErr((data as { error?: string })?.error ?? "Couldn't read that page"); return; }
      const d: RecipeDraft = {
        ...emptyDraft(),
        title: r.title,
        description: r.description,
        servings: r.servings ?? 4,
        prep_min: r.prepMin,
        cook_min: r.cookMin,
        ingredients: r.ingredients.map(parseIngredient),
        steps: r.steps.map((text) => ({ text, timer_s: null, uses: [] })),
        tags: r.tags,
        source_url: r.sourceUrl,
        photo_path: await savePhoto(family.id, r.photo),
        nutrition: r.kcal ? { kcal: r.kcal } : null,
      };
      setUrl("");
      onOpenChange(false);
      onDraft(d);
    } catch (e) {
      setErr(await errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add a recipe from a website"
      description="Paste the recipe's web address. You'll check everything before it's saved. It stays private to your family."
      footer={<Button className="ml-auto h-11 rounded-full px-6 text-base font-semibold" disabled={busy || !url.trim()} onClick={go}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />} Bring it in</Button>}
    >
      <Field label="Web address">
        <Input data-autofocus type="url" inputMode="url" className="h-12 text-base" placeholder="https://www.bbcgoodfood.com/recipes/…" value={url} onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && url.trim() && !busy) void go(); }} />
      </Field>
      {err ? (
        <div className="mt-4 rounded-2xl bg-[var(--status-amber-soft)] p-3 text-sm text-[var(--status-amber)]">
          <p className="font-semibold">{err}</p>
          <p className="mt-1">You can scan it from a photo or type it in instead.</p>
        </div>
      ) : null}
    </Sheet>
  );
}

type Role = "title" | "ingredient" | "step" | "ignore";
const ROLE_LABEL: Record<Role, string> = { title: "Title", ingredient: "Ingredient", step: "Step", ignore: "Ignore" };
const UNIT_START = /^(\d|[½¼¾⅓⅔⅛]|a\s+(pinch|handful)|pinch|handful|salt|pepper)/i;

function guess(lines: string[]): Role[] {
  let titled = false;
  return lines.map((l) => {
    if (!titled && l.length >= 3 && l.length <= 60 && !UNIT_START.test(l)) { titled = true; return "title"; }
    if (/^(ingredients|method|serves|preparation|directions|instructions)\b/i.test(l)) return "ignore";
    if (/^\d+[.)]\s/.test(l) || l.length > 45) return "step";
    if (UNIT_START.test(l)) return "ingredient";
    return l.length < 4 ? "ignore" : "step";
  });
}

/** Turn tagged lines into a draft: wrapped step lines are joined until a sentence ends or a new number starts */
function toDraft(lines: string[], roles: Role[]): RecipeDraft {
  const d = emptyDraft();
  const steps: string[] = [];
  lines.forEach((l, i) => {
    const r = roles[i];
    if (r === "title") d.title = d.title ? `${d.title} ${l}` : l;
    else if (r === "ingredient") d.ingredients.push(parseIngredient(l));
    else if (r === "step") {
      const starts = /^\d+[.)]\s/.test(l);
      const text = l.replace(/^\d+[.)]\s*/, "");
      const last = steps[steps.length - 1];
      if (!starts && last && !/[.!?]$/.test(last)) steps[steps.length - 1] = `${last} ${text}`;
      else steps.push(text);
    }
  });
  d.steps = steps.map((text) => ({ text, timer_s: null, uses: [] }));
  const serves = lines.map((l) => /serves\s+(\d+)/i.exec(l)).find(Boolean);
  if (serves) d.servings = Math.min(100, Number(serves[1]));
  return d;
}

export function ScanPageSheet({ open, onOpenChange, onDraft }: { open: boolean; onOpenChange: (o: boolean) => void; onDraft: (d: RecipeDraft) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [err, setErr] = useState<string | null>(null);

  function reset() { setLines([]); setRoles([]); setErr(null); setProgress(null); }

  async function read(f: File | undefined) {
    if (!f) return;
    setErr(null);
    setProgress(0);
    try {
      const got = await recognise(f, setProgress);
      if (!got.length) setErr("No writing found. Try a clearer, straighter photo in good light");
      // add to what's already there, so a recipe over two pages can be scanned in two goes
      setLines((x) => [...x, ...got]);
      setRoles((x) => [...x, ...guess(got).map((r) => (x.includes("title") && r === "title" ? "step" : r))]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't read that picture");
    } finally {
      setProgress(null);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}
      wide
      title="Scan a cookbook page"
      description="Printed books work well; handwriting usually won't. The page is read on this device and the photo isn't kept."
      footer={
        <>
          <Button variant="outline" className="h-11 rounded-full" disabled={progress !== null} onClick={() => fileRef.current?.click()}><Camera className="size-4" /> {lines.length ? "Scan another page" : "Take or choose a photo"}</Button>
          <Button className="ml-auto h-11 rounded-full px-6 text-base font-semibold" disabled={!lines.length || progress !== null}
            onClick={() => { const d = toDraft(lines, roles); reset(); onOpenChange(false); onDraft(d); }}>Make the recipe</Button>
        </>
      }
    >
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ""; }} />
      {progress !== null ? (
        <div className="space-y-2 py-6 text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
          <p className="font-semibold">Reading the page…</p>
          <div className="mx-auto h-2 max-w-xs overflow-hidden rounded-full bg-[var(--surface)]"><div className="h-full bg-[var(--tile-active)] transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <p className="text-xs text-muted-foreground">The first scan takes a little longer while the reader loads.</p>
        </div>
      ) : null}
      {err ? <p className="mb-3 rounded-2xl bg-[var(--status-amber-soft)] p-3 text-sm font-semibold text-[var(--status-amber)]">{err}</p> : null}
      {!lines.length && progress === null ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <Camera className="mx-auto mb-2 size-10" />
          Lay the book flat, fill the screen with the page, and make sure it's well lit.
        </div>
      ) : null}
      {lines.length && progress === null ? (
        <>
          <p className="mb-3 text-sm">Tap what each line is. We've had a guess.</p>
          <ul className="space-y-2">
            {lines.map((l, i) => (
              <li key={i} className={cn("rounded-2xl p-2.5", roles[i] === "ignore" ? "bg-transparent opacity-50" : "bg-[var(--surface)]")}>
                <p className="mb-1.5 text-sm">{l}</p>
                <div className="flex flex-wrap gap-1">
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                    <button key={r} type="button" aria-pressed={roles[i] === r} onClick={() => setRoles((x) => x.map((y, j) => (j === i ? r : y)))}
                      className={cn("min-h-9 rounded-full px-3 text-xs font-semibold", roles[i] === r ? "bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "border border-[var(--surface-border)]")}>
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Sheet>
  );
}
