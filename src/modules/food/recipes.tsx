// The recipe box: search and filter, collections, adding (type, import a link, scan a page), and the open recipe.
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, Camera, ChevronLeft, Clock, FileDown, FolderPlus, Link2, MoreHorizontal, Pencil, Plus, Search, ShieldCheck, ThumbsUp, Trash2, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useExtra } from "@/lib/extras";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { Chip, Empty, Field, Sheet } from "@/modules/calendar/ui";

import { refreshFood, useAvoid, useFoodUrls, useRecipes, type Collection, type Recipe } from "./data";
import type { FoodTarget } from "./food-page";
import { clashes } from "./ingredients";
import { CookingMode } from "./recipe-cook";
import { draftOf, RecipeEditor, type RecipeDraft } from "./recipe-editor";
import { ImportLinkSheet, ScanPageSheet } from "./recipe-import";
import { recipesPdf } from "./recipe-pdf";
import { RecipeView } from "./recipe-view";

const TIMES = [0, 15, 30, 45, 60] as const;

export function RecipesTab({ target }: { target: FoodTarget; onGo: (t: FoodTarget) => void }) {
  const { members } = useFamilyState();
  const desktop = useDesktop();
  const q = useRecipes();
  const avoid = useAvoid().data ?? [];
  const recipes = q.data?.recipes ?? [];
  const ratings = q.data?.ratings ?? [];
  const collections = q.data?.collections ?? [];
  const showScan = useExtra("food.scan");
  const showCollections = useExtra("food.collections");
  const showRatings = useExtra("food.ratings");

  const [openId, setOpenId] = useState<string | null>(target.recipeId ?? null);
  const [search, setSearch] = useState("");
  const [coll, setColl] = useState<string | null>(null);
  const [maxTime, setMaxTime] = useState<number>(0);
  const [kidsLove, setKidsLove] = useState(false);
  const [safeFor, setSafeFor] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; draft: RecipeDraft | null }>({ open: false, draft: null });
  const [sheet, setSheet] = useState<null | "link" | "scan" | "collections">(null);
  const [cook, setCook] = useState<{ recipe: Recipe; servings: number } | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => { if (target.recipeId) setOpenId(target.recipeId); }, [target.recipeId]);

  const children = useMemo(() => new Set(members.filter((m) => m.role === "child").map((m) => m.id)), [members]);
  const thumbs = useMemo(() => {
    const m = new Map<string, { up: number; down: number; kidsUp: number }>();
    for (const r of ratings) {
      const x = m.get(r.recipe_id) ?? { up: 0, down: 0, kidsUp: 0 };
      if (r.value === 1) { x.up++; if (children.has(r.member_id)) x.kidsUp++; } else x.down++;
      m.set(r.recipe_id, x);
    }
    return m;
  }, [ratings, children]);

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    const labels = safeFor ? avoid.filter((a) => a.member_id === safeFor && a.kind !== "diet").map((a) => a.label) : [];
    return recipes.filter((r) => {
      if (s && !(r.title.toLowerCase().includes(s) || r.tags.some((t) => t.includes(s)) || (r.ingredients ?? []).some((i) => i.name.toLowerCase().includes(s)))) return false;
      if (coll && !r.collections.includes(coll)) return false;
      if (maxTime && ((r.prep_min ?? 0) + (r.cook_min ?? 0) === 0 || (r.prep_min ?? 0) + (r.cook_min ?? 0) > maxTime)) return false;
      if (kidsLove && !(thumbs.get(r.id)?.kidsUp)) return false;
      if (safeFor && clashes(labels, r.allergens, r.ingredients ?? []).length) return false;
      return true;
    });
  }, [recipes, search, coll, maxTime, kidsLove, safeFor, avoid, thumbs]);

  const urls = useFoodUrls(shown.map((r) => r.photo_path)).data;
  const open = recipes.find((r) => r.id === openId) ?? null;
  const filtersOn = !!(coll || maxTime || kidsLove || safeFor);

  async function exportAll() {
    if (!recipes.length) return;
    try {
      setExporting("Starting…");
      await recipesPdf(recipes, "family-recipes.pdf", (d, t) => setExporting(`${d} of ${t}`));
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setExporting(null);
    }
  }

  const detail = open ? (
    <RecipeView key={open.id} recipe={open} ratings={ratings.filter((r) => r.recipe_id === open.id)}
      onEdit={() => setEditor({ open: true, draft: draftOf(open) })}
      onCook={(servings) => setCook({ recipe: open, servings })}
      onArchived={() => setOpenId(null)} />
  ) : (
    <Empty icon={BookOpen} title="Pick a recipe">Tap a recipe to see it, cook it, plan it or shop for it.</Empty>
  );

  const list = (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search recipes" className="h-11 rounded-full pl-9" placeholder="Search name, ingredient or tag" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-11 rounded-full px-4 font-semibold"><Plus className="size-4" /> Add</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onSelect={() => setEditor({ open: true, draft: null })}><Pencil className="mr-2 size-4" /> Type it in</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSheet("link")}><Link2 className="mr-2 size-4" /> From a website link</DropdownMenuItem>
            {showScan ? <DropdownMenuItem onSelect={() => setSheet("scan")}><Camera className="mr-2 size-4" /> Scan a cookbook page</DropdownMenuItem> : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label="More recipe box options"><MoreHorizontal className="size-5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {showCollections ? <DropdownMenuItem onSelect={() => setSheet("collections")}><FolderPlus className="mr-2 size-4" /> Collections</DropdownMenuItem> : null}
            {showCollections ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem disabled={!recipes.length} onSelect={() => void exportAll()}><FileDown className="mr-2 size-4" /> Save all recipes as a PDF</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {showCollections ? (
        <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          <Chip on={!coll} onClick={() => setColl(null)}>All</Chip>
          {collections.map((c) => <Chip key={c.id} on={coll === c.id} onClick={() => setColl(coll === c.id ? null : c.id)}>{c.emoji ? `${c.emoji} ` : ""}{c.title}</Chip>)}
        </div>
      ) : null}
      <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium", maxTime ? "border-transparent bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "border-[var(--surface-border)] bg-[var(--surface)]")}>
              <Clock className="size-4" /> {maxTime ? `Up to ${maxTime} min` : "Any time"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {TIMES.map((t) => <DropdownMenuItem key={t} onSelect={() => setMaxTime(t)}>{t ? `Up to ${t} minutes` : "Any time"}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        {showRatings && children.size ? <Chip on={kidsLove} onClick={() => setKidsLove((x) => !x)}><ThumbsUp className="size-4" /> Loved by the kids</Chip> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium", safeFor ? "border-transparent bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "border-[var(--surface-border)] bg-[var(--surface)]")}>
              <ShieldCheck className="size-4" /> {safeFor ? `Safe for ${members.find((m) => m.id === safeFor)?.display_name ?? ""}` : "Safe for…"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => setSafeFor(null)}>Anyone</DropdownMenuItem>
            {members.filter((m) => avoid.some((a) => a.member_id === m.id)).map((m) => <DropdownMenuItem key={m.id} onSelect={() => setSafeFor(m.id)}>{m.display_name}</DropdownMenuItem>)}
            {!avoid.length ? <p className="px-2 py-1.5 text-xs text-muted-foreground">Add allergies and dislikes in Food settings.</p> : null}
          </DropdownMenuContent>
        </DropdownMenu>
        {filtersOn ? <Chip on={false} onClick={() => { setColl(null); setMaxTime(0); setKidsLove(false); setSafeFor(null); }}><X className="size-4" /> Clear</Chip> : null}
      </div>
      {exporting ? <p className="text-sm text-muted-foreground">Making the PDF: {exporting}</p> : null}

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
        {q.isLoading ? <p className="p-4 text-sm text-muted-foreground">Loading recipes…</p> : null}
        {!q.isLoading && !recipes.length ? (
          <Empty icon={BookOpen} title="No recipes yet">Add your family favourites: type them in or bring one in from a website{showScan ? ", or scan a cookbook page" : ""}.</Empty>
        ) : null}
        {recipes.length && !shown.length ? <p className="p-4 text-sm text-muted-foreground">No recipes match. Try fewer filters.</p> : null}
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-3">
          {shown.map((r) => {
            const t = thumbs.get(r.id);
            const mins = (r.prep_min ?? 0) + (r.cook_min ?? 0);
            const url = urls?.get(r.photo_path ?? "");
            return (
              <li key={r.id}>
                <button type="button" onClick={() => setOpenId(r.id)} aria-current={openId === r.id}
                  className={cn("flex h-full w-full flex-col overflow-hidden rounded-2xl bg-[var(--surface)] text-left transition hover:brightness-95", openId === r.id && "ring-2 ring-[var(--tile-active)]")}>
                  {url ? <img src={url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" /> : <span className="grid aspect-[4/3] w-full place-items-center text-muted-foreground"><BookOpen className="size-8" /></span>}
                  <span className="flex flex-1 flex-col gap-1 p-2.5">
                    <span className="line-clamp-2 font-semibold leading-snug">{r.title}</span>
                    <span className="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
                      {mins ? <span className="inline-flex items-center gap-0.5"><Clock className="size-3.5" />{mins} min</span> : null}
                      {showRatings && t?.up ? <span className="inline-flex items-center gap-0.5"><ThumbsUp className="size-3.5" />{t.up}</span> : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );

  return (
    <>
      {desktop || !open ? (
        <Windows>
          <RecordsWindow className="flex flex-col overflow-hidden">{list}</RecordsWindow>
          <DetailWindow>{detail}</DetailWindow>
        </Windows>
      ) : (
        <Windows>
          <RecordsWindow>
            <Button variant="ghost" className="mb-2 h-10 rounded-full px-2" onClick={() => setOpenId(null)}><ChevronLeft className="size-5" /> All recipes</Button>
            {detail}
          </RecordsWindow>
        </Windows>
      )}

      <RecipeEditor open={editor.open} initial={editor.draft} onOpenChange={(o) => setEditor((x) => ({ ...x, open: o }))} onSaved={(id) => setOpenId(id)} />
      <ImportLinkSheet open={sheet === "link"} onOpenChange={(o) => setSheet(o ? "link" : null)} onDraft={(d) => setEditor({ open: true, draft: d })} />
      <ScanPageSheet open={sheet === "scan"} onOpenChange={(o) => setSheet(o ? "scan" : null)} onDraft={(d) => setEditor({ open: true, draft: d })} />
      <CollectionsSheet open={sheet === "collections"} onOpenChange={(o) => setSheet(o ? "collections" : null)} collections={collections} />
      {cook ? <CookingMode recipe={cook.recipe} servings={cook.servings} onClose={() => setCook(null)} /> : null}
    </>
  );
}

function CollectionsSheet({ open, onOpenChange, collections }: { open: boolean; onOpenChange: (o: boolean) => void; collections: Collection[] }) {
  const { family, me, isParent } = useFamilyState();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [edit, setEdit] = useState<{ id: string; title: string } | null>(null);

  async function run(p: PromiseLike<{ error: unknown }>, ok?: string) {
    const { error } = await p;
    if (error) { toast.error(friendlyError(error)); return false; }
    await refreshFood(qc, family.id);
    if (ok) toast.success(ok);
    return true;
  }

  async function add() {
    if (!title.trim()) return;
    if (await run(supabase.from("food_collections").insert({ family_id: family.id, title: title.trim().slice(0, 60), emoji: emoji.trim() || null, position: collections.length } as never))) {
      setTitle(""); setEmoji("");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Collections" description="Group recipes, like Family classics, Gran's recipes or Quick weeknights. Add recipes to a collection when you change a recipe.">
      <ul className="mb-4 space-y-2">
        {collections.map((c) => {
          const mine = isParent || c.created_by === me.id;
          return (
            <li key={c.id} className="flex items-center gap-2 rounded-2xl bg-[var(--surface)] p-2">
              {edit?.id === c.id ? (
                <>
                  <Input className="h-10 flex-1" value={edit.title} maxLength={60} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
                  <Button className="h-10 rounded-full" disabled={!edit.title.trim()} onClick={async () => { if (await run(supabase.from("food_collections").update({ title: edit.title.trim() } as never).eq("id", c.id))) setEdit(null); }}>Save</Button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-semibold">{c.emoji ? `${c.emoji} ` : ""}{c.title}</span>
                  {mine ? <Button variant="ghost" size="icon" className="size-10" aria-label={`Rename ${c.title}`} onClick={() => setEdit({ id: c.id, title: c.title })}><Pencil className="size-4" /></Button> : null}
                  {mine ? <Button variant="ghost" size="icon" className="size-10" aria-label={`Remove ${c.title}`} onClick={() => void run(supabase.from("food_collections").delete().eq("id", c.id), "Collection removed (the recipes are kept)")}><Trash2 className="size-4" /></Button> : null}
                </>
              )}
            </li>
          );
        })}
      </ul>
      <Field label="New collection">
        <div className="flex gap-2">
          <Input aria-label="Emoji" className="h-11 w-14 text-center" maxLength={4} value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="⭐" />
          <Input aria-label="Collection name" className="h-11 flex-1" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Family classics" onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
          <Button className="h-11 rounded-full" disabled={!title.trim()} onClick={() => void add()}><Plus className="size-4" /> Add</Button>
        </div>
      </Field>
    </Sheet>
  );
}
