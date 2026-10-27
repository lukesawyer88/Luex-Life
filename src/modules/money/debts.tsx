// Loans and investments: debts with a "what if I paid more" slider, a mortgage calculator, investments and
// pensions typed in from statements, and credit scores. Facts and estimates only, never advice.
import { useQueryClient } from "@tanstack/react-query";
import { Archive, Calculator, ExternalLink, Gauge, Landmark, LineChart, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useExtra } from "@/lib/extras";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { Chip, Empty, Field, PeoplePicker, Sheet } from "@/modules/calendar/ui";

import { JustMine, MineLock, NativeSelect, parseAmount, Sparkbars, Stat, useParents } from "./bill-parts";
import {
  addMonthsKey, CREDIT_LINKS, daysBetween, DEBT_KIND_LABEL, errMsg, HOLDING_KIND_LABEL, money, refreshMoney, shortDate, todayIn,
  useCreditScores, useDebts, useHoldings, type CreditScore, type Debt, type Holding, type HoldingValue,
} from "./data";
import { mortgage, payoff, yearsMonths } from "./debt-maths";
import type { TabProps } from "./money-page";

type View = "loans" | "mortgage" | "investments" | "credit";

function monthYear(k: string) {
  return new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Investments and credit (an extra): the mortgage calculator, investments and pensions, and credit scores.
 *  Loans and cards live under Savings. */
export function DebtsTab(_props: TabProps) {
  const [view, setView] = useState<View>("investments");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1">
        <Chip on={view === "mortgage"} onClick={() => setView("mortgage")} className="shrink-0"><Calculator className="size-4" /> Mortgage calculator</Chip>
        <Chip on={view === "investments"} onClick={() => setView("investments")} className="shrink-0"><LineChart className="size-4" /> Investments and pensions</Chip>
        <Chip on={view === "credit"} onClick={() => setView("credit")} className="shrink-0"><Gauge className="size-4" /> Credit score</Chip>
      </div>
      {view === "loans" ? <Loans /> : view === "mortgage" ? <MortgageCalc /> : view === "investments" ? <Investments /> : <Credit />}
    </div>
  );
}

// ---------------------------------------------------------------- loans

export function Loans() {
  const { family } = useFamilyState();
  const desktop = useDesktop();
  return <LoansInner today={todayIn(family.timezone)} desktop={desktop} />;
}

