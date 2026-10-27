// This month: what's come in, what's gone out, what's left, and each category against its plan.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarClock, ChevronLeft, ChevronRight, ClipboardCopy, Coins, Plus, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useExtra } from "@/lib/extras";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Empty, Field, Sheet } from "@/modules/calendar/ui";

import { byCategory, catLabel, counted, sum } from "./budget-helpers";
import {
  addDaysKey, addMonthsKey, errMsg, fetchPayments, money, moneyKey, perMonth, periodFor, refreshMoney, shiftPeriod, shortDate, todayIn,
  useBills, useBudgetHistory, useBudgets, useCategories, useMoneySettings,
  type Bill, type Budget, type Category, type Every, type MoneySettings, type Payment,
} from "./data";
import type { TabProps } from "./money-page";
import { PaymentSheet } from "./payment-sheet";

type Line = { cat: Category | undefined; id: string; planned: number; carried: number; spent: number; budget: Budget | undefined };

export function BudgetTab({ onGo }: TabProps) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const settings = useMoneySettings().data ?? null;
  const today = todayIn(family.timezone);
  const [anchor, setAnchor] = useState(today);
  const per = periodFor(settings, anchor);
  const prev = shiftPeriod(settings, per.start, -1);
  const isNow = today >= per.start && today <= per.end;

  const carryOn = useExtra("money.carry");
  const cats = useCategories().data ?? [];
  const budgets = useBudgets(per.start).data ?? [];
  const prevBudgets = useBudgets(prev.start).data ?? [];
  const history = useBudgetHistory(prev.start).data ?? [];
  const bills = useBills().data ?? [];

  // payments back far enough for carry-over (at most two years), last period and the year so far
  const carryCats = new Set(carryOn ? cats.filter((c) => c.carry_over).map((c) => c.id) : []);
  const twoYears = addMonthsKey(per.start, -24);
  const carryFrom = history.filter((b) => carryCats.has(b.category_id) && b.period_start >= twoYears).reduce((m, b) => (b.period_start < m ? b.period_start : m), prev.start);
  const yearStart = `${per.start.slice(0, 4)}-01-01`;
  const from = [carryFrom, prev.start, yearStart].sort()[0];
  const pays = useQuery({
    queryKey: moneyKey(family.id, "payments", from, per.end),
    queryFn: () => fetchPayments(family.id, from, per.end),
  });
  const all = useMemo(() => pays.data ?? [], [pays.data]);

  const out = counted(all, "out", per.start, per.end);
  const inn = counted(all, "in", per.start, per.end);
  const outTotal = sum(out);
  const inTotal = sum(inn);
  const spentBy = byCategory(out);

  const lines: Line[] = useMemo(() => {
    const res: Line[] = [];
    const shown = new Set<string>();
    for (const c of cats.filter((c) => c.direction === "out")) {
      const b = budgets.find((x) => x.category_id === c.id);
      const spent = spentBy.get(c.id) ?? 0;
      if (c.archived_at && !b && !spent) continue;
      let carried = 0;
      if (c.carry_over && carryOn) {
        for (const h of history) {
          if (h.category_id !== c.id || h.period_start >= per.start || h.period_start < twoYears) continue;
          const p = periodFor(settings, h.period_start);
          const used = sum(all.filter((x) => x.category_id === c.id && x.in_budget && x.direction === "out" && x.on_date >= p.start && x.on_date <= p.end));
          carried += Number(h.planned) - used;
        }
      }
      shown.add(c.id);
      res.push({ cat: c, id: c.id, planned: Number(b?.planned ?? 0), carried, spent, budget: b });
    }
    const loose = [...spentBy.entries()].filter(([k]) => !shown.has(k)).reduce((n, [, v]) => n + v, 0);
    if (loose > 0) res.push({ cat: undefined, id: "", planned: 0, carried: 0, spent: loose, budget: undefined });
    return res;
  }, [cats, budgets, history, spentBy, all, settings, per.start, twoYears, carryOn]);

  const planned = lines.reduce((n, l) => n + l.planned + l.carried, 0);
  const hasPlan = lines.some((l) => l.planned > 0 || l.carried !== 0);
  const left = hasPlan ? planned - outTotal : inTotal - outTotal;

  const soon = bills.filter((b) => b.next_due <= addDaysKey(today, 6)).slice(0, 12);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Line | null>(null);
  const [copying, setCopying] = useState(false);

  async function copyLast() {
    const missing = prevBudgets.filter((p) => Number(p.planned) > 0 && !budgets.some((b) => b.category_id === p.category_id));
    if (!missing.length) { toast("Nothing to copy: last month's plan is already here"); return; }
    setCopying(true);
    const { error } = await supabase.from("money_budgets").insert(missing.map((p) => ({ family_id: family.id, category_id: p.category_id, period_start: per.start, planned: p.planned })));
    setCopying(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast(`Copied ${missing.length} ${missing.length === 1 ? "amount" : "amounts"} from last time`);
    void refreshMoney(qc, family.id);
  }

  const leftLabel = isNow ? (settings?.period === "payday" ? "Left until payday" : "Left this month") : "Left over";

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setAnchor(prev.start)} aria-label="Earlier" data-testid="budget-prev"><ChevronLeft className="size-5" /></Button>
          <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setAnchor(shiftPeriod(settings, per.start, 1).start)} aria-label="Later" data-testid="budget-next"><ChevronRight className="size-5" /></Button>
          <h2 className="min-w-[8rem] flex-1 text-lg font-bold" data-testid="budget-period">{per.label}</h2>
          {!isNow ? <Button variant="outline" className="h-10 rounded-full" onClick={() => setAnchor(today)}>Today</Button> : null}
          <Button className="h-11 rounded-full px-5 text-base font-semibold" onClick={() => setAdding(true)} data-testid="money-add"><Plus className="size-5" /> Add a payment</Button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="glass-tile col-span-2 p-3 sm:col-span-1">
            <p className="text-xs text-muted-foreground">{leftLabel}</p>
            <p className={cn("text-3xl font-bold tabular-nums", left < 0 && "text-[var(--status-red)]")} data-testid="budget-left">{money(left)}</p>
            <p className="text-xs text-muted-foreground">{hasPlan ? "Your plan minus money out" : "Money in minus money out"}</p>
          </div>
          <div className="glass-tile p-3">
            <p className="text-xs text-muted-foreground">Money in</p>
            <p className="text-xl font-bold tabular-nums text-[var(--status-green)]" data-testid="budget-in">{money(inTotal)}</p>
          </div>
          <div className="glass-tile p-3">
            <p className="text-xs text-muted-foreground">Money out</p>
            <p className="text-xl font-bold tabular-nums" data-testid="budget-out">{money(outTotal)}</p>
          </div>
        </div>

        {soon.length ? (
          <section>
            <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold"><CalendarClock className="size-4" /> Due in the next 7 days</h3>
            <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" data-testid="budget-due">
              {soon.map((b) => <DueChip key={b.id} b={b} today={today} onClick={() => onGo({ tab: "bills", billId: b.id })} />)}
            </div>
          </section>
        ) : null}

        <section>
          <div className="mb-1 flex items-center gap-2">
            <h3 className="flex-1 text-sm font-bold">Money out by category</h3>
            {prevBudgets.length ? (
              <Button variant="ghost" className="h-9 rounded-full text-sm" disabled={copying} onClick={() => void copyLast()} data-testid="budget-copy-last"><ClipboardCopy className="size-4" /> Copy last month's plan</Button>
            ) : null}
          </div>
          {pays.isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p> : lines.length ? (
            <ul className="space-y-1.5">
              {lines.map((l) => <CategoryRow key={l.id || "none"} l={l} onClick={() => setEditing(l)} />)}
            </ul>
          ) : (
            <Empty icon={Wallet} title="Nothing yet">Tap "Add a payment" to start, or set a plan for each category.</Empty>
          )}
          {!hasPlan && lines.length ? <p className="mt-2 text-xs text-muted-foreground">Tap a category to plan how much to spend on it.</p> : null}
        </section>

        <div className="lg:hidden"><Extras all={all} bills={bills} cats={cats} today={today} from={per.start} to={per.end} prevFrom={prev.start} prevTo={prev.end} /></div>
      </RecordsWindow>
      <DetailWindow>
        <Extras all={all} bills={bills} cats={cats} today={today} from={per.start} to={per.end} prevFrom={prev.start} prevTo={prev.end} />
      </DetailWindow>
      <PaymentSheet open={adding} onOpenChange={setAdding} />
      <PlanSheet line={editing} periodStart={per.start} periodLabel={per.label} payments={out} settings={settings} onClose={() => setEditing(null)} onGo={onGo} />
    </Windows>
  );
}

