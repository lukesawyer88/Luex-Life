// Bills and subscriptions: what's due, a month calendar of due days, totals, price rises and contract endings.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, CalendarClock, CalendarDays, Check, ChevronLeft, ChevronRight, ExternalLink, List, Pencil, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { Chip, Empty, Field, Sheet } from "@/modules/calendar/ui";

import { JustMine, MineLock, NativeSelect, parseAmount, Stat, useRates } from "./bill-parts";
import {
  addDaysKey, addMonthsKey, COMPARE_LINKS, CURRENCIES, daysBetween, errMsg, EVERY, EVERY_LABEL, money, moneyIn, moneyKey, perMonth, perYear,
  refreshMoney, rows, shortDate, todayIn, useAccounts, useBills, useCategories, type Bill, type Every, type Payment,
} from "./data";
import { billDueDays } from "./bill-dates";
import type { TabProps } from "./money-page";
import { PaymentSheet } from "./payment-sheet";

function monthLabel(k: string) {
  return new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
function longDate(k: string) {
  return new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** amount in pounds (null when today's rate isn't known) */
function inGbp(b: Bill, rates: Map<string, number> | undefined): number | null {
  if (b.currency === "GBP") return Number(b.amount);
  const r = rates?.get(b.currency);
  return r ? Number(b.amount) * r : null;
}

function badges(b: Bill, today: string) {
  const out: { text: string; tone: "amber" | "red" | "blue" }[] = [];
  if (b.trial_ends && b.trial_ends >= today && daysBetween(today, b.trial_ends) <= 14) out.push({ text: `Free trial ends ${shortDate(b.trial_ends)}`, tone: "amber" });
  if (b.contract_ends && b.contract_ends >= today && daysBetween(today, b.contract_ends) <= 60) out.push({ text: `Contract ends ${shortDate(b.contract_ends)}`, tone: "blue" });
  if (b.previous_amount != null && Number(b.amount) > Number(b.previous_amount) && b.amount_changed_on && daysBetween(b.amount_changed_on, today) <= 90) {
    out.push({ text: "Price went up", tone: "red" });
  }
  return out;
}

const TONE = {
  amber: "bg-[var(--status-amber-soft)] text-[var(--status-amber)]",
  red: "bg-[var(--status-red-soft)] text-[var(--status-red)]",
  blue: "bg-[var(--status-blue-soft)] text-[var(--status-blue)]",
};

export function BillsTab({ target }: TabProps) {
  const { family } = useFamilyState();
  const desktop = useDesktop();
  const today = todayIn(family.timezone);
  const q = useBills();
  const bills = useMemo(() => q.data ?? [], [q.data]);
  const rates = useRates(bills.map((b) => b.currency)).data;
  const [view, setView] = useState<"list" | "calendar">("list");
  const [openId, setOpenId] = useState<string | null>(target.billId ?? null);
  const [edit, setEdit] = useState<Bill | "new" | null>(null);
  const [pay, setPay] = useState<Bill | null>(null);
  const open = bills.find((b) => b.id === openId) ?? null;

  useEffect(() => { if (target.billId) setOpenId(target.billId); }, [target.billId]);
  useEffect(() => {
    if (desktop && !openId && bills.length) setOpenId(bills[0].id);
  }, [desktop, openId, bills]);

  const weekEnd = addDaysKey(today, 7);
  const dueSoon = bills.filter((b) => b.next_due <= weekEnd);
  const later = bills.filter((b) => b.next_due > weekEnd);

  const totals = useMemo(() => {
    const t = { bills: 0, subs: 0, missing: 0 };
    for (const b of bills) {
      const a = inGbp(b, rates);
      if (a == null) { t.missing++; continue; }
      if (b.kind === "subscription") t.subs += perMonth(a, b.every as Every); else t.bills += perMonth(a, b.every as Every);
    }
    return t;
  }, [bills, rates]);

  const detail = open ? (
    <BillDetail b={open} today={today} rates={rates} onEdit={() => setEdit(open)} onPay={() => setPay(open)} onClosed={() => setOpenId(null)} />
  ) : (
    <Empty icon={CalendarClock} title="Pick a bill">Its details, price changes and payments show here.</Empty>
  );

  const row = (b: Bill) => {
    const tags = badges(b, today);
    const overdue = b.next_due < today && !b.auto_record;
    return (
      <li key={b.id}>
        <button
          type="button"
          data-testid="bill-row"
          onClick={() => setOpenId(b.id)}
          className={cn("glass-tile flex min-h-14 w-full items-center gap-3 p-3 text-left", openId === b.id && "ring-2 ring-[var(--status-blue)]")}
        >
          <span className="grid w-12 shrink-0 place-items-center rounded-xl bg-[var(--surface)] py-1 text-center leading-tight">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">{new Date(b.next_due + "T12:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</span>
            <span className="text-lg font-bold">{Number(b.next_due.slice(8))}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 font-semibold"><span className="truncate">{b.name}</span>{b.private_to ? <MineLock /> : null}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {b.kind === "subscription" ? "Subscription" : "Bill"} · {EVERY_LABEL[b.every as Every].toLowerCase()}{b.auto_record ? " · pays itself" : ""}
              {overdue ? " · not marked paid yet" : ""}
            </span>
            {tags.length ? (
              <span className="mt-1 flex flex-wrap gap-1">
                {tags.map((t) => <span key={t.text} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE[t.tone])}>{t.text}</span>)}
              </span>
            ) : null}
          </span>
          <span className="shrink-0 text-right font-bold tabular-nums">{b.currency === "GBP" ? money(b.amount) : moneyIn(b.amount, b.currency)}</span>
        </button>
      </li>
    );
  };

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Bills and subscriptions</h2>
          <div className="flex gap-1">
            <Chip on={view === "list"} onClick={() => setView("list")} title="List"><List className="size-4" /><span className="sr-only sm:not-sr-only">List</span></Chip>
            <Chip on={view === "calendar"} onClick={() => setView("calendar")} title="Calendar"><CalendarDays className="size-4" /><span className="sr-only sm:not-sr-only">Calendar</span></Chip>
          </div>
          <Button data-testid="bill-add" className="h-10 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-4" /> Add</Button>
        </div>

        {bills.length ? (
          <div className="grid grid-cols-3 gap-2" data-testid="bill-totals">
            <Stat label="Bills a month" value={money(totals.bills, true)} sub={`${money(totals.bills * 12, true)} a year`} />
            <Stat label="Subscriptions a month" value={money(totals.subs, true)} sub={`${money(totals.subs * 12, true)} a year`} />
            <Stat label="All together" value={money(totals.bills + totals.subs, true)} sub={totals.missing ? `+ ${totals.missing} in other money` : "a month"} />
          </div>
        ) : null}

        {q.isLoading ? null : !bills.length ? (
          <Empty icon={CalendarClock} title="No bills yet">Add your regular bills and subscriptions. You'll get a reminder before each one is due.</Empty>
        ) : view === "calendar" ? (
          <BillsCalendar bills={bills} today={today} onOpen={setOpenId} />
        ) : (
          <div className="space-y-4">
            <section data-testid="bills-due-week">
              <h3 className="mb-2 text-sm font-bold">Due in the next 7 days</h3>
              {dueSoon.length ? <ul className="space-y-2">{dueSoon.map(row)}</ul> : <p className="rounded-2xl bg-[var(--surface)] p-3 text-sm text-muted-foreground">Nothing due this week.</p>}
            </section>
            {later.length ? (
              <section>
                <h3 className="mb-2 text-sm font-bold">Later</h3>
                <ul className="space-y-2">{later.map(row)}</ul>
              </section>
            ) : null}
            <p className="px-1 text-xs text-muted-foreground">Renewal dates and documents for cars, insurance and the house arrive with Cars and Renewals, linked to these amounts.</p>
          </div>
        )}
      </RecordsWindow>
      <DetailWindow>{detail}</DetailWindow>
      {!desktop ? (
        <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)} title={open?.name ?? ""}>
          {open ? <BillDetail b={open} today={today} rates={rates} onEdit={() => setEdit(open)} onPay={() => setPay(open)} onClosed={() => setOpenId(null)} hideTitle /> : null}
        </Sheet>
      ) : null}
      <EditBill value={edit} onClose={() => setEdit(null)} onSaved={(id) => { setEdit(null); setOpenId(id); }} />
      <PaymentSheet
        open={!!pay}
        onOpenChange={(o) => !o && setPay(null)}
        preset={pay ? {
          bill_id: pay.id, amount: Number(pay.amount), currency: pay.currency, category_id: pay.category_id, account_id: pay.account_id,
          payee: pay.name, on_date: today, direction: "out", private_to: pay.private_to,
        } : undefined}
      />
    </Windows>
  );
}

