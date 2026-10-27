// History: every star and every penny for one person, day by day, with what they had after each one. Export to CSV or PDF.
import { FileDown, FileText, History, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { cn } from "@/lib/utils";
import { Empty } from "@/modules/calendar/ui";

import {
  addDaysKey, money, MONEY_KIND_LABEL, POT_LABEL, shortDate, STAR_KIND_LABEL, todayIn, useBalances, usePocketEntries, useStarHistory, type Pot,
} from "./data";
import { historyCsv, historyPdf, type HistoryLine } from "./history-export";
import type { TabProps } from "./rewards-page";

export function HistoryTab({ target }: TabProps) {
  const { family, me, members, isParent } = useFamilyState();
  const today = todayIn(family.timezone);
  const people = members.filter((m) => !m.archived_at && (m.id === me.id || (isParent && m.role === "child")));
  const [who, setWho] = useState(target.memberId && people.some((p) => p.id === target.memberId) ? target.memberId : me.id);
  const [from, setFrom] = useState(addDaysKey(today, -90));
  const [to, setTo] = useState(today);
  const person = people.find((p) => p.id === who) ?? me;

  const balances = useBalances();
  const stars = useStarHistory(who, 2000);
  const pocket = usePocketEntries(who, from);

  // newest first, with the balance after each line worked back from today's balance
  const lines = useMemo<HistoryLine[]>(() => {
    const b = balances.data?.get(who);
    const all: HistoryLine[] = [];
    for (const s of stars.data ?? []) {
      const day = s.created_at.slice(0, 10);
      all.push({ day, at: s.created_at, what: STAR_KIND_LABEL[s.kind] ?? s.kind, note: s.note, stars: s.delta, money: 0, status: "ok", pot: null, starsAfter: 0, moneyAfter: 0 });
    }
    for (const p of pocket.data ?? []) {
      all.push({ day: p.on_date, at: p.created_at, what: MONEY_KIND_LABEL[p.kind] ?? p.kind, note: p.note, stars: 0, money: Number(p.amount), status: p.status, pot: p.pot as Pot, starsAfter: 0, moneyAfter: 0 });
    }
    all.sort((a, c) => (c.day + c.at).localeCompare(a.day + a.at));
    let st = b?.stars ?? 0;
    let mo = b ? b.spend + b.save + b.give : 0;
    for (const l of all) {
      l.starsAfter = st;
      l.moneyAfter = mo;
      st -= l.stars;
      if (l.status === "ok") mo -= l.money;
    }
    return all.filter((l) => l.day >= from && l.day <= to);
  }, [stars.data, pocket.data, balances.data, who, from, to]);

  const days = useMemo(() => {
    const m = new Map<string, HistoryLine[]>();
    for (const l of lines) m.set(l.day, [...(m.get(l.day) ?? []), l]);
    return [...m.entries()];
  }, [lines]);

  const earned = lines.filter((l) => l.stars > 0).reduce((n, l) => n + l.stars, 0);
  const spentStars = -lines.filter((l) => l.stars < 0).reduce((n, l) => n + l.stars, 0);
  const moneyIn = lines.filter((l) => l.status === "ok" && l.money > 0).reduce((n, l) => n + l.money, 0);
  const moneyOut = -lines.filter((l) => l.status === "ok" && l.money < 0).reduce((n, l) => n + l.money, 0);
  const loading = stars.isLoading || pocket.isLoading;
  const fileBase = `${person.display_name.replace(/[^\w]+/g, "-")}-rewards-${from}-to-${to}`;

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" data-testid="history-person">
          {people.map((p) => (
            <button key={p.id} type="button" aria-pressed={p.id === who} onClick={() => setWho(p.id)}
              className={cn("flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-medium",
                p.id === who ? "border-transparent bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "border-[var(--surface-border)] bg-[var(--surface)]")}>
              <MemberAvatar member={p} size="sm" className="ring-0 ring-offset-0" />
              {p.id === me.id ? "Me" : p.display_name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" aria-label="From" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-10 w-auto" />
          <span className="text-sm text-muted-foreground">to</span>
          <Input type="date" aria-label="To" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-10 w-auto" />
          <div className="ml-auto flex gap-1.5">
            <Button data-testid="history-csv" variant="outline" className="h-10 rounded-full" disabled={!lines.length}
              onClick={() => historyCsv(lines, `${fileBase}.csv`)}><FileDown className="size-4" /> CSV</Button>
            <Button data-testid="history-pdf" variant="outline" className="h-10 rounded-full" disabled={!lines.length}
              onClick={() => void historyPdf(lines, person.display_name, from, to, `${fileBase}.pdf`).catch(() => toast.error("The PDF couldn't be made. Try again"))}><FileText className="size-4" /> PDF</Button>
          </div>
        </div>

        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : !days.length ? (
          <Empty icon={History} title="Nothing in these dates">Stars and money show here as they come and go.</Empty>
        ) : (
          <div className="space-y-3">
            {days.map(([day, list]) => (
              <section key={day}>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{day === today ? "Today" : shortDate(day)}</h3>
                <ul className="space-y-1.5">
                  {list.map((l, i) => (
                    <li key={i} className={cn("glass-tile flex items-center gap-3 px-3 py-2", l.status !== "ok" && "opacity-60")} data-testid="history-row">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{l.what}{l.pot && l.pot !== "spend" ? ` · ${POT_LABEL[l.pot]}` : ""}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {l.note || " "}{l.status === "waiting" ? " · waiting for a parent" : l.status === "declined" ? " · not added" : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {l.stars ? <span className={cn("block font-bold tabular-nums", l.stars > 0 ? "text-[var(--status-green)]" : "")}>{l.stars > 0 ? "+" : "−"}{Math.abs(l.stars)} ★</span> : null}
                        {l.money ? <span className={cn("block font-bold tabular-nums", l.money > 0 ? "text-[var(--status-green)]" : "")}>{l.money > 0 ? "+" : "−"}{money(Math.abs(l.money))}</span> : null}
                        <span className="block text-[11px] text-muted-foreground">then {l.stars ? `${l.starsAfter} ★` : money(l.moneyAfter)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </RecordsWindow>
      <DetailWindow>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Star className="size-4" /> In these dates</h3>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between"><dt>Stars earned</dt><dd className="font-bold tabular-nums">{earned}</dd></div>
          <div className="flex justify-between"><dt>Stars spent</dt><dd className="font-bold tabular-nums">{spentStars}</dd></div>
          <div className="flex justify-between"><dt>Money in</dt><dd className="font-bold tabular-nums">{money(moneyIn)}</dd></div>
          <div className="flex justify-between"><dt>Money out</dt><dd className="font-bold tabular-nums">{money(moneyOut)}</dd></div>
        </dl>
        <p className="mt-3 text-xs opacity-75">"Then" shows what {person.id === me.id ? "you" : person.display_name} had after each one. Things waiting for a parent don't count until they're OK'd.</p>
      </DetailWindow>
    </Windows>
  );
}