function DueChip({ b, today, onClick }: { b: Bill; today: string; onClick: () => void }) {
  const when = b.next_due < today ? "Was due" : b.next_due === today ? "Today" : b.next_due === addDaysKey(today, 1) ? "Tomorrow" : shortDate(b.next_due);
  return (
    <button type="button" onClick={onClick} className="glass-tile flex min-h-12 shrink-0 flex-col items-start justify-center px-3 py-1.5 text-left" data-testid={`budget-due-${b.name}`}>
      <span className="text-sm font-semibold">{b.private_to ? "🔒 " : ""}{b.name}</span>
      <span className={cn("text-xs", b.next_due <= today ? "font-semibold text-[var(--status-amber)]" : "text-muted-foreground")}>{when} · {money(b.amount)}</span>
    </button>
  );
}

function CategoryRow({ l, onClick }: { l: Line; onClick: () => void }) {
  const plan = l.planned + l.carried;
  const pct = plan > 0 ? Math.min(100, (l.spent / plan) * 100) : 0;
  const over = plan > 0 && l.spent > plan;
  return (
    <li>
      <button type="button" onClick={onClick} className="glass-tile block w-full px-3 py-2 text-left" data-testid={`budget-cat-${l.cat?.name ?? "none"}`}>
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{catLabel(l.cat)}</span>
          <span className="text-sm tabular-nums">
            <b>{money(l.spent)}</b>
            {plan > 0 ? <span className="text-muted-foreground"> of {money(plan)}</span> : null}
          </span>
        </span>
        {plan > 0 ? (
          <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-background">
            <span className={cn("block h-full rounded-full", over ? "bg-[var(--status-red)]" : "bg-[var(--status-green)]")} style={{ width: `${pct}%` }} />
          </span>
        ) : null}
        <span className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>{l.carried ? `${l.carried > 0 ? "+" : "−"}${money(Math.abs(l.carried))} carried over` : ""}</span>
          <span className={over ? "font-semibold text-[var(--status-red)]" : ""}>{plan > 0 ? (over ? `${money(l.spent - plan)} over` : `${money(plan - l.spent)} left`) : l.cat ? "No plan" : ""}</span>
        </span>
      </button>
    </li>
  );
}

