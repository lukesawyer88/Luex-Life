// Every payment in a chosen time, with search and filters, totals, and the way in to add or import.
import { ChevronLeft, ChevronRight, CloudOff, FileUp, Lock, Paperclip, Plus, ReceiptText, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useExtra } from "@/lib/extras";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Empty, Field, Sheet } from "@/modules/calendar/ui";

import {
  addMonthsKey, money, moneyIn, periodFor, shiftPeriod, shortDate, todayIn, useAccounts, useCategories, useMoneySettings, usePayments,
  type Category, type Payment,
} from "./data";
import { ImportSheet } from "./import-sheet";
import type { TabProps } from "./money-page";
import { readOutbox } from "./outbox";
import { PaymentSheet } from "./payment-sheet";

const SELECT = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";

type RangeMode = "period" | "3m" | "year" | "custom";
type Filters = { category: string; account: string; paidBy: string; direction: "" | "out" | "in"; notInBudget: boolean; hasReceipt: boolean };
const NO_FILTERS: Filters = { category: "", account: "", paidBy: "", direction: "", notInBudget: false, hasReceipt: false };

export function PaymentsTab({ target, onGo }: TabProps) {
  const { family, members } = useFamilyState();
  const settings = useMoneySettings().data;
  const today = todayIn(family.timezone);
  const cats = useCategories().data ?? [];
  const accounts = useAccounts().data ?? [];
  const parents = members.filter((m) => m.role === "parent");

  const [mode, setMode] = useState<RangeMode>("period");
  const [periodStart, setPeriodStart] = useState(() => periodFor(settings, today).start);
  const [custom, setCustom] = useState({ from: addMonthsKey(today, -1), to: today });
  const period = periodFor(settings, periodStart);
  const range = mode === "period" ? { from: period.start, to: period.end, label: period.label }
    : mode === "3m" ? { from: addMonthsKey(today, -3), to: today, label: "Last 3 months" }
      : mode === "year" ? { from: today.slice(0, 4) + "-01-01", to: today.slice(0, 4) + "-12-31", label: `${today.slice(0, 4)} so far` }
        : { from: custom.from <= custom.to ? custom.from : custom.to, to: custom.from <= custom.to ? custom.to : custom.from, label: "Chosen dates" };
  const payments = usePayments(range.from, range.to);

  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Filters>(() => ({ ...NO_FILTERS, category: target.categoryId ?? "" }));
  const [showFilters, setShowFilters] = useState(false);
  // the detailed filters and reports are an extra (Settings, More features); search always shows
  const reportsOn = useExtra("money.reports");
  const [editing, setEditing] = useState<Payment | null>(null);
  const [adding, setAdding] = useState(!!target.add);
  const [importing, setImporting] = useState(false);
  const [waiting, setWaiting] = useState(() => readOutbox().length);

  // the settings arrive after the first draw: start on the current period
  useEffect(() => { if (settings) setPeriodStart(periodFor(settings, today).start); }, [settings, today]);
  useEffect(() => { if (target.categoryId) setFilters((f) => ({ ...f, category: target.categoryId! })); }, [target.categoryId]);
  useEffect(() => { if (target.add) setAdding(true); }, [target.add]);

  // opened from a link: fetch that one payment, whenever it was
  useEffect(() => {
    if (!target.paymentId) return;
    let live = true;
    void supabase.from("money_payments").select("*").eq("id", target.paymentId).maybeSingle().then(({ data }) => {
      if (live && data) setEditing(data as Payment);
    });
    return () => { live = false; };
  }, [target.paymentId]);

  useEffect(() => {
    const tick = () => setWaiting(readOutbox().length);
    const t = setInterval(tick, 4000);
    window.addEventListener("online", tick);
    return () => { clearInterval(t); window.removeEventListener("online", tick); };
  }, []);

  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase();
    return (payments.data ?? []).filter((p) => {
      if (words && !`${p.payee} ${p.note} ${catById.get(p.category_id ?? "")?.name ?? ""}`.toLowerCase().includes(words)) return false;
      if (filters.category && (filters.category === "none" ? p.category_id : p.category_id !== filters.category)) return false;
      if (filters.account && (filters.account === "none" ? p.account_id : p.account_id !== filters.account)) return false;
      if (filters.paidBy && p.paid_by !== filters.paidBy) return false;
      if (filters.direction && p.direction !== filters.direction) return false;
      if (filters.notInBudget && p.in_budget) return false;
      if (filters.hasReceipt && !p.receipt_path) return false;
      return true;
    });
  }, [payments.data, q, filters, catById]);

  const out = shown.filter((p) => p.direction === "out").reduce((n, p) => n + Number(p.amount_gbp), 0);
  const inn = shown.filter((p) => p.direction === "in").reduce((n, p) => n + Number(p.amount_gbp), 0);
  const byDay = useMemo(() => {
    const m = new Map<string, Payment[]>();
    for (const p of shown) m.set(p.on_date, [...(m.get(p.on_date) ?? []), p]);
    return [...m.entries()];
  }, [shown]);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of shown) if (p.direction === "out") m.set(p.category_id ?? "", (m.get(p.category_id ?? "") ?? 0) + Number(p.amount_gbp));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [shown]);
  const activeFilters = Object.entries(filters).filter(([k, v]) => v && v !== NO_FILTERS[k as keyof Filters]).length;

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {mode === "period" ? (
            <>
              <Button variant="ghost" size="icon" className="size-10 rounded-full" aria-label="Earlier" onClick={() => setPeriodStart(shiftPeriod(settings, periodStart, -1).start)}><ChevronLeft className="size-5" /></Button>
              <Button variant="ghost" size="icon" className="size-10 rounded-full" aria-label="Later" onClick={() => setPeriodStart(shiftPeriod(settings, periodStart, 1).start)}><ChevronRight className="size-5" /></Button>
            </>
          ) : null}
          <select data-testid="payments-range" aria-label="Which dates" className="h-10 min-w-0 flex-1 rounded-full border border-input bg-background px-3 text-sm font-semibold sm:max-w-56" value={mode} onChange={(e) => setMode(e.target.value as RangeMode)}>
            <option value="period">{mode === "period" ? range.label : "This month"}</option>
            <option value="3m">Last 3 months</option>
            <option value="year">This year</option>
            <option value="custom">Choose dates</option>
          </select>
          <div className="ml-auto flex gap-1.5">
            <Button data-testid="import-open" variant="outline" className="h-10 rounded-full px-3" aria-label="Bring in a bank statement" onClick={() => setImporting(true)}><FileUp className="size-4" /><span className="hidden sm:inline">Bring in a bank statement</span></Button>
            <Button data-testid="payment-add" className="h-10 rounded-full px-4 font-semibold" onClick={() => setAdding(true)}><Plus className="size-4" /> Add</Button>
          </div>
        </div>
        {mode === "custom" ? (
          <div className="flex gap-2">
            <Input type="date" aria-label="From" className="h-10" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            <Input type="date" aria-label="To" className="h-10" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </div>
        ) : null}
        <div className="flex gap-1.5">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input data-testid="payments-search" className="h-10 rounded-full pl-9" placeholder="Search payments" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {reportsOn ? (
            <Button data-testid="payments-filters" variant={activeFilters ? "default" : "outline"} className="h-10 rounded-full px-3" onClick={() => setShowFilters(true)}>
              <SlidersHorizontal className="size-4" />{activeFilters ? ` ${activeFilters}` : <span className="hidden sm:inline">Filters</span>}
            </Button>
          ) : null}
          {activeFilters ? <Button variant="ghost" size="icon" className="size-10 rounded-full" aria-label="Clear filters" onClick={() => setFilters(NO_FILTERS)}><X className="size-4" /></Button> : null}
        </div>
        <div className="grid grid-cols-2 gap-2" data-testid="payments-totals">
          <div className="glass-tile px-3 py-2"><p className="text-xs text-muted-foreground">Money out</p><p className="text-lg font-bold tabular-nums">{money(out)}</p></div>
          <div className="glass-tile px-3 py-2"><p className="text-xs text-muted-foreground">Money in</p><p className="text-lg font-bold tabular-nums text-[var(--status-green)]">{money(inn)}</p></div>
        </div>
        {waiting ? (
          <p className="flex items-center gap-2 rounded-2xl bg-[var(--status-amber-soft)] px-3 py-2 text-sm text-[var(--status-amber)]" data-testid="payments-waiting">
            <CloudOff className="size-4" /> {waiting} payment{waiting === 1 ? "" : "s"} waiting for a signal
          </p>
        ) : null}
        <div className="scrollbar-thin -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {payments.isLoading ? <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            : byDay.length ? (
              <div className="space-y-3 pb-2">
                {byDay.map(([day, list]) => (
                  <section key={day}>
                    <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{day === today ? "Today" : shortDate(day)}</h3>
                    <ul className="space-y-1">
                      {list.map((p) => <PaymentRow key={p.id} p={p} cat={catById.get(p.category_id ?? "")} who={members.find((m) => m.id === p.paid_by)?.display_name} account={accounts.find((a) => a.id === p.account_id)?.name} onOpen={() => setEditing(p)} />)}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <Empty icon={ReceiptText} title={q || activeFilters ? "Nothing matches" : "No payments yet"}>
                {q || activeFilters ? "Try other words or clear the filters." : "Add one in seconds, or bring in a bank statement."}
              </Empty>
            )}
        </div>
      </RecordsWindow>
      <DetailWindow>
        <h3 className="mb-2 text-sm font-bold">Money out by category</h3>
        <p className="mb-3 text-xs text-muted-foreground">{range.label}{q || activeFilters ? " · matching payments" : ""}</p>
        {byCat.length ? (
          <ul className="space-y-1.5">
            {byCat.map(([id, total]) => {
              const c = catById.get(id);
              return (
                <li key={id || "none"}>
                  <button type="button" className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => setFilters({ ...filters, category: id || "none" })}>
                    <span aria-hidden>{c?.emoji ?? "•"}</span>
                    <span className="min-w-0 flex-1 truncate">{c?.name ?? "No category"}</span>
                    <span className="font-semibold tabular-nums">{money(total)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Nothing spent in these dates.</p>}
        {reportsOn ? <Button variant="link" className="mt-3 h-auto p-0" onClick={() => onGo({ tab: "reports" })}>See reports</Button> : null}
      </DetailWindow>

      <Sheet open={showFilters} onOpenChange={setShowFilters} title="Filters"
        footer={<>
          <Button className="h-11 flex-1 rounded-full font-semibold" onClick={() => setShowFilters(false)}>Show {shown.length}</Button>
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => setFilters(NO_FILTERS)}>Clear</Button>
        </>}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <Chip on={filters.direction === ""} onClick={() => setFilters({ ...filters, direction: "" })}>All</Chip>
            <Chip on={filters.direction === "out"} onClick={() => setFilters({ ...filters, direction: "out" })}>Money out</Chip>
            <Chip on={filters.direction === "in"} onClick={() => setFilters({ ...filters, direction: "in" })}>Money in</Chip>
          </div>
          <Field label="Category">
            <select data-testid="filter-category" className={SELECT} value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
              <option value="">Any</option>
              <option value="none">No category</option>
              {cats.map((c: Category) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ""}{c.name}{c.direction === "in" ? " (in)" : ""}</option>)}
            </select>
          </Field>
          <Field label="Account">
            <select data-testid="filter-account" className={SELECT} value={filters.account} onChange={(e) => setFilters({ ...filters, account: e.target.value })}>
              <option value="">Any</option>
              <option value="none">Not set</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          {parents.length > 1 ? (
            <Field label="Who paid">
              <select data-testid="filter-who" className={SELECT} value={filters.paidBy} onChange={(e) => setFilters({ ...filters, paidBy: e.target.value })}>
                <option value="">Anyone</option>
                {parents.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
              </select>
            </Field>
          ) : null}
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">Only "not in the budget"<Switch checked={filters.notInBudget} onCheckedChange={(v) => setFilters({ ...filters, notInBudget: v })} /></label>
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">Only with a receipt<Switch checked={filters.hasReceipt} onCheckedChange={(v) => setFilters({ ...filters, hasReceipt: v })} /></label>
        </div>
      </Sheet>

      <PaymentSheet open={adding} onOpenChange={(o) => { setAdding(o); if (!o) setWaiting(readOutbox().length); }} />
      <PaymentSheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} payment={editing} />
      <ImportSheet open={importing} onOpenChange={setImporting} />
    </Windows>
  );
}

function PaymentRow({ p, cat, who, account, onOpen }: { p: Payment; cat?: Category; who?: string; account?: string; onOpen: () => void }) {
  const isIn = p.direction === "in";
  const bits = [cat?.name ?? (isIn ? "Money in" : "No category"), who, account].filter(Boolean).join(" · ");
  return (
    <li>
      <button type="button" data-testid="payment-row" onClick={onOpen} className={cn("glass-tile flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left", !p.in_budget && "opacity-75")}>
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-lg" aria-hidden>{cat?.emoji ?? (isIn ? "➕" : "•")}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
            {p.private_to ? <Lock className="size-3.5 shrink-0" aria-label="Just mine" /> : null}
            <span className="truncate">{p.payee || cat?.name || (isIn ? "Money in" : "Payment")}</span>
            {p.receipt_path ? <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has a receipt" /> : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{bits}{p.note ? ` · ${p.note}` : ""}{!p.in_budget ? " · not in the budget" : ""}{p.source === "food" ? " · from Food" : ""}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className={cn("block font-bold tabular-nums", isIn && "text-[var(--status-green)]")}>{isIn ? "+" : ""}{money(p.amount_gbp)}</span>
          {p.currency !== "GBP" ? <span className="block text-xs text-muted-foreground tabular-nums">{moneyIn(p.amount, p.currency)}</span> : null}
        </span>
      </button>
    </li>
  );
}
