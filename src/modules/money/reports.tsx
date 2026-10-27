// Reports: this period against last, by category, year so far, biggest changes, a year of money in and out, and exports.
import { useQuery } from "@tanstack/react-query";
import { BarChart3, FileDown, FileSpreadsheet, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { cn } from "@/lib/utils";
import { Chip, Empty, Field } from "@/modules/calendar/ui";

import { byCategory, catLabel, counted, lastMonths, monthShort, sum } from "./budget-helpers";
import {
  errMsg, fetchPayments, money, moneyKey, periodFor, shiftPeriod, todayIn,
  useAccounts, useBills, useCategories, useMoneySettings,
} from "./data";
import type { TabProps } from "./money-page";
import { paymentsCsv, summaryPdf, type ExportLookups } from "./report-export";

type View = "period" | "year";

export function ReportsTab(_: TabProps) {
  const { family, members } = useFamilyState();
  const settings = useMoneySettings().data ?? null;
  const today = todayIn(family.timezone);
  const per = periodFor(settings, today);
  const prev = shiftPeriod(settings, per.start, -1);
  const months = lastMonths(today, 12);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const from = [months[0] + "-01", prev.start, yearStart].sort()[0];
  const cats = useCategories().data ?? [];
  const accounts = useAccounts().data ?? [];
  const bills = useBills().data ?? [];
  const pays = useQuery({ queryKey: moneyKey(family.id, "payments", from, today), queryFn: () => fetchPayments(family.id, from, today) });
  const all = useMemo(() => pays.data ?? [], [pays.data]);
  const [view, setView] = useState<View>("period");

  const nowOut = byCategory(counted(all, "out", per.start, per.end));
  const lastOut = byCategory(counted(all, "out", prev.start, prev.end));
  const yearOut = byCategory(counted(all, "out", yearStart, today));
  const catOf = (id: string) => cats.find((c) => c.id === id);
  const ids = [...new Set([...nowOut.keys(), ...lastOut.keys(), ...yearOut.keys()])];

  const rows = ids
    .map((id) => ({ id, now: nowOut.get(id) ?? 0, last: lastOut.get(id) ?? 0, year: yearOut.get(id) ?? 0 }))
    .sort((a, b) => (view === "period" ? b.now - a.now : b.year - a.year));
  const changes = rows.filter((r) => r.now !== r.last).sort((a, b) => Math.abs(b.now - b.last) - Math.abs(a.now - a.last)).slice(0, 3);

  const monthly = months.map((ym) => {
    const f = ym + "-01";
    const t = ym + "-31";
    return { ym, in: sum(counted(all, "in", f, t)), out: sum(counted(all, "out", f, t)) };
  });
  const top = Math.max(1, ...monthly.map((m) => Math.max(m.in, m.out)));

  const nowTotal = sum(counted(all, "out", per.start, per.end));
  const lastTotal = sum(counted(all, "out", prev.start, prev.end));
  const yearIn = sum(counted(all, "in", yearStart, today));
  const yearTotal = sum(counted(all, "out", yearStart, today));
  const maxRow = Math.max(1, ...rows.map((r) => (view === "period" ? Math.max(r.now, r.last) : r.year)));
  const lookups: ExportLookups = { cats, accounts, bills, members };

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Reports</h2>
          <Chip on={view === "period"} onClick={() => setView("period")}>{settings?.period === "payday" ? "This pay period" : "This month"}</Chip>
          <Chip on={view === "year"} onClick={() => setView("year")}>Year so far</Chip>
        </div>

        {view === "period" ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="glass-tile p-3"><p className="text-xs text-muted-foreground">Money out: {per.label}</p><p className="text-2xl font-bold tabular-nums" data-testid="report-now">{money(nowTotal)}</p></div>
            <div className="glass-tile p-3"><p className="text-xs text-muted-foreground">Last time: {prev.label}</p><p className="text-2xl font-bold tabular-nums">{money(lastTotal)}</p>
              {lastTotal ? <p className={cn("text-xs font-semibold", nowTotal > lastTotal ? "text-[var(--status-red)]" : "text-[var(--status-green)]")}>{nowTotal > lastTotal ? `${money(nowTotal - lastTotal)} more` : `${money(lastTotal - nowTotal)} less`} so far</p> : null}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div className="glass-tile p-3"><p className="text-xs text-muted-foreground">Money in this year</p><p className="text-2xl font-bold tabular-nums text-[var(--status-green)]">{money(yearIn)}</p></div>
            <div className="glass-tile p-3"><p className="text-xs text-muted-foreground">Money out this year</p><p className="text-2xl font-bold tabular-nums" data-testid="report-year">{money(yearTotal)}</p></div>
          </div>
        )}

        {pays.isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p> : rows.length ? (
          <section>
            <h3 className="mb-1 text-sm font-bold">By category</h3>
            <ul className="space-y-1.5" data-testid="report-categories">
              {rows.map((r) => (
                <li key={r.id || "none"} className="glass-tile px-3 py-2">
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-semibold">{catLabel(catOf(r.id))}</span>
                    {view === "period" ? <><b className="tabular-nums">{money(r.now)}</b><span className="w-24 text-right text-xs tabular-nums text-muted-foreground">last {money(r.last)}</span></> : <b className="tabular-nums">{money(r.year)}</b>}
                  </div>
                  {view === "period" ? (
                    <div className="mt-1 space-y-0.5">
                      <div className="h-1.5 rounded-full bg-[var(--status-blue)]" style={{ width: `${(r.now / maxRow) * 100}%` }} />
                      <div className="h-1.5 rounded-full bg-muted-foreground/30" style={{ width: `${(r.last / maxRow) * 100}%` }} />
                    </div>
                  ) : <div className="mt-1 h-1.5 rounded-full bg-[var(--status-blue)]" style={{ width: `${(r.year / maxRow) * 100}%` }} />}
                </li>
              ))}
            </ul>
          </section>
        ) : <Empty icon={BarChart3} title="Nothing to show yet">Reports fill in as you add or import payments.</Empty>}

        <div className="lg:hidden"><Side monthly={monthly} top={top} changes={changes} catOf={catOf} lookups={lookups} today={today} /></div>
      </RecordsWindow>
      <DetailWindow>
        <Side monthly={monthly} top={top} changes={changes} catOf={catOf} lookups={lookups} today={today} />
      </DetailWindow>
    </Windows>
  );
}