/** against last month, yearly bills, child costs (an extra) and pocket money (right-hand window on big screens, below on phones) */
function Extras({ all, bills, cats, today, from, to, prevFrom, prevTo }: {
  all: Payment[]; bills: Bill[]; cats: Category[]; today: string; from: string; to: string; prevFrom: string; prevTo: string;
}) {
  const { members } = useFamilyState();
  const childCosts = useExtra("money.childcosts");
  const yearly = bills.filter((b) => b.every === "year" || b.every === "quarter");
  const aside = yearly.reduce((n, b) => n + perMonth(b.amount, b.every as Every), 0);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const kids = new Map<string, number>();
  for (const p of all) if (p.child_id && p.direction === "out" && p.on_date >= yearStart && p.on_date <= today) kids.set(p.child_id, (kids.get(p.child_id) ?? 0) + Number(p.amount_gbp));

  return (
    <div className="space-y-4">
      <LastMonth all={all} cats={cats} from={from} to={to} prevFrom={prevFrom} prevTo={prevTo} />

      <section data-testid="budget-yearly">
        <h3 className="mb-1 text-sm font-bold">Set aside for yearly bills</h3>
        {yearly.length ? (
          <>
            <p className="text-2xl font-bold tabular-nums">{money(aside)} <span className="text-sm font-normal text-muted-foreground">a month</span></p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {yearly.map((b) => (
                <li key={b.id} className="flex justify-between gap-2">
                  <span className="truncate">{b.private_to ? "🔒 " : ""}{b.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{money(b.every === "year" ? b.amount : Number(b.amount) * 4, true)} a year = {money(perMonth(b.amount, b.every as Every))} a month</span>
                </li>
              ))}
            </ul>
          </>
        ) : <p className="text-sm text-muted-foreground">Add yearly or three-monthly bills under Bills to see what to put aside each month.</p>}
      </section>

      {childCosts ? <section data-testid="budget-children">
        <h3 className="mb-1 text-sm font-bold">Spent on each child this year</h3>
        {kids.size ? (
          <ul className="space-y-0.5 text-sm">
            {[...kids.entries()].map(([id, n]) => (
              <li key={id} className="flex justify-between"><span>{members.find((m) => m.id === id)?.display_name ?? "Someone"}</span><b className="tabular-nums">{money(n)}</b></li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Pick a child when you add a payment to see what each child costs.</p>}
      </section> : null}

      <section>
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold"><Coins className="size-4" /> Pocket money</h3>
        <PocketTotals from={from} to={to} />
      </section>
    </div>
  );
}

/** this period against the last: money in, money out and the three biggest changes by category */
function LastMonth({ all, cats, from, to, prevFrom, prevTo }: { all: Payment[]; cats: Category[]; from: string; to: string; prevFrom: string; prevTo: string }) {
  const nowOut = counted(all, "out", from, to);
  const prevOut = counted(all, "out", prevFrom, prevTo);
  const inNow = sum(counted(all, "in", from, to));
  const inPrev = sum(counted(all, "in", prevFrom, prevTo));
  const outNow = sum(nowOut);
  const outPrev = sum(prevOut);
  const a = byCategory(nowOut);
  const b = byCategory(prevOut);
  const changes = [...new Set([...a.keys(), ...b.keys()])]
    .map((id) => ({ id, d: (a.get(id) ?? 0) - (b.get(id) ?? 0) }))
    .filter((x) => Math.abs(x.d) >= 1)
    .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
    .slice(0, 3);
  const diff = (n: number) => (n === 0 ? "the same" : `${money(Math.abs(n))} ${n > 0 ? "more" : "less"}`);
  return (
    <section data-testid="budget-vs-last">
      <h3 className="mb-1 text-sm font-bold">Against last time</h3>
      <ul className="space-y-0.5 text-sm">
        <li className="flex justify-between gap-2"><span>Money in</span><span className="tabular-nums text-muted-foreground">{diff(inNow - inPrev)}</span></li>
        <li className="flex justify-between gap-2"><span>Money out</span><span className="tabular-nums text-muted-foreground">{diff(outNow - outPrev)}</span></li>
      </ul>
      {changes.length ? (
        <>
          <p className="mt-2 text-xs font-semibold text-muted-foreground">Biggest changes</p>
          <ul className="space-y-0.5 text-sm">
            {changes.map((c) => (
              <li key={c.id || "none"} className="flex justify-between gap-2">
                <span className="truncate">{catLabel(cats.find((x) => x.id === c.id))}</span>
                <span className={cn("shrink-0 tabular-nums", c.d > 0 ? "text-[var(--status-red)]" : "text-[var(--status-green)]")}>{c.d > 0 ? "+" : "−"}{money(Math.abs(c.d))}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function PlanSheet({ line, periodStart, periodLabel, payments, settings, onClose, onGo }: {
  line: Line | null; periodStart: string; periodLabel: string; payments: Payment[]; settings: MoneySettings | null; onClose: () => void; onGo: TabProps["onGo"];
}) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => { if (line) setAmount(line.budget ? String(Number(line.budget.planned)) : ""); }, [line]);
  const n = amount.trim() === "" ? 0 : Number(amount.replace(/[£,\s]/g, ""));
  const ok = Number.isFinite(n) && n >= 0 && n < 1e9;
  const list = line ? payments.filter((p) => (p.category_id ?? "") === line.id || (!line.cat && !p.category_id)) : [];

  async function save() {
    if (!line?.cat || !ok) return;
    setBusy(true);
    const planned = Math.round(n * 100) / 100;
    const res = line.budget
      ? planned === 0
        ? await supabase.from("money_budgets").delete().eq("id", line.budget.id)
        : await supabase.from("money_budgets").update({ planned }).eq("id", line.budget.id)
      : planned === 0
        ? { error: null }
        : await supabase.from("money_budgets").insert({ family_id: family.id, category_id: line.cat.id, period_start: periodStart, planned });
    setBusy(false);
    if (res.error) { toast.error(errMsg(res.error)); return; }
    void refreshMoney(qc, family.id);
    onClose();
  }

  const per = settings?.period === "payday" ? "this pay period" : "this month";
  return (
    <>
      <Sheet
        open={!!line}
        onOpenChange={(o) => !o && onClose()}
        title={catLabel(line?.cat)}
        description={periodLabel}
        footer={line?.cat ? (
          <>
            <Button className="h-11 flex-1 rounded-full text-base font-semibold" disabled={!ok || busy} onClick={() => void save()} data-testid="budget-plan-save">Save</Button>
            <Button variant="outline" className="h-11 rounded-full px-5" onClick={onClose}>Cancel</Button>
          </>
        ) : (
          <Button variant="outline" className="h-11 flex-1 rounded-full" onClick={onClose}>Close</Button>
        )}
      >
        <div className="space-y-4">
          {line?.cat ? (
            <Field label={`Plan to spend ${per} (£)`} hint={line.carried ? `Plus ${money(line.carried)} carried over from before.` : "Leave empty for no plan."}>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-11 w-40 text-lg" data-autofocus data-testid="budget-plan-amount" />
            </Field>
          ) : <p className="text-sm text-muted-foreground">These payments have no category. Open one to give it a category.</p>}
          <section>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Spent {per}: {money(line?.spent ?? 0)}</h3>
              {line?.cat ? <Button variant="ghost" className="h-9 rounded-full" onClick={() => setAdding(true)}><Plus className="size-4" /> Add</Button> : null}
            </div>
            {list.length ? (
              <ul className="space-y-1">
                {list.slice(0, 60).map((p) => (
                  <li key={p.id}>
                    <button type="button" className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-[var(--surface)] px-3 text-left text-sm" onClick={() => { onClose(); onGo({ tab: "payments", paymentId: p.id }); }}>
                      <span className="min-w-0 flex-1 truncate">{p.private_to ? "🔒 " : ""}{p.payee || p.note || "Payment"}</span>
                      <span className="text-xs text-muted-foreground">{shortDate(p.on_date)}</span>
                      <b className="tabular-nums">{money(p.amount_gbp)}</b>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Nothing spent here yet.</p>}
          </section>
        </div>
      </Sheet>
      <PaymentSheet open={adding} onOpenChange={setAdding} preset={line?.cat ? { category_id: line.cat.id } : undefined} />
    </>
  );
}

/** what the household paid out in pocket money to each child this period (from Rewards and Pocket Money) */
const PAID_OUT = ["pay", "chore", "job", "bonus", "week", "interest", "match", "advance", "repay", "deduction"];
function PocketTotals({ from, to }: { from: string; to: string }) {
  const { family, members } = useFamilyState();
  const children = members.filter((m) => m.role === "child" && !m.archived_at);
  const q = useQuery({
    queryKey: ["money", family.id, "pocket", from, to],
    enabled: children.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("pocket_entries").select("member_id, amount, kind")
        .eq("family_id", family.id).eq("status", "ok").in("kind", PAID_OUT).in("member_id", children.map((c) => c.id))
        .gte("on_date", from).lte("on_date", to);
      if (error) throw error;
      const out = new Map<string, number>();
      for (const r of (data ?? []) as { member_id: string; amount: number }[]) out.set(r.member_id, (out.get(r.member_id) ?? 0) + Number(r.amount));
      return out;
    },
  });
  if (!children.length) return <p className="text-sm text-muted-foreground" data-testid="budget-pocket">No children in the household.</p>;
  const total = [...(q.data?.values() ?? [])].reduce((n, v) => n + v, 0);
  return (
    <div data-testid="budget-pocket">
      <p className="text-2xl font-bold tabular-nums">{money(total)} <span className="text-sm font-normal text-muted-foreground">paid out</span></p>
      <ul className="mt-1 space-y-0.5 text-sm">
        {children.map((c) => (
          <li key={c.id} className="flex justify-between"><span>{c.display_name}</span><b className="tabular-nums">{money(q.data?.get(c.id) ?? 0)}</b></li>
        ))}
      </ul>
      <Link to="/m/$key" params={{ key: "pocket" }} className="mt-1 inline-block text-sm font-semibold underline">Open Rewards and Pocket Money</Link>
    </div>
  );
}
