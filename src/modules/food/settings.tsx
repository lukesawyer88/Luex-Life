// Food settings: allergies, dislikes and diets per person; my calories (grown-ups); the family's aisles.
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useFamilyState } from "@/lib/family-context";
import { friendlyError, type Member } from "@/lib/family";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Sheet } from "@/modules/calendar/ui";

import { DEFAULT_AISLES, refreshFood, useAvoid, useMyFoodSettings, useShopping, type Aisle, type Avoid } from "./data";
import { ALLERGENS } from "./ingredients";

type Kind = Avoid["kind"];
const KINDS: { key: Kind; label: string }[] = [
  { key: "allergy", label: "Allergy" }, { key: "dislike", label: "Doesn't like" }, { key: "diet", label: "Diet" },
];
const DIETS = ["Vegetarian", "Vegan", "Pescatarian", "Halal", "Kosher", "Gluten-free", "Dairy-free"];

export function FoodSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { role } = useFamilyState();
  const adult = role !== "child";
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Food settings" wide>
      <div className="space-y-6">
        <AvoidSection />
        {adult ? <CaloriesSection /> : null}
        {adult ? <AislesSection /> : null}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- allergies, dislikes and diets

function AvoidSection() {
  const { members, me, isParent, role } = useFamilyState();
  const avoid = useAvoid().data ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  const canEdit = (m: Member) => isParent || (m.id === me.id && role !== "child");

  return (
    <section>
      <h3 className="text-base font-bold">Allergies, dislikes and diets</h3>
      <p className="mb-3 text-sm text-muted-foreground">These help with warnings on the meal plan and recipes. Always check labels.</p>
      <ul className="space-y-2">
        {members.filter((m) => !m.archived_at).map((m) => {
          const mine = avoid.filter((a) => a.member_id === m.id);
          return (
            <li key={m.id} className="rounded-2xl bg-[var(--surface)] p-3">
              <div className="flex items-center gap-2">
                <MemberAvatar member={m} size="sm" />
                <span className="flex-1 font-semibold">{m.display_name}</span>
                {canEdit(m) ? (
                  <Button variant="ghost" className="h-10 rounded-full" onClick={() => setEditing(editing === m.id ? null : m.id)}>
                    {editing === m.id ? "Done" : <><Plus className="size-4" /> Add</>}
                  </Button>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {mine.length ? mine.map((a) => <AvoidChip key={a.id} a={a} canRemove={canEdit(m)} />) : <span className="text-sm text-muted-foreground">Nothing to avoid</span>}
              </div>
              {editing === m.id ? <AddAvoid member={m} existing={mine} /> : null}
            </li>
          );
        })}
      </ul>
      {!isParent ? <p className="mt-2 text-xs text-muted-foreground">Parents set children's allergies. Grown-ups can set their own.</p> : null}
    </section>
  );
}

function AvoidChip({ a, canRemove }: { a: Avoid; canRemove: boolean }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  async function remove() {
    const { error } = await supabase.from("food_avoid").delete().eq("id", a.id);
    if (error) { toast.error(friendlyError(error)); return; }
    void refreshFood(qc, family.id);
    toast(`Removed ${a.label}`, {
      action: { label: "Undo", onClick: () => void supabase.from("food_avoid").insert({ family_id: a.family_id, member_id: a.member_id, kind: a.kind, label: a.label }).then(() => refreshFood(qc, family.id)) },
    });
  }
  const tone = a.kind === "allergy" ? "bg-[var(--status-red-soft)] text-[var(--status-red)]" : a.kind === "diet" ? "bg-[var(--status-green-soft)] text-[var(--status-green)]" : "bg-background";
  return (
    <span className={cn("inline-flex min-h-9 items-center gap-1 rounded-full pl-3 pr-1 text-sm font-medium", tone)}>
      {a.kind === "allergy" ? "Allergy: " : a.kind === "dislike" ? "Doesn't like: " : ""}{a.label}
      {canRemove ? (
        <button type="button" onClick={() => void remove()} className="grid size-8 place-items-center rounded-full" aria-label={`Remove ${a.label}`}><X className="size-4" /></button>
      ) : <span className="w-2" />}
    </span>
  );
}

function AddAvoid({ member, existing }: { member: Member; existing: Avoid[] }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("allergy");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const has = (label: string) => existing.some((e) => e.kind === kind && e.label.toLowerCase() === label.toLowerCase());

  async function add(label: string) {
    const l = label.trim().slice(0, 40);
    if (!l || has(l)) return;
    setBusy(true);
    const { error } = await supabase.from("food_avoid").insert({ family_id: family.id, member_id: member.id, kind, label: l });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    setText("");
    void refreshFood(qc, family.id);
  }

  const suggestions = kind === "allergy" ? ALLERGENS.map((a) => a.label) : kind === "diet" ? DIETS : ["Mushrooms", "Spicy food", "Fish", "Onions", "Tomatoes", "Olives"];
  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => <Chip key={k.key} on={kind === k.key} onClick={() => setKind(k.key)}>{k.label}</Chip>)}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.filter((s) => !has(s)).map((s) => (
          <button key={s} type="button" disabled={busy} onClick={() => void add(s)} className="min-h-9 rounded-full border border-[var(--surface-border)] bg-background px-3 text-sm">+ {s}</button>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void add(text); }}>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Or type one" className="h-11 flex-1" aria-label={`Add for ${member.display_name}`} />
        <Button type="submit" className="h-11 rounded-full" disabled={busy || !text.trim()}>Add</Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- my calories (grown-ups, private)

function CaloriesSection() {
  const { family, me } = useFamilyState();
  const qc = useQueryClient();
  const settings = useMyFoodSettings();
  const s = settings.data;
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTarget(s?.kcal_target != null ? String(s.kcal_target) : ""); }, [s?.kcal_target]);

  async function save(patch: { calories_on?: boolean; kcal_target?: number | null }) {
    setBusy(true);
    try {
      const { error } = s
        ? await supabase.from("food_settings").update(patch).eq("member_id", me.id)
        : await supabase.from("food_settings").insert({ member_id: me.id, family_id: family.id, calories_on: false, ...patch });
      if (error) throw error;
      void refreshFood(qc, family.id);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  function saveTarget() {
    const n = target.trim() ? Math.round(Number(target)) : null;
    if (n !== null && (!Number.isFinite(n) || n < 500 || n > 10000)) { toast.error("A daily target is between 500 and 10,000"); return; }
    if (n === (s?.kcal_target ?? null)) return;
    void save({ kcal_target: n });
  }

  return (
    <section>
      <h3 className="text-base font-bold">My calories</h3>
      <p className="mb-3 text-sm text-muted-foreground">A private food diary with calorie and macro estimates. Only you can see it — never other grown-ups, children or the kitchen screen.</p>
      <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--surface)] px-3">
        <span className="flex-1 font-medium">Track my calories</span>
        <Switch checked={!!s?.calories_on} disabled={busy || settings.isLoading} onCheckedChange={(v) => void save({ calories_on: v })} />
      </label>
      {s?.calories_on ? (
        <label className="mt-2 block text-sm font-semibold">Daily target (optional)
          <Input value={target} onChange={(e) => setTarget(e.target.value)} onBlur={saveTarget} inputMode="numeric" placeholder="e.g. 2000" className="mt-1 h-12" />
        </label>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- aisles (grown-ups)

function AislesSection() {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const aisles = useShopping().data?.aisles ?? [];
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => refreshFood(qc, family.id);

  async function run(p: PromiseLike<{ error: unknown }>) {
    setBusy(true);
    const { error } = await p;
    setBusy(false);
    if (error) toast.error(friendlyError(error)); else void refresh();
  }

  async function swap(a: Aisle, dir: -1 | 1) {
    const n = aisles.findIndex((x) => x.id === a.id);
    const b = aisles[n + dir];
    if (!b) return;
    setBusy(true);
    const r1 = await supabase.from("food_aisles").update({ position: b.position }).eq("id", a.id);
    const r2 = await supabase.from("food_aisles").update({ position: a.position === b.position ? a.position + dir : a.position }).eq("id", b.id);
    setBusy(false);
    if (r1.error || r2.error) toast.error(friendlyError(r1.error ?? r2.error)); else void refresh();
  }

  async function rename(a: Aisle, v: string) {
    const t = v.trim().slice(0, 40);
    if (!t || t === a.name) return;
    await run(supabase.from("food_aisles").update({ name: t }).eq("id", a.id));
  }

  return (
    <section>
      <h3 className="text-base font-bold">Aisles</h3>
      <p className="mb-3 text-sm text-muted-foreground">Put them in the order you walk round your shop. The list sorts itself to match.</p>
      {!aisles.length ? (
        <Button variant="outline" className="mb-3 h-11 rounded-full" disabled={busy} onClick={() => void run(supabase.from("food_aisles").insert(DEFAULT_AISLES.map((n, i) => ({ family_id: family.id, name: n, position: i }))))}>
          <Sparkles className="size-4" /> Use the usual supermarket aisles
        </Button>
      ) : null}
      <ul className="space-y-1.5">
        {aisles.map((a, i) => (
          <li key={a.id} className="flex items-center gap-1 rounded-2xl bg-[var(--surface)] p-1.5">
            <Input defaultValue={a.name} onBlur={(e) => void rename(a, e.target.value)} className="h-10 flex-1 border-0 bg-transparent" aria-label="Aisle name" />
            <Button variant="ghost" size="icon" className="size-10 rounded-full" disabled={busy || i === 0} onClick={() => void swap(a, -1)} aria-label={`Move ${a.name} up`}><ArrowUp className="size-4" /></Button>
            <Button variant="ghost" size="icon" className="size-10 rounded-full" disabled={busy || i === aisles.length - 1} onClick={() => void swap(a, 1)} aria-label={`Move ${a.name} down`}><ArrowDown className="size-4" /></Button>
            <Button variant="ghost" size="icon" className="size-10 rounded-full" disabled={busy} onClick={() => void run(supabase.from("food_aisles").delete().eq("id", a.id))} aria-label={`Remove ${a.name}`}><Trash2 className="size-4" /></Button>
          </li>
        ))}
      </ul>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = name.trim(); if (!t) return; void run(supabase.from("food_aisles").insert({ family_id: family.id, name: t.slice(0, 40), position: (aisles.at(-1)?.position ?? 0) + 1 })).then(() => setName("")); }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add an aisle" className="h-11 flex-1" aria-label="New aisle" />
        <Button type="submit" className="h-11 rounded-full" disabled={busy || !name.trim()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add</Button>
      </form>
    </section>
  );
}