function BillsCalendar({ bills, today, onOpen }: { bills: Bill[]; today: string; onOpen: (id: string) => void }) {
  const [month, setMonth] = useState(today.slice(0, 8) + "01");
  const [day, setDay] = useState<string | null>(null);
  const monthEnd = addDaysKey(addMonthsKey(month, 1), -1);
  const byDay = useMemo(() => {
    const m = new Map<string, Bill[]>();
    for (const b of bills) for (const d of billDueDays(b, monthEnd)) if (d >= month) m.set(d, [...(m.get(d) ?? []), b]);
    return m;
  }, [bills, month, monthEnd]);
  const lead = (new Date(month + "T12:00:00Z").getUTCDay() + 6) % 7;
  const days = Number(monthEnd.slice(8));
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month.slice(0, 8)}${String(i + 1).padStart(2, "0")}`)];
  const picked = day ? byDay.get(day) ?? [] : [];
  const monthTotal = [...byDay.values()].flat().reduce((n, b) => n + (b.currency === "GBP" ? Number(b.amount) : 0), 0);

  return (
    <div className="space-y-3" data-testid="bills-calendar">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => { setMonth(addMonthsKey(month, -1)); setDay(null); }} aria-label="Last month"><ChevronLeft className="size-5" /></Button>
        <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => { setMonth(addMonthsKey(month, 1)); setDay(null); }} aria-label="Next month"><ChevronRight className="size-5" /></Button>
        <h3 className="flex-1 font-bold">{monthLabel(month)}</h3>
        <span className="text-sm text-muted-foreground tabular-nums">{money(monthTotal, true)} due</span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i} className="font-semibold text-muted-foreground">{d}</div>)}
        {cells.map((k, i) => {
          if (!k) return <div key={i} />;
          const n = byDay.get(k)?.length ?? 0;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setDay(k === day ? null : k)}
              className={cn(
                "flex aspect-square min-h-9 flex-col items-center justify-center rounded-xl text-sm",
                k === today && "font-bold ring-1 ring-[var(--status-blue)]",
                k === day ? "bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : n ? "bg-[var(--surface)]" : "",
              )}
              aria-label={`${longDate(k)}${n ? `, ${n} due` : ""}`}
            >
              {Number(k.slice(8))}
              {n ? <span className="mt-0.5 flex gap-0.5">{Array.from({ length: Math.min(n, 3) }).map((_, j) => <span key={j} className="size-1.5 rounded-full bg-[var(--status-blue)]" />)}</span> : null}
            </button>
          );
        })}
      </div>
      {day ? (
        <div className="space-y-2">
          <h4 className="text-sm font-bold">{longDate(day)}</h4>
          {picked.length ? picked.map((b) => (
            <button key={b.id} type="button" onClick={() => onOpen(b.id)} className="glass-tile flex w-full items-center gap-2 p-3 text-left">
              <span className="flex-1 truncate font-semibold">{b.name}</span>
              <span className="font-bold tabular-nums">{b.currency === "GBP" ? money(b.amount) : moneyIn(b.amount, b.currency)}</span>
            </button>
          )) : <p className="text-sm text-muted-foreground">Nothing due.</p>}
        </div>
      ) : <p className="text-xs text-muted-foreground">Tap a day to see what's due.</p>}
    </div>
  );
}

function BillDetail({ b, today, rates, onEdit, onPay, onClosed, hideTitle }: {
  b: Bill; today: string; rates: Map<string, number> | undefined; onEdit: () => void; onPay: () => void; onClosed: () => void; hideTitle?: boolean;
}) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const accounts = useAccounts().data ?? [];
  const categories = useCategories().data ?? [];
  const recent = useQuery({
    queryKey: moneyKey(family.id, "bill-payments", b.id),
    queryFn: () => rows<Payment>(supabase.from("money_payments").select("*").eq("bill_id", b.id).is("deleted_at", null).order("on_date", { ascending: false }).limit(6)),
  });
  const gbp = inGbp(b, rates);
  const every = b.every as Every;
  const tags = badges(b, today);

  async function archive() {
    const { error } = await supabase.from("money_bills").update({ archived_at: new Date().toISOString() }).eq("id", b.id);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshMoney(qc, family.id);
    onClosed();
    toast(`${b.name} put away`, {
      action: { label: "Undo", onClick: async () => { await supabase.from("money_bills").update({ archived_at: null }).eq("id", b.id); await refreshMoney(qc, family.id); } },
    });
  }

  return (
    <div className="space-y-4" data-testid="bill-detail">
      {!hideTitle ? <h2 className="flex items-center gap-2 text-lg font-bold">{b.name}{b.private_to ? <MineLock className="size-4" /> : null}</h2> : null}
      <div className="glass-tile p-3">
        <p className="text-3xl font-bold tabular-nums">{b.currency === "GBP" ? money(b.amount) : moneyIn(b.amount, b.currency)}</p>
        <p className="text-sm text-muted-foreground">{EVERY_LABEL[every]} · next due {longDate(b.next_due)}</p>
        {b.currency !== "GBP" && gbp != null ? <p className="text-xs text-muted-foreground">About {money(gbp)} at today's rate</p> : null}
        {(every === "year" || every === "quarter") && gbp != null ? (
          <p className="mt-2 rounded-xl bg-[var(--surface)] px-3 py-2 text-sm" data-testid="bill-set-aside">
            {money(perYear(gbp, every), true)} a year = <b>{money(perMonth(gbp, every))} a month</b> to set aside
          </p>
        ) : null}
        {tags.length ? <div className="mt-2 flex flex-wrap gap-1">{tags.map((t) => <span key={t.text} className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", TONE[t.tone])}>{t.text}</span>)}</div> : null}
      </div>

      {b.previous_amount != null && Number(b.previous_amount) !== Number(b.amount) && b.amount_changed_on ? (
        <p className={cn("flex items-start gap-2 rounded-2xl p-3 text-sm", Number(b.amount) > Number(b.previous_amount) ? TONE.red : TONE.blue)} data-testid="bill-price-change">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Was {money(b.previous_amount)}, now {money(b.amount)} since {shortDate(b.amount_changed_on)}.
        </p>
      ) : null}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Type</dt><dd>{b.kind === "subscription" ? "Subscription" : "Bill"}</dd>
        <dt className="text-muted-foreground">Paid from</dt><dd>{accounts.find((a) => a.id === b.account_id)?.name ?? "Not set"}</dd>
        <dt className="text-muted-foreground">Category</dt><dd>{categories.find((c) => c.id === b.category_id)?.name ?? "Not set"}</dd>
        <dt className="text-muted-foreground">Pays itself</dt><dd>{b.auto_record ? "Yes, recorded on the day" : "No, mark it paid"}</dd>
        <dt className="text-muted-foreground">Reminder</dt><dd>{b.remind_days === 0 ? "On the day" : `${b.remind_days} ${b.remind_days === 1 ? "day" : "days"} before`}</dd>
        {b.trial_ends ? <><dt className="text-muted-foreground">Free trial ends</dt><dd>{longDate(b.trial_ends)}</dd></> : null}
        {b.contract_ends ? <><dt className="text-muted-foreground">Contract ends</dt><dd>{longDate(b.contract_ends)}</dd></> : null}
      </dl>
      {b.notes ? <p className="rounded-2xl bg-[var(--surface)] p-3 text-sm">{b.notes}</p> : null}

      {b.contract_ends ? (
        <section className="space-y-1.5" data-testid="bill-compare">
          <h3 className="text-sm font-bold">When the contract ends, compare prices</h3>
          {COMPARE_LINKS.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-semibold text-[var(--status-blue)] underline-offset-2 hover:underline">
              <ExternalLink className="size-4" /> {l.name}
            </a>
          ))}
          <p className="text-xs text-muted-foreground">Plain links. Luex earns nothing from them.</p>
        </section>
      ) : null}

      <div className="space-y-2">
        <Button data-testid="bill-paid" className="h-11 w-full rounded-full font-semibold" onClick={onPay}><Check className="size-4" /> Mark paid</Button>
        <div className="flex gap-2">
          <Button variant="ghost" className="h-10 flex-1 rounded-full" onClick={onEdit}><Pencil className="size-4" /> Change</Button>
          <Button variant="ghost" className="h-10 flex-1 rounded-full" onClick={() => void archive()}><Archive className="size-4" /> Put away</Button>
        </div>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-bold">Recent payments</h3>
        {recent.data?.length ? (
          <ul className="space-y-1 text-sm">
            {recent.data.map((p) => (
              <li key={p.id} className="flex justify-between rounded-xl bg-[var(--surface)] px-3 py-2">
                <span>{shortDate(p.on_date)}{p.source === "bill" ? " · recorded itself" : ""}</span>
                <span className="font-semibold tabular-nums">{money(p.amount_gbp)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">None yet.</p>}
      </section>
    </div>
  );
}

function EditBill({ value, onClose, onSaved }: { value: Bill | "new" | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { family, me } = useFamilyState();
  const qc = useQueryClient();
  const accounts = useAccounts().data ?? [];
  const categories = (useCategories().data ?? []).filter((c) => c.direction === "out" && !c.archived_at);
  const existing = value && value !== "new" ? value : null;
  const today = todayIn(family.timezone);
  const [f, setF] = useState({
    name: "", kind: "bill" as Bill["kind"], amount: "", currency: "GBP", every: "month" as Every, next_due: today, account_id: "", category_id: "",
    payee_match: "", trial_ends: "", contract_ends: "", remind_days: 2, auto_record: false, notes: "", mine: false,
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!value) return;
    const b = existing;
    setF({
      name: b?.name ?? "", kind: b?.kind ?? "bill", amount: b ? String(b.amount) : "", currency: b?.currency ?? "GBP", every: (b?.every as Every) ?? "month",
      next_due: b?.next_due ?? today, account_id: b?.account_id ?? "", category_id: b?.category_id ?? "", payee_match: b?.payee_match ?? "",
      trial_ends: b?.trial_ends ?? "", contract_ends: b?.contract_ends ?? "", remind_days: b?.remind_days ?? 2, auto_record: b?.auto_record ?? false,
      notes: b?.notes ?? "", mine: !!b?.private_to,
    });
  }, [value, existing, today]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const amount = parseAmount(f.amount);
  const ok = !!f.name.trim() && amount != null && amount >= 0 && !!f.next_due;
  const account = accounts.find((a) => a.id === f.account_id);
  const lockedByAccount = !!account?.private_to;
  // only the person who added a shared bill can make it private
  const cantHide = !!existing && !existing.private_to && existing.created_by !== me.id;

  async function save() {
    if (!ok) return;
    setBusy(true);
    const row = {
      name: f.name.trim().slice(0, 80), kind: f.kind, amount: amount!, currency: f.currency, every: f.every, next_due: f.next_due,
      account_id: f.account_id || null, category_id: f.category_id || null, payee_match: f.payee_match.trim().slice(0, 60) || null,
      trial_ends: f.trial_ends || null, contract_ends: f.contract_ends || null, remind_days: f.remind_days, auto_record: f.auto_record,
      notes: f.notes.trim().slice(0, 500), private_to: f.mine || lockedByAccount ? me.id : null,
    };
    const res = existing
      ? await supabase.from("money_bills").update(row).eq("id", existing.id).select("id").single()
      : await supabase.from("money_bills").insert({ ...row, family_id: family.id }).select("id").single();
    setBusy(false);
    if (res.error) { toast.error(errMsg(res.error)); return; }
    await refreshMoney(qc, family.id);
    toast.success(existing ? "Saved" : `${row.name} added`);
    onSaved(res.data.id as string);
  }

  return (
    <Sheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "Change bill" : "Add a bill or subscription"}
      footer={
        <>
          <Button data-testid="bill-save" className="h-11 flex-1 rounded-full text-base font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={onClose}><X className="size-4" /> Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <Chip on={f.kind === "bill"} onClick={() => set("kind", "bill")}>Bill</Chip>
          <Chip on={f.kind === "subscription"} onClick={() => set("kind", "subscription")}>Subscription</Chip>
        </div>
        <Field label="Name"><Input data-testid="bill-name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={f.kind === "bill" ? "Electricity" : "Netflix"} className="h-11" maxLength={80} data-autofocus /></Field>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="Amount"><Input data-testid="bill-amount" inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" className="h-11" /></Field>
          <Field label="Money">
            <NativeSelect value={f.currency} onChange={(e) => set("currency", e.target.value)} aria-label="Currency" className="w-24">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="How often">
            <NativeSelect value={f.every} onChange={(e) => set("every", e.target.value as Every)}>
              {EVERY.map((e) => <option key={e} value={e}>{EVERY_LABEL[e]}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Next due"><Input data-testid="bill-due" type="date" value={f.next_due} onChange={(e) => set("next_due", e.target.value)} className="h-11" /></Field>
        </div>
        {amount != null && (f.every === "year" || f.every === "quarter") && f.currency === "GBP" ? (
          <p className="rounded-xl bg-[var(--surface)] px-3 py-2 text-sm">{money(perYear(amount, f.every), true)} a year = {money(perMonth(amount, f.every))} a month to set aside</p>
        ) : null}
        <label className="flex items-start gap-3 rounded-2xl bg-[var(--surface)] p-3">
          <Switch checked={f.auto_record} onCheckedChange={(v) => set("auto_record", v)} className="mt-0.5" data-testid="bill-auto" />
          <span><span className="block font-semibold">Pays itself (direct debit)</span><span className="text-xs text-muted-foreground">Recorded as paid on the day, without you ticking it.</span></span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Paid from">
            <NativeSelect value={f.account_id} onChange={(e) => set("account_id", e.target.value)}>
              <option value="">Not set</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.private_to ? " (just mine)" : ""}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Category">
            <NativeSelect value={f.category_id} onChange={(e) => set("category_id", e.target.value)}>
              <option value="">Not set</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ""}{c.name}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <Field label="Remind me">
          <NativeSelect value={String(f.remind_days)} onChange={(e) => set("remind_days", Number(e.target.value))}>
            <option value="0">On the day</option>
            {[1, 2, 3, 5, 7, 14].map((n) => <option key={n} value={n}>{n} {n === 1 ? "day" : "days"} before</option>)}
          </NativeSelect>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Free trial ends" hint="Optional"><Input type="date" value={f.trial_ends} onChange={(e) => set("trial_ends", e.target.value)} className="h-11" /></Field>
          <Field label="Contract ends" hint="Optional"><Input type="date" value={f.contract_ends} onChange={(e) => set("contract_ends", e.target.value)} className="h-11" /></Field>
        </div>
        <Field label="Words on your bank statement" hint="Optional. Helps match this bill when you bring in a statement, e.g. OCTOPUS">
          <Input value={f.payee_match} onChange={(e) => set("payee_match", e.target.value)} className="h-11" maxLength={60} />
        </Field>
        <Field label="Notes"><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={2} maxLength={500} placeholder="Account number is on the paper bill" /></Field>
        <JustMine
          on={f.mine || lockedByAccount}
          onChange={(v) => set("mine", v)}
          disabled={lockedByAccount || (cantHide && !f.mine)}
          hint={lockedByAccount ? "It's paid from a \"just mine\" account, so it's just yours too." : cantHide ? "Only the parent who added this can make it private." : undefined}
        />
      </div>
    </Sheet>
  );
}