function LoansInner({ today, desktop }: { today: string; desktop: boolean }) {
  const q = useDebts();
  const debts = useMemo(() => q.data ?? [], [q.data]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Debt | "new" | null>(null);
  const open = debts.find((d) => d.id === openId) ?? null;
  useEffect(() => { if (desktop && !openId && debts.length) setOpenId(debts[0].id); }, [desktop, openId, debts]);
  const total = debts.reduce((n, d) => n + Number(d.balance), 0);
  const monthly = debts.reduce((n, d) => n + Number(d.payment ?? 0), 0);

  const detail = open ? <DebtDetail d={open} today={today} onEdit={() => setEdit(open)} onClosed={() => setOpenId(null)} />
    : <Empty icon={Landmark} title="Pick a loan">When it'll be paid off, and what paying a bit more would do, shows here.</Empty>;

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Loans and cards</h2>
          <Button data-testid="debt-add" className="h-10 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-4" /> Add</Button>
        </div>
        {debts.length ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Still owed" value={money(total, true)} />
              <Stat label="Paid each month" value={money(monthly, true)} />
            </div>
            <ul className="space-y-2">
              {debts.map((d) => {
                const p = d.payment ? payoff(Number(d.balance), Number(d.rate ?? 0), Number(d.payment)) : null;
                return (
                  <li key={d.id}>
                    <button type="button" data-testid="debt-row" onClick={() => setOpenId(d.id)} className={cn("glass-tile flex min-h-14 w-full items-center gap-3 p-3 text-left", openId === d.id && "ring-2 ring-[var(--status-blue)]")}>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 font-semibold"><span className="truncate">{d.name}</span>{d.private_to ? <MineLock /> : null}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {DEBT_KIND_LABEL[d.kind]}{p ? ` · paid off ${monthYear(addMonthsKey(d.as_of, p.months))}` : d.payment ? " · the payment doesn't cover the interest" : ""}
                        </span>
                      </span>
                      <span className="font-bold tabular-nums">{money(d.balance)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : q.isLoading ? null : <Empty icon={Landmark} title="No loans or cards">Add a loan, credit card, car finance or mortgage to see when it'll be paid off.</Empty>}
      </RecordsWindow>
      <DetailWindow>{detail}</DetailWindow>
      {!desktop ? (
        <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)} title={open?.name ?? ""}>
          {open ? <DebtDetail d={open} today={today} onEdit={() => setEdit(open)} onClosed={() => setOpenId(null)} hideTitle /> : null}
        </Sheet>
      ) : null}
      <EditDebt value={edit} onClose={() => setEdit(null)} onSaved={(id) => { setEdit(null); setOpenId(id); }} />
    </Windows>
  );
}

function DebtDetail({ d, today, onEdit, onClosed, hideTitle }: { d: Debt; today: string; onEdit: () => void; onClosed: () => void; hideTitle?: boolean }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const whatIf = useExtra("money.whatif");
  const [extra, setExtra] = useState(0);
  useEffect(() => setExtra(0), [d.id]);
  const bal = Number(d.balance);
  const rate = Number(d.rate ?? 0);
  const pay = Number(d.payment ?? 0);
  const base = pay ? payoff(bal, rate, pay) : null;
  const what = pay || extra ? payoff(bal, rate, pay + extra) : null;
  const maxExtra = Math.max(100, Math.ceil(Math.max(pay, bal / 24) / 50) * 50);
  const stale = daysBetween(d.as_of, today) > 45;

  async function archive() {
    const { error } = await supabase.from("money_debts").update({ archived_at: new Date().toISOString() }).eq("id", d.id);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshMoney(qc, family.id);
    onClosed();
    toast(`${d.name} put away`, { action: { label: "Undo", onClick: async () => { await supabase.from("money_debts").update({ archived_at: null }).eq("id", d.id); await refreshMoney(qc, family.id); } } });
  }

  return (
    <div className="space-y-4" data-testid="debt-detail">
      {!hideTitle ? <h2 className="flex items-center gap-2 text-lg font-bold">{d.name}{d.private_to ? <MineLock className="size-4" /> : null}</h2> : null}
      <div className="glass-tile p-3">
        <p className="text-xs text-muted-foreground">{DEBT_KIND_LABEL[d.kind]} · still owed on {shortDate(d.as_of)}</p>
        <p className="text-3xl font-bold tabular-nums">{money(bal)}</p>
        <p className="text-sm text-muted-foreground">{d.rate != null ? `${rate}% a year` : "Interest rate not set"} · {d.payment ? `${money(pay)} a month` : "monthly payment not set"}</p>
        {stale ? <p className="mt-1 text-xs font-semibold text-[var(--status-amber)]">Update the balance from your latest statement.</p> : null}
      </div>
      {base ? (
        <p className="rounded-2xl bg-[var(--surface)] p-3 text-sm" data-testid="debt-payoff">
          Paid off in <b>{yearsMonths(base.months)}</b> ({monthYear(addMonthsKey(d.as_of, base.months))}), with about <b>{money(base.interest, true)}</b> interest.
        </p>
      ) : pay ? <p className="rounded-2xl bg-[var(--status-red-soft)] p-3 text-sm text-[var(--status-red)]">At {money(pay)} a month this never gets paid off: the payment doesn't cover the interest.</p> : null}

      {whatIf ? <section className="space-y-2" data-testid="debt-whatif">
        <h3 className="text-sm font-bold">What if I paid more each month?</h3>
        <input type="range" min={0} max={maxExtra} step={5} value={extra} onChange={(e) => setExtra(Number(e.target.value))} className="w-full accent-[var(--status-blue)]" aria-label="Extra each month" />
        <p className="text-sm">An extra <b className="tabular-nums">{money(extra, true)}</b> a month:</p>
        {what && extra > 0 ? (
          <p className="rounded-2xl bg-[var(--status-green-soft)] p-3 text-sm">
            Paid off in <b>{yearsMonths(what.months)}</b>
            {base ? <> — <b>{yearsMonths(Math.max(0, base.months - what.months))}</b> sooner, saving about <b>{money(Math.max(0, base.interest - what.interest), true)}</b> interest.</> : "."}
          </p>
        ) : extra > 0 ? <p className="text-sm text-muted-foreground">Still not enough to cover the interest.</p> : null}
        <p className="text-xs text-muted-foreground">An estimate, not advice. Some lenders charge for paying early: check your agreement.</p>
      </section> : null}

      <div className="flex gap-2">
        <Button variant="ghost" className="h-10 flex-1 rounded-full" onClick={onEdit}><Pencil className="size-4" /> Update</Button>
        <Button variant="ghost" className="h-10 flex-1 rounded-full" onClick={() => void archive()}><Archive className="size-4" /> Put away</Button>
      </div>
    </div>
  );
}

function EditDebt({ value, onClose, onSaved }: { value: Debt | "new" | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { family, me } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const existing = value && value !== "new" ? value : null;
  const [f, setF] = useState({ name: "", kind: "loan" as Debt["kind"], balance: "", rate: "", payment: "", as_of: today, mine: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!value) return;
    setF({
      name: existing?.name ?? "", kind: existing?.kind ?? "loan", balance: existing ? String(existing.balance) : "", rate: existing?.rate != null ? String(existing.rate) : "",
      payment: existing?.payment != null ? String(existing.payment) : "", as_of: existing ? today : today, mine: !!existing?.private_to,
    });
  }, [value, existing, today]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const bal = parseAmount(f.balance);
  const rate = f.rate.trim() ? parseAmount(f.rate.replace("%", "")) : null;
  const pay = f.payment.trim() ? parseAmount(f.payment) : null;
  const ok = !!f.name.trim() && bal != null && bal >= 0 && (!f.rate.trim() || (rate != null && rate >= 0 && rate < 100)) && (!f.payment.trim() || (pay != null && pay >= 0));
  const cantHide = !!existing && !existing.private_to && existing.created_by !== me.id;

  async function save() {
    if (!ok) return;
    setBusy(true);
    const row = { name: f.name.trim().slice(0, 60), kind: f.kind, balance: bal!, rate, payment: pay, as_of: f.as_of || today, private_to: f.mine ? me.id : null };
    const res = existing
      ? await supabase.from("money_debts").update(row).eq("id", existing.id).select("id").single()
      : await supabase.from("money_debts").insert({ ...row, family_id: family.id }).select("id").single();
    setBusy(false);
    if (res.error) { toast.error(errMsg(res.error)); return; }
    await refreshMoney(qc, family.id);
    onSaved(res.data.id as string);
  }

  return (
    <Sheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? `Update ${existing.name}` : "Add a loan or card"}
      footer={
        <>
          <Button data-testid="debt-save" className="h-11 flex-1 rounded-full text-base font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={onClose}><X className="size-4" /> Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name"><Input data-testid="debt-name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Car loan" className="h-11" maxLength={60} data-autofocus /></Field>
        <Field label="Type">
          <NativeSelect value={f.kind} onChange={(e) => set("kind", e.target.value as Debt["kind"])}>
            {(Object.keys(DEBT_KIND_LABEL) as Debt["kind"][]).map((k) => <option key={k} value={k}>{DEBT_KIND_LABEL[k]}</option>)}
          </NativeSelect>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Still owed"><Input data-testid="debt-balance" inputMode="decimal" value={f.balance} onChange={(e) => set("balance", e.target.value)} placeholder="0.00" className="h-11" /></Field>
          <Field label="On"><Input type="date" value={f.as_of} onChange={(e) => set("as_of", e.target.value)} className="h-11" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Interest a year (%)" hint="On your statement (APR)"><Input data-testid="debt-rate" inputMode="decimal" value={f.rate} onChange={(e) => set("rate", e.target.value)} placeholder="6.9" className="h-11" /></Field>
          <Field label="Paid each month"><Input data-testid="debt-payment" inputMode="decimal" value={f.payment} onChange={(e) => set("payment", e.target.value)} placeholder="0.00" className="h-11" /></Field>
        </div>
        <JustMine on={f.mine} onChange={(v) => set("mine", v)} disabled={cantHide && !f.mine} hint={cantHide ? "Only the parent who added this can make it private." : undefined} />
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- mortgage calculator

function MortgageCalc() {
  const [f, setF] = useState({ amount: "200000", rate: "4.5", years: "25", overpay: "0", change: false, after: "2", newRate: "5.5" });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const res = mortgage({
    amount: parseAmount(f.amount) ?? 0, ratePct: parseAmount(f.rate) ?? 0, years: parseAmount(f.years) ?? 0, overpay: parseAmount(f.overpay) ?? 0,
    changeAfterYears: f.change ? parseAmount(f.after) : null, newRatePct: f.change ? parseAmount(f.newRate) : null,
  });
  const over = (parseAmount(f.overpay) ?? 0) > 0;

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3" >
        <div data-testid="mortgage-calc" className="space-y-3">
          <h2 className="text-lg font-bold">Mortgage calculator</h2>
          <p className="rounded-2xl bg-[var(--status-amber-soft)] p-3 text-sm font-semibold text-[var(--status-amber)]">An estimate, not advice. Your lender's figures are the real ones.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Borrowed"><Input data-testid="mortgage-amount" inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} className="h-11" /></Field>
            <Field label="Interest (%)"><Input data-testid="mortgage-rate" inputMode="decimal" value={f.rate} onChange={(e) => set("rate", e.target.value)} className="h-11" /></Field>
            <Field label="Years"><Input data-testid="mortgage-years" inputMode="numeric" value={f.years} onChange={(e) => set("years", e.target.value)} className="h-11" /></Field>
            <Field label="Extra a month"><Input data-testid="mortgage-overpay" inputMode="decimal" value={f.overpay} onChange={(e) => set("overpay", e.target.value)} className="h-11" /></Field>
          </div>
          <Chip on={f.change} onClick={() => set("change", !f.change)}>The rate changes later (end of a fixed deal)</Chip>
          {f.change ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="After (years)"><Input inputMode="decimal" value={f.after} onChange={(e) => set("after", e.target.value)} className="h-11" /></Field>
              <Field label="New interest (%)"><Input inputMode="decimal" value={f.newRate} onChange={(e) => set("newRate", e.target.value)} className="h-11" /></Field>
            </div>
          ) : null}
        </div>
        {res ? (
          <div className="space-y-2" data-testid="mortgage-result">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Each month" value={money(res.payment)} sub={res.paymentAfter != null ? `then ${money(res.paymentAfter)}` : over ? `plus ${money(parseAmount(f.overpay) ?? 0)} extra` : undefined} />
              <Stat label="Interest in total" value={money(res.interest, true)} sub={over ? `${money(Math.max(0, res.baseInterest - res.interest), true)} less with the extra` : undefined} />
            </div>
            <p className="rounded-2xl bg-[var(--surface)] p-3 text-sm">
              Paid off in <b>{yearsMonths(res.months)}</b>
              {over && res.baseMonths > res.months ? <> — <b>{yearsMonths(res.baseMonths - res.months)}</b> sooner than without the extra.</> : "."}
            </p>
            <p className="text-xs text-muted-foreground">Many lenders limit overpayments (often 10% a year) during a fixed deal.</p>
          </div>
        ) : <p className="text-sm text-muted-foreground">Fill in the amount, interest and years.</p>}
      </RecordsWindow>
    </Windows>
  );
}

// ---------------------------------------------------------------- investments and pensions

function Investments() {
  const desktop = useDesktop();
  const q = useHoldings();
  const holdings = useMemo(() => q.data?.holdings ?? [], [q.data]);
  const values = useMemo(() => q.data?.values ?? [], [q.data]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Holding | "new" | null>(null);
  const open = holdings.find((h) => h.id === openId) ?? null;
  useEffect(() => { if (desktop && !openId && holdings.length) setOpenId(holdings[0].id); }, [desktop, openId, holdings]);
  const valuesOf = (id: string) => values.filter((v) => v.holding_id === id);

  const detail = open ? <HoldingDetail h={open} values={valuesOf(open.id)} onEdit={() => setEdit(open)} onClosed={() => setOpenId(null)} />
    : <Empty icon={LineChart} title="Pick one">Its values over time show here.</Empty>;

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Investments and pensions</h2>
          <Button data-testid="holding-add" className="h-10 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-4" /> Add</Button>
        </div>
        <p className="text-xs text-muted-foreground">Type in the value when a statement arrives. No live prices.</p>
        {holdings.length ? (
          <ul className="space-y-2">
            {holdings.map((h) => {
              const vs = valuesOf(h.id);
              const last = vs.at(-1);
              const firstV = vs[0];
              const growth = last && firstV && vs.length > 1 ? Number(last.value) - Number(firstV.value) : null;
              return (
                <li key={h.id}>
                  <button type="button" data-testid="holding-row" onClick={() => setOpenId(h.id)} className={cn("glass-tile flex min-h-14 w-full items-center gap-3 p-3 text-left", openId === h.id && "ring-2 ring-[var(--status-blue)]")}>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold"><span className="truncate">{h.name}</span>{h.private_to ? <MineLock /> : null}</span>
                      <span className="block truncate text-xs text-muted-foreground">{HOLDING_KIND_LABEL[h.kind]}{last ? ` · ${shortDate(last.on_date)}` : " · no value yet"}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-bold tabular-nums">{last ? money(last.value, true) : "—"}</span>
                      {growth != null ? <span className={cn("text-xs font-semibold tabular-nums", growth >= 0 ? "text-[var(--status-green)]" : "text-[var(--status-red)]")}>{growth >= 0 ? "+" : "−"}{money(Math.abs(growth), true)}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : q.isLoading ? null : <Empty icon={LineChart} title="Nothing added yet">Add an ISA, pension or shares, then type in the value from each statement.</Empty>}
      </RecordsWindow>
      <DetailWindow>{detail}</DetailWindow>
      {!desktop ? (
        <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)} title={open?.name ?? ""}>
          {open ? <HoldingDetail h={open} values={valuesOf(open.id)} onEdit={() => setEdit(open)} onClosed={() => setOpenId(null)} hideTitle /> : null}
        </Sheet>
      ) : null}
      <EditHolding value={edit} onClose={() => setEdit(null)} onSaved={(id) => { setEdit(null); setOpenId(id); }} />
    </Windows>
  );
}

function HoldingDetail({ h, values, onEdit, onClosed, hideTitle }: { h: Holding; values: HoldingValue[]; onEdit: () => void; onClosed: () => void; hideTitle?: boolean }) {
  const { family, members } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today);
  useEffect(() => { setValue(""); setDate(today); }, [h.id, today]);
  const last = values.at(-1);
  const first = values[0];
  const growth = last && first && values.length > 1 ? Number(last.value) - Number(first.value) : null;
  const pct = growth != null && Number(first.value) > 0 ? (growth / Number(first.value)) * 100 : null;
  const v = parseAmount(value);

  async function addValue() {
    if (v == null || v < 0 || !date) return;
    const same = values.find((x) => x.on_date === date);
    const { error } = same
      ? await supabase.from("money_holding_values").update({ value: v }).eq("id", same.id)
      : await supabase.from("money_holding_values").insert({ holding_id: h.id, family_id: family.id, value: v, on_date: date });
    if (error) { toast.error(errMsg(error)); return; }
    setValue("");
    await refreshMoney(qc, family.id);
    toast.success("Value saved");
  }
  async function removeValue(x: HoldingValue) {
    const { error } = await supabase.from("money_holding_values").delete().eq("id", x.id);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshMoney(qc, family.id);
    toast("Value removed", { action: { label: "Undo", onClick: async () => { await supabase.from("money_holding_values").insert({ holding_id: x.holding_id, family_id: x.family_id, value: x.value, on_date: x.on_date }); await refreshMoney(qc, family.id); } } });
  }
  async function archive() {
    const { error } = await supabase.from("money_holdings").update({ archived_at: new Date().toISOString() }).eq("id", h.id);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshMoney(qc, family.id);
    onClosed();
    toast(`${h.name} put away`, { action: { label: "Undo", onClick: async () => { await supabase.from("money_holdings").update({ archived_at: null }).eq("id", h.id); await refreshMoney(qc, family.id); } } });
  }

  return (
    <div className="space-y-4" data-testid="holding-detail">
      {!hideTitle ? <h2 className="flex items-center gap-2 text-lg font-bold">{h.name}{h.private_to ? <MineLock className="size-4" /> : null}</h2> : null}
      <div className="glass-tile p-3">
        <p className="text-xs text-muted-foreground">{HOLDING_KIND_LABEL[h.kind]}{h.owner ? ` · ${members.find((m) => m.id === h.owner)?.display_name ?? ""}` : ""}</p>
        <p className="text-3xl font-bold tabular-nums">{last ? money(last.value) : "No value yet"}</p>
        {growth != null ? (
          <p className={cn("text-sm font-semibold", growth >= 0 ? "text-[var(--status-green)]" : "text-[var(--status-red)]")}>
            {growth >= 0 ? "Up" : "Down"} {money(Math.abs(growth))}{pct != null ? ` (${Math.abs(pct).toFixed(1)}%)` : ""} since {shortDate(first.on_date)}
          </p>
        ) : null}
        <Sparkbars values={values.map((x) => Number(x.value))} className="mt-2" />
      </div>
      <section className="space-y-2">
        <h3 className="text-sm font-bold">Add the value from a statement</h3>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input data-testid="holding-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" className="h-11" aria-label="Value" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 w-40" aria-label="Date" />
        </div>
        <Button data-testid="holding-value-save" className="h-11 w-full rounded-full font-semibold" disabled={v == null || v < 0} onClick={() => void addValue()}>Save value</Button>
      </section>
      {values.length ? (
        <ul className="space-y-1">
          {[...values].reverse().map((x) => (
            <li key={x.id} className="flex items-center gap-2 rounded-xl bg-[var(--surface)] px-3 py-2 text-sm">
              <span className="flex-1">{shortDate(x.on_date)} {x.on_date.slice(0, 4)}</span>
              <span className="font-semibold tabular-nums">{money(x.value)}</span>
              <Button variant="ghost" size="icon" className="size-9 rounded-full" onClick={() => void removeValue(x)} aria-label="Remove"><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Button variant="ghost" className="h-10 flex-1 rounded-full" onClick={onEdit}><Pencil className="size-4" /> Change</Button>
        <Button variant="ghost" className="h-10 flex-1 rounded-full" onClick={() => void archive()}><Archive className="size-4" /> Put away</Button>
      </div>
    </div>
  );
}

function EditHolding({ value, onClose, onSaved }: { value: Holding | "new" | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { family, me } = useFamilyState();
  const parents = useParents();
  const qc = useQueryClient();
  const existing = value && value !== "new" ? value : null;
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Holding["kind"]>("isa");
  const [owner, setOwner] = useState<string[]>([]);
  const [mine, setMine] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!value) return;
    setName(existing?.name ?? ""); setKind(existing?.kind ?? "isa"); setOwner(existing?.owner ? [existing.owner] : []); setMine(!!existing?.private_to);
  }, [value, existing]);
  const cantHide = !!existing && !existing.private_to && existing.created_by !== me.id;

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    const row = { name: name.trim().slice(0, 60), kind, owner: owner[0] ?? null, private_to: mine ? me.id : null };
    const res = existing
      ? await supabase.from("money_holdings").update(row).eq("id", existing.id).select("id").single()
      : await supabase.from("money_holdings").insert({ ...row, family_id: family.id }).select("id").single();
    setBusy(false);
    if (res.error) { toast.error(errMsg(res.error)); return; }
    await refreshMoney(qc, family.id);
    onSaved(res.data.id as string);
  }

  return (
    <Sheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "Change" : "Add an investment or pension"}
      footer={
        <>
          <Button data-testid="holding-save" className="h-11 flex-1 rounded-full text-base font-semibold" disabled={!name.trim() || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={onClose}><X className="size-4" /> Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name"><Input data-testid="holding-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Workplace pension" className="h-11" maxLength={60} data-autofocus /></Field>
        <Field label="Type">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(HOLDING_KIND_LABEL) as Holding["kind"][]).map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{HOLDING_KIND_LABEL[k]}</Chip>)}
          </div>
        </Field>
        <Field label="Whose" hint="Optional"><PeoplePicker members={parents} value={owner} onChange={setOwner} single /></Field>
        <JustMine on={mine} onChange={setMine} disabled={cantHide && !mine} hint={cantHide ? "Only the parent who added this can make it private." : undefined} />
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- credit score

const AGENCIES: { name: string; max: number }[] = [{ name: "Experian", max: 999 }, { name: "Equifax", max: 1000 }, { name: "TransUnion", max: 710 }];

function Credit() {
  const { family, me } = useFamilyState();
  const parents = useParents();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const scores = useCreditScores().data ?? [];
  const [adding, setAdding] = useState(false);

  async function remove(s: CreditScore) {
    const { error } = await supabase.from("money_credit_scores").delete().eq("id", s.id);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshMoney(qc, family.id);
    toast("Score removed", { action: { label: "Undo", onClick: async () => { await supabase.from("money_credit_scores").insert({ family_id: s.family_id, member_id: s.member_id, agency: s.agency, score: s.score, on_date: s.on_date, private_to: s.private_to }); await refreshMoney(qc, family.id); } } });
  }

  const people = parents.filter((p) => p.id === me.id || scores.some((s) => s.member_id === p.id));
  const mineLatest = scores.filter((s) => s.member_id === me.id).at(-1);
  const due = !mineLatest || daysBetween(mineLatest.on_date, today) > 90;

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Credit score</h2>
          <Button data-testid="credit-add" className="h-10 rounded-full px-4 font-semibold" onClick={() => setAdding(true)}><Plus className="size-4" /> Add a score</Button>
        </div>
        <p className={cn("rounded-2xl p-3 text-sm", due ? "bg-[var(--status-amber-soft)] text-[var(--status-amber)]" : "bg-[var(--surface)]")}>
          {due ? "Time to check your score. " : ""}Checking every 3 months is plenty. Checking your own score never lowers it.
        </p>
        <div className="space-y-4">
          {people.map((p) => {
            const mine = scores.filter((s) => s.member_id === p.id);
            const agencies = [...new Set(mine.map((s) => s.agency))];
            return (
              <section key={p.id} data-testid="credit-person">
                <h3 className="mb-2 text-sm font-bold">{p.id === me.id ? "You" : p.display_name}</h3>
                {agencies.length ? (
                  <ul className="space-y-2">
                    {agencies.map((a) => {
                      const list = mine.filter((s) => s.agency === a);
                      const last = list.at(-1)!;
                      const prev = list.at(-2);
                      const max = AGENCIES.find((x) => x.name === a)?.max;
                      return (
                        <li key={a} className="glass-tile space-y-2 p-3">
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5 font-semibold">{a}{last.private_to ? <MineLock /> : null}</span>
                              <span className="text-xs text-muted-foreground">{shortDate(last.on_date)} {last.on_date.slice(0, 4)}{prev ? ` · ${last.score >= prev.score ? "up" : "down"} ${Math.abs(last.score - prev.score)} since last time` : ""}</span>
                            </span>
                            <span className="text-2xl font-bold tabular-nums">{last.score}{max ? <span className="text-xs font-normal text-muted-foreground"> / {max}</span> : null}</span>
                          </div>
                          <Sparkbars values={list.map((s) => s.score)} />
                          <details className="text-sm">
                            <summary className="cursor-pointer text-xs text-muted-foreground">History</summary>
                            <ul className="mt-1 space-y-1">
                              {[...list].reverse().map((s) => (
                                <li key={s.id} className="flex items-center gap-2 rounded-xl bg-[var(--surface)] px-3 py-1.5">
                                  <span className="flex-1">{shortDate(s.on_date)} {s.on_date.slice(0, 4)}</span>
                                  <span className="font-semibold tabular-nums">{s.score}</span>
                                  {s.member_id === me.id ? <Button variant="ghost" size="icon" className="size-8 rounded-full" onClick={() => void remove(s)} aria-label="Remove"><Trash2 className="size-4" /></Button> : null}
                                </li>
                              ))}
                            </ul>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">No scores yet.</p>}
              </section>
            );
          })}
        </div>
        <section className="space-y-1.5" data-testid="credit-links">
          <h3 className="text-sm font-bold">Check for free</h3>
          {CREDIT_LINKS.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-semibold text-[var(--status-blue)] underline-offset-2 hover:underline">
              <ExternalLink className="size-4" /> {l.name}
            </a>
          ))}
          <p className="text-xs text-muted-foreground">No commission. These are the free statutory reports.</p>
        </section>
      </RecordsWindow>
      <AddScore open={adding} onClose={() => setAdding(false)} />
    </Windows>
  );
}

function AddScore({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { family, me } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const [agency, setAgency] = useState("Experian");
  const [score, setScore] = useState("");
  const [date, setDate] = useState(today);
  const [mine, setMine] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setScore(""); setDate(today); } }, [open, today]);
  const n = Number(score);
  const ok = score.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 2000;

  async function save() {
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.from("money_credit_scores").insert({ family_id: family.id, member_id: me.id, agency, score: n, on_date: date || today, private_to: mine ? me.id : null });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshMoney(qc, family.id);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Add your credit score"
      footer={
        <>
          <Button data-testid="credit-save" className="h-11 flex-1 rounded-full text-base font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={onClose}><X className="size-4" /> Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Which company">
          <div className="flex flex-wrap gap-2">
            {AGENCIES.map((a) => <Chip key={a.name} on={agency === a.name} onClick={() => setAgency(a.name)}>{a.name}</Chip>)}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Score" hint={AGENCIES.find((a) => a.name === agency) ? `Out of ${AGENCIES.find((a) => a.name === agency)!.max}` : undefined}>
            <Input data-testid="credit-score" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value.replace(/\D/g, ""))} className="h-11" data-autofocus />
          </Field>
          <Field label="Checked on"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" /></Field>
        </div>
        <JustMine on={mine} onChange={setMine} />
      </div>
    </Sheet>
  );
}
