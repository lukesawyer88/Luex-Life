// Food budget (parents only): the total of each shop, typed in after paying, by week and month.
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, PiggyBank, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { Empty, Field, Sheet } from "@/modules/calendar/ui";

import { addDaysKey, refreshFood, todayIn, useSpend, weekStartKey, type Spend } from "./data";
import type { FoodTarget } from "./food-page";
import { dayLabel } from "./plan-helpers";

const money = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

function monthStartKey(k: string) { return k.slice(0, 8) + "01"; }
function addMonthsKey(k: string, n: number) {
  const [y, m] = k.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
function monthName(k: string) {
  return new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function BudgetTab(_: { target: FoodTarget; onGo: (t: FoodTarget) => void }) {
  const { family, isParent } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const [month, setMonth] = useState(() => monthStartKey(today));
  const prevMonth = addMonthsKey(month, -1);
  const monthEnd = addDaysKey(addMonthsKey(month, 1), -1);
  const spend = useSpend(prevMonth, monthEnd);
  const [edit, setEdit] = useState<Spend | "new" | null>(null);

  const all = spend.data ?? [];
  const thisMonth = all.filter((s) => s.spent_on >= month && s.spent_on <= monthEnd);
  const lastMonth = all.filter((s) => s.spent_on >= prevMonth && s.spent_on < month);
  const total = (l: Spend[]) => l.reduce((n, s) => n + Number(s.amount), 0);
  const weeks = useMemo(() => {
    const m = new Map<string, Spend[]>();
    for (const s of thisMonth) { const w = weekStartKey(s.spent_on); m.set(w, [...(m.get(w) ?? []), s]); }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [thisMonth]);

  async function remove(s: Spend) {
    const { error } = await supabase.from("food_spend").delete().eq("id", s.id);
    if (error) { toast.error(friendlyError(error)); return; }
    await refreshFood(qc, family.id);
    toast("Shop removed", {
      action: { label: "Undo", onClick: async () => { await supabase.from("food_spend").insert({ family_id: family.id, spent_on: s.spent_on, amount: s.amount, store: s.store, note: s.note }); await refreshFood(qc, family.id); } },
    });
  }

  if (!isParent) return null;
  const t = total(thisMonth);
  const l = total(lastMonth);
  const diff = t - l;

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setMonth(addMonthsKey(month, -1))} aria-label="Last month"><ChevronLeft className="size-5" /></Button>
          <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setMonth(addMonthsKey(month, 1))} aria-label="Next month"><ChevronRight className="size-5" /></Button>
          <h2 className="min-w-[8rem] flex-1 text-lg font-bold">{monthName(month)}</h2>
          <Button className="h-10 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-4" /> Add a shop</Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="glass-tile p-3"><p className="text-xs text-muted-foreground">This month</p><p className="text-2xl font-bold tabular-nums">{money(t)}</p></div>
          <div className="glass-tile p-3"><p className="text-xs text-muted-foreground">Last month</p><p className="text-2xl font-bold tabular-nums">{money(l)}</p>
            {lastMonth.length && thisMonth.length ? <p className={diff > 0 ? "text-xs font-semibold text-[var(--status-red)]" : "text-xs font-semibold text-[var(--status-green)]"}>{diff > 0 ? `${money(diff)} more this month` : `${money(-diff)} less this month`}</p> : null}
          </div>
        </div>
        {weeks.length ? (
          <div className="space-y-3">
            {weeks.map(([w, list]) => (
              <section key={w}>
                <h3 className="mb-1 flex justify-between text-sm font-bold"><span>Week of {dayLabel(w)}</span><span className="tabular-nums">{money(total(list))}</span></h3>
                <ul className="space-y-1">
                  {list.map((s) => (
                    <li key={s.id} className="glass-tile flex min-h-12 items-center gap-3 px-3 py-2">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEdit(s)}>
                        <span className="block truncate text-sm font-semibold">{s.store || "Shop"}{s.note ? ` · ${s.note}` : ""}</span>
                        <span className="text-xs text-muted-foreground">{dayLabel(s.spent_on)}</span>
                      </button>
                      <span className="font-bold tabular-nums">{money(Number(s.amount))}</span>
                      <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => void remove(s)} aria-label="Remove this shop"><Trash2 className="size-4" /></Button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <Empty icon={PiggyBank} title="No shops this month">Add the total after each shop to see what food costs each week.</Empty>
        )}
      </RecordsWindow>
      <DetailWindow>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><PiggyBank className="size-4" /> About the food budget</h3>
        <p className="text-sm">Type the total after each shop. Only parents can see this.</p>
        <p className="mt-2 text-sm text-muted-foreground">Household Money will use these totals later, alongside your other bills.</p>
      </DetailWindow>
      <EditSpend value={edit} today={today} onClose={() => setEdit(null)} />
    </Windows>
  );
}

function EditSpend({ value, today, onClose }: { value: Spend | "new" | null; today: string; onClose: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const existing = value && value !== "new" ? value : null;
  const [day, setDay] = useState(today);
  const [amount, setAmount] = useState("");
  const [store, setStore] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!value) return;
    setDay(existing?.spent_on ?? today); setAmount(existing ? String(existing.amount) : ""); setStore(existing?.store ?? ""); setNote(existing?.note ?? "");
  }, [value, existing, today]);
  const n = Number(amount.replace(/[£,\s]/g, ""));
  const ok = Number.isFinite(n) && n > 0 && n < 100000 && !!day;

  async function save() {
    if (!ok) return;
    const row = { spent_on: day, amount: Math.round(n * 100) / 100, store: store.trim().slice(0, 60) || null, note: note.trim().slice(0, 200) };
    const res = existing ? await supabase.from("food_spend").update(row).eq("id", existing.id) : await supabase.from("food_spend").insert({ ...row, family_id: family.id });
    if (res.error) { toast.error(friendlyError(res.error)); return; }
    await refreshFood(qc, family.id);
    onClose();
  }

  return (
    <Sheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "Change shop" : "Add a shop"}
      footer={
        <>
          <Button className="h-11 flex-1 rounded-full text-base font-semibold" disabled={!ok} onClick={() => void save()}>Save</Button>
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="How much (£)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="84.20" className="h-11 w-40 text-lg" data-autofocus /></Field>
        <Field label="Date"><Input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className="h-11" /></Field>
        <Field label="Shop (optional)"><Input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Tesco" className="h-11" maxLength={60} /></Field>
        <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Big shop" className="h-11" maxLength={200} /></Field>
      </div>
    </Sheet>
  );
}
