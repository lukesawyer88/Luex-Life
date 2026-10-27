// Packed lunches: each child's lunchbox for the school week, quick chips for the usual things,
// "Same as last week", and one tap to put the week's lunch things on the shopping list.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Copy, Plus, Sandwich, ShoppingCart, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyError, type Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { readLocal, writeLocal } from "@/lib/local";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Empty, PeoplePicker, Sheet } from "@/modules/calendar/ui";

import { addDaysKey, foodKey, refreshFood, rows, todayIn, useLunches, weekStartKey, type Lunch } from "./data";
import type { FoodTarget } from "./food-page";
import { nameKey } from "./ingredients";
import { dayLabel } from "./plan-helpers";

const EXTRA_KEY = (familyId: string) => `luex.life.food.lunch-people.${familyId}`;
const STARTER = ["Sandwich", "Wrap", "Apple", "Banana", "Grapes", "Yoghurt", "Cheese", "Crackers", "Carrot sticks", "Water"];

export function LunchesTab(_: { target: FoodTarget; onGo: (t: FoodTarget) => void }) {
  const { family, members, me, role, isParent } = useFamilyState();
  const qc = useQueryClient();
  const tz = family.timezone;
  const today = todayIn(tz);
  const adult = role !== "child";
  const [ws, setWs] = useState(() => {
    // after Friday lunch, show next week
    const w = weekStartKey(today);
    return new Date(today + "T12:00:00Z").getUTCDay() === 6 || new Date(today + "T12:00:00Z").getUTCDay() === 0 ? addDaysKey(w, 7) : w;
  });
  const days = Array.from({ length: 5 }, (_, i) => addDaysKey(ws, i));
  const lunches = useLunches(addDaysKey(ws, -7), days[4]);
  const [extra, setExtra] = useState<string[]>(() => { try { return JSON.parse(readLocal(EXTRA_KEY(family.id)) ?? "[]") as string[]; } catch { return []; } });
  const [picking, setPicking] = useState(false);

  // everyone with lunches in the last few weeks, plus children, plus anyone a parent added here
  const recent = useQuery({
    queryKey: foodKey(family.id, "lunch-recent"),
    queryFn: () => rows<Lunch>(supabase.from("food_lunches").select("*").eq("family_id", family.id).gte("day", addDaysKey(today, -60))),
  });
  const people: Member[] = useMemo(() => {
    const ids = new Set<string>([...members.filter((m) => m.role === "child").map((m) => m.id), ...extra, ...(recent.data ?? []).map((l) => l.member_id)]);
    return members.filter((m) => ids.has(m.id));
  }, [members, extra, recent.data]);
  const shown = adult ? people : people.filter((m) => m.id === me.id);

  const all = lunches.data ?? [];
  const at = (m: string, d: string) => all.find((l) => l.member_id === m && l.day === d);

  async function setItems(member: string, day: string, items: string[], packed?: boolean) {
    const ex = at(member, day);
    const res = ex
      ? await supabase.from("food_lunches").update({ items, packed: packed ?? ex.packed }).eq("id", ex.id)
      : await supabase.from("food_lunches").insert({ family_id: family.id, member_id: member, day, items, packed: packed ?? false });
    if (res.error) toast.error(friendlyError(res.error));
    await refreshFood(qc, family.id);
  }

  async function sameAsLastWeek() {
    let n = 0;
    for (const m of shown) {
      for (const d of days) {
        const prev = at(m.id, addDaysKey(d, -7));
        if (prev?.items.length && !at(m.id, d)?.items.length) {
          const { error } = await supabase.from("food_lunches").insert({ family_id: family.id, member_id: m.id, day: d, items: prev.items });
          if (!error) n++;
        }
      }
    }
    await refreshFood(qc, family.id);
    toast(n ? `Copied ${n} ${n === 1 ? "lunch" : "lunches"}` : "Nothing to copy (empty days only)");
  }

  async function lunchboxList() {
    const counts = new Map<string, { name: string; n: number }>();
    for (const l of all.filter((x) => x.day >= ws && x.day <= days[4] && shown.some((m) => m.id === x.member_id))) {
      for (const it of l.items) {
        const k = nameKey(it);
        const c = counts.get(k);
        if (c) c.n++; else counts.set(k, { name: it, n: 1 });
      }
    }
    if (!counts.size) { toast("No lunch things planned this week"); return; }
    try {
      let lists = await rows<{ id: string }>(supabase.from("food_lists").select("id").eq("family_id", family.id).is("archived_at", null).order("position").order("created_at").limit(1));
      if (!lists.length) {
        const { data, error } = await supabase.from("food_lists").insert({ family_id: family.id, title: "Weekly shop", emoji: "🛒" }).select("id").single();
        if (error) throw error;
        lists = [data as { id: string }];
      }
      const listId = lists[0].id;
      const already = await rows<{ name: string }>(supabase.from("food_list_items").select("name").eq("list_id", listId).is("done_at", null));
      const have = new Set(already.map((a) => nameKey(a.name)));
      const add = [...counts.entries()].filter(([k]) => !have.has(k)).map(([, v]) => ({
        list_id: listId, family_id: family.id, name: v.name.slice(0, 100), quantity: v.n > 1 ? v.n : null, note: "Lunchboxes",
      }));
      if (add.length) {
        const { error } = await supabase.from("food_list_items").insert(add);
        if (error) throw error;
      }
      await refreshFood(qc, family.id);
      toast.success(add.length ? `Added ${add.length} ${add.length === 1 ? "thing" : "things"} to the shopping list` : "Everything is already on the list");
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  const known = useMemo(() => {
    const c = new Map<string, { name: string; n: number }>();
    for (const l of recent.data ?? []) for (const it of l.items) { const k = nameKey(it); const x = c.get(k); if (x) x.n++; else c.set(k, { name: it, n: 1 }); }
    const list = [...c.values()].sort((a, b) => b.n - a.n).map((x) => x.name);
    for (const s of STARTER) if (!list.some((x) => nameKey(x) === nameKey(s))) list.push(s);
    return list.slice(0, 24);
  }, [recent.data]);

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setWs(addDaysKey(ws, -7))} aria-label="Last week"><ChevronLeft className="size-5" /></Button>
          <Button variant="outline" className="h-10 rounded-full px-3" onClick={() => setWs(weekStartKey(today))}>This week</Button>
          <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setWs(addDaysKey(ws, 7))} aria-label="Next week"><ChevronRight className="size-5" /></Button>
          <h2 className="min-w-[8rem] flex-1 truncate text-lg font-bold">{dayLabel(ws)} – {dayLabel(days[4])}</h2>
          <Button variant="outline" className="h-10 rounded-full px-3" onClick={() => void sameAsLastWeek()}><Copy className="size-4" /> Same as last week</Button>
          <Button className="h-10 rounded-full px-4 font-semibold" onClick={() => void lunchboxList()}><ShoppingCart className="size-4" /> Lunchbox list</Button>
          {isParent ? <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setPicking(true)} aria-label="Who has packed lunches"><UserPlus className="size-5" /></Button> : null}
        </div>

        {shown.length ? (
          <div className="space-y-3">
            {shown.map((m) => (
              <section key={m.id} className="glass-tile p-3">
                <h3 className="mb-2 flex items-center gap-2 font-bold"><MemberAvatar member={m} size="sm" /> {m.display_name}</h3>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  {days.map((d) => (
                    <DayBox
                      key={d}
                      day={d}
                      today={today}
                      lunch={at(m.id, d)}
                      canEdit={adult || m.id === me.id}
                      known={known}
                      onSet={(items, packed) => void setItems(m.id, d, items, packed)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <Empty icon={Sandwich} title="No packed lunches">
            {isParent ? "Children show here. Tap the person button to add a grown-up who takes a packed lunch too." : "Packed lunches for the children show here."}
          </Empty>
        )}
      </RecordsWindow>
      <DetailWindow>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Sandwich className="size-4" /> Lunch ideas</h3>
        <p className="mb-3 text-sm text-muted-foreground">The things your family packs most often. Tap a day's + to add them.</p>
        <div className="flex flex-wrap gap-1.5">{known.map((k) => <span key={k} className="rounded-full bg-[var(--surface)] px-3 py-1 text-sm">{k}</span>)}</div>
      </DetailWindow>

      <Sheet open={picking} onOpenChange={setPicking} title="Who has packed lunches?" description="Children always show. Add anyone else who takes one.">
        <PeoplePicker
          members={members.filter((m) => m.role !== "child")}
          value={extra}
          onChange={(ids) => { setExtra(ids); writeLocal(EXTRA_KEY(family.id), JSON.stringify(ids)); }}
        />
      </Sheet>
    </Windows>
  );
}

function DayBox({ day, today, lunch, canEdit, known, onSet }: {
  day: string; today: string; lunch: Lunch | undefined; canEdit: boolean; known: string[]; onSet: (items: string[], packed?: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const items = lunch?.items ?? [];
  const add = (v: string) => {
    const t = v.trim();
    if (!t || items.some((i) => nameKey(i) === nameKey(t)) || items.length >= 20) return;
    onSet([...items, t.slice(0, 60)]);
    setText("");
  };
  return (
    <div className={cn("rounded-xl bg-[var(--surface)] p-2", day === today && "ring-2 ring-[var(--status-blue)]", lunch?.packed && "opacity-70")}>
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{day === today ? "Today" : dayLabel(day)}</span>
        {canEdit && items.length ? (
          <button
            type="button"
            onClick={() => onSet(items, !lunch?.packed)}
            className={cn("inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-xs font-semibold", lunch?.packed ? "bg-[var(--status-green)] text-white" : "bg-background")}
            aria-pressed={!!lunch?.packed}
          >
            <Check className="size-3.5" /> {lunch?.packed ? "Packed" : "Pack"}
          </button>
        ) : null}
      </div>
      <ul className="flex flex-wrap gap-1">
        {items.map((it) => (
          <li key={it} className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-sm">
            {it}
            {canEdit ? (
              <button type="button" className="grid size-6 place-items-center rounded-full hover:bg-muted" onClick={() => onSet(items.filter((x) => x !== it))} aria-label={`Remove ${it}`}><X className="size-3.5" /></button>
            ) : null}
          </li>
        ))}
        {!items.length && !adding ? <li className="text-xs text-muted-foreground">Nothing yet</li> : null}
      </ul>
      {canEdit ? (
        adding ? (
          <div className="mt-2 space-y-2">
            <form onSubmit={(e) => { e.preventDefault(); add(text); }} className="flex gap-1">
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add something" className="h-10" aria-label="Add a lunch item" autoFocus maxLength={60} />
              <Button type="submit" size="icon" className="size-10 shrink-0 rounded-full" aria-label="Add"><Plus className="size-4" /></Button>
            </form>
            <div className="flex flex-wrap gap-1">
              {known.filter((k) => !items.some((i) => nameKey(i) === nameKey(k))).slice(0, 12).map((k) => (
                <button key={k} type="button" onClick={() => add(k)} className="min-h-9 rounded-full border border-[var(--surface-border)] bg-background px-2.5 text-xs font-medium hover:bg-muted">+ {k}</button>
              ))}
            </div>
            <button type="button" className="text-xs font-semibold text-muted-foreground underline" onClick={() => setAdding(false)}>Done</button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="mt-1 inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-xs font-semibold text-[var(--status-blue)] hover:bg-muted">
            <Plus className="size-3.5" /> Add
          </button>
        )
      ) : null}
    </div>
  );
}