function Side({ monthly, top, changes, catOf, lookups, today }: {
  monthly: { ym: string; in: number; out: number }[]; top: number; changes: { id: string; now: number; last: number }[];
  catOf: (id: string) => ReturnType<ExportLookups["cats"]["find"]>; lookups: ExportLookups; today: string;
}) {
  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-1 text-sm font-bold">Biggest changes since last time</h3>
        {changes.length ? (
          <ul className="space-y-1 text-sm" data-testid="report-changes">
            {changes.map((c) => {
              const up = c.now > c.last;
              const Icon = up ? TrendingUp : TrendingDown;
              return (
                <li key={c.id || "none"} className="flex items-center gap-2">
                  <Icon className={cn("size-4 shrink-0", up ? "text-[var(--status-red)]" : "text-[var(--status-green)]")} />
                  <span className="min-w-0 flex-1 truncate">{catLabel(catOf(c.id))}</span>
                  <b className="tabular-nums">{up ? "+" : "−"}{money(Math.abs(c.now - c.last))}</b>
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-muted-foreground">No changes yet.</p>}
      </section>

      <section>
        <h3 className="mb-1 text-sm font-bold">Money in and out, month by month</h3>
        <div className="flex h-32 items-end gap-1" data-testid="report-months">
          {monthly.map((m) => (
            <div key={m.ym} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5" title={`${monthShort(m.ym)}: in ${money(m.in)}, out ${money(m.out)}`}>
              <div className="flex w-full flex-1 items-end justify-center gap-px">
                <div className="w-1/2 rounded-t bg-[var(--status-green)]" style={{ height: `${(m.in / top) * 100}%` }} />
                <div className="w-1/2 rounded-t bg-[var(--status-blue)]" style={{ height: `${(m.out / top) * 100}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground">{monthShort(m.ym).slice(0, 1)}</span>
            </div>
          ))}
        </div>
        <p className="mt-1 flex gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-[var(--status-green)]" /> Money in</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-[var(--status-blue)]" /> Money out</span>
        </p>
      </section>

      <ExportBox lookups={lookups} today={today} />
    </div>
  );
}

function ExportBox({ lookups, today }: { lookups: ExportLookups; today: string }) {
  const { family } = useFamilyState();
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);
  const ok = !!from && !!to && from <= to;

  async function run(kind: "csv" | "pdf") {
    if (!ok) return;
    setBusy(kind);
    try {
      const list = await fetchPayments(family.id, from, to);
      if (!list.length) { toast("No payments between those dates"); return; }
      if (kind === "csv") paymentsCsv(list, lookups, `Luex money ${from} to ${to}.csv`);
      else await summaryPdf(list, lookups, from, to, `Luex money ${from} to ${to}.pdf`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <h3 className="mb-1 text-sm font-bold">Save a copy</h3>
      <p className="mb-2 text-xs text-muted-foreground">Everything you can see, between two dates. Your data stays yours.</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11" data-testid="report-from" /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11" data-testid="report-to" /></Field>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="outline" className="h-11 flex-1 rounded-full" disabled={!ok || !!busy} onClick={() => void run("csv")} data-testid="report-export-csv"><FileSpreadsheet className="size-4" /> {busy === "csv" ? "Saving…" : "Spreadsheet (CSV)"}</Button>
        <Button variant="outline" className="h-11 flex-1 rounded-full" disabled={!ok || !!busy} onClick={() => void run("pdf")} data-testid="report-export-pdf"><FileDown className="size-4" /> {busy === "pdf" ? "Saving…" : "Summary (PDF)"}</Button>
      </div>
    </section>
  );
}
