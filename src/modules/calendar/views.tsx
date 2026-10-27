import { Gift, Lock, Repeat } from "lucide-react";
import { useMemo } from "react";

import { MemberAvatar } from "@/components/member-avatar";
import type { Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { cn } from "@/lib/utils";

import { prefsOf, type Term } from "./data";
import { byDay, type Occ } from "./occurrences";
import { addDays, addMonths, daysBetween, monthName, monthStart, shortDay, splitKey, timeOf, weekdayOf, weekStart } from "./time";
import { typeInfo, type CalendarPrefs } from "./types";
import { weatherLook, type DayWeather } from "./weather";

// ---------------------------------------------------------------- small parts

/** Icon in a coloured circle: the "dot" for an event. Colour and icon together, never colour alone. */
export function TypeDot({ occ, prefs, size = "md", className }: { occ: Occ; prefs: CalendarPrefs; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const info = typeInfo(occ.event.type, prefs);
  const Icon = occ.virtual?.kind === "christmas" ? Gift : info.icon;
  const s = { xs: "size-4 [&>svg]:size-2.5", sm: "size-5 [&>svg]:size-3", md: "size-7 [&>svg]:size-4", lg: "size-11 [&>svg]:size-6" }[size];
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full text-white", s, className)} style={{ background: info.colour }} title={info.label} aria-hidden>
      <Icon strokeWidth={2.4} />
    </span>
  );
}

export function PeopleStack({ ids, members, max = 3 }: { ids: string[]; members: Member[]; max?: number }) {
  const ms = ids.map((id) => members.find((m) => m.id === id)).filter(Boolean) as Member[];
  if (!ms.length) return null;
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {ms.slice(0, max).map((m) => (
        <MemberAvatar key={m.id} member={m} size="sm" className="size-6 text-[10px] ring-1 ring-offset-1" />
      ))}
      {ms.length > max ? <span className="grid size-6 place-items-center rounded-full bg-muted text-[10px] font-semibold">+{ms.length - max}</span> : null}
    </span>
  );
}

export function occTime(o: Occ, tz: string, dayK?: string): string {
  if (o.allDay) return o.startDay === o.endDay ? "All day" : dayK && dayK !== o.startDay ? "Continues" : "All day";
  if (dayK && o.startDay !== dayK) return `Until ${timeOf(o.end, tz)}`;
  if (o.end.getTime() === o.start.getTime()) return timeOf(o.start, tz);
  return `${timeOf(o.start, tz)}–${timeOf(o.end, tz)}`;
}

/** One event as a row: icon, time, title, people. Big enough to tap. */
export function EventRow({ occ, onOpen, dayK, big }: { occ: Occ; onOpen: (o: Occ) => void; dayK?: string; big?: boolean }) {
  const { family, members } = useFamilyState();
  const prefs = prefsOf(family);
  const done = occ.event.type === "reminder" && occ.event.done_at;
  return (
    <button
      type="button"
      onClick={() => onOpen(occ)}
      className={cn("glass-tile flex w-full items-center gap-3 text-left transition hover:brightness-[0.98]", big ? "min-h-16 px-4 py-3" : "min-h-12 px-3 py-2")}
    >
      <TypeDot occ={occ} prefs={prefs} size={big ? "lg" : "md"} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate font-semibold", big ? "text-base" : "text-sm", done && "line-through opacity-60")}>{occ.event.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {occTime(occ, family.timezone, dayK)}
          {occ.repeats && !occ.virtual ? <Repeat className="size-3" aria-label="Repeats" /> : null}
          {occ.event.visibility === "selected" ? <Lock className="size-3" aria-label="Private" /> : null}
          {occ.event.location ? <span className="truncate">· {occ.event.location}</span> : null}
        </span>
      </span>
      <PeopleStack ids={occ.event.people} members={members} />
    </button>
  );
}

function TermBand({ term }: { term: Term | undefined }) {
  if (!term) return null;
  const bg = term.kind === "term" ? "var(--ev-term)" : term.kind === "inset" ? "var(--ev-inset)" : "var(--ev-holiday)";
  return <span className="absolute inset-x-0 top-0 h-1.5 rounded-t-[10px]" style={{ background: bg }} title={term.name} />;
}

export function termFor(terms: Term[], k: string): Term | undefined {
  // holidays and inset days win over term time
  const hits = terms.filter((t) => t.starts_on <= k && t.ends_on >= k);
  return hits.find((t) => t.kind !== "term") ?? hits[0];
}

function WeatherMini({ w }: { w: DayWeather | undefined }) {
  if (!w) return null;
  const { icon: Icon, label } = weatherLook(w.code);
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground" title={`${label}, ${w.min}° to ${w.max}°`}>
      <Icon className="size-3.5" />
      {w.max}°
    </span>
  );
}

// ---------------------------------------------------------------- month (zoomed out: icon dots)

export function MonthView({
  monthK, occs, terms, todayK, selected, onSelect, weather, weekStartsOn,
}: {
  monthK: string; occs: Occ[]; terms: Term[]; todayK: string; selected: string; onSelect: (k: string) => void;
  weather?: Map<string, DayWeather>; weekStartsOn: 1 | 7;
}) {
  const { family } = useFamilyState();
  const prefs = prefsOf(family);
  const first = weekStart(monthK, weekStartsOn);
  const [, mm] = splitKey(monthK);
  const lastDay = addDays(addMonths(monthStart(monthK), 1), -1);
  const weeks = Math.ceil((daysBetween(first, lastDay) + 1) / 7);
  const days = useMemo(() => Array.from({ length: weeks * 7 }, (_, i) => addDays(first, i)), [first, weeks]);
  const map = useMemo(() => byDay(occs, days[0], days[days.length - 1]), [occs, days]);
  const heads = Array.from({ length: 7 }, (_, i) => weekdayOf(addDays(first, i)));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {heads.map((w) => <div key={w}>{shortDay(w)}</div>)}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 gap-1" style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}>
        {days.map((k) => {
          const list = map.get(k) ?? [];
          const inMonth = splitKey(k)[1] === mm;
          const isToday = k === todayK;
          const isSel = k === selected;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onSelect(k)}
              aria-label={`${k}: ${list.length} things`}
              aria-pressed={isSel}
              className={cn(
                "relative flex min-h-0 flex-col items-stretch overflow-hidden rounded-[10px] border p-1 text-left transition",
                inMonth ? "bg-[var(--surface)]" : "bg-transparent opacity-55",
                isSel ? "border-[var(--foreground)]" : "border-[var(--surface-border)]",
              )}
            >
              <TermBand term={termFor(terms, k)} />
              <span className="flex items-center justify-between gap-1 pt-0.5">
                <span className={cn("grid size-6 place-items-center rounded-full text-xs font-bold", isToday && "bg-[var(--tile-active)] text-[var(--tile-active-fg)]")}>
                  {splitKey(k)[2]}
                </span>
                <span className="hidden sm:inline"><WeatherMini w={weather?.get(k)} /></span>
              </span>
              <span className="mt-0.5 flex min-h-0 flex-1 flex-wrap content-start gap-0.5 overflow-hidden">
                {list.slice(0, 8).map((o) => <TypeDot key={o.key} occ={o} prefs={prefs} size="sm" className="max-sm:size-4 max-sm:[&>svg]:size-2.5" />)}
                {list.length > 8 ? <span className="text-[10px] font-semibold text-muted-foreground">+{list.length - 8}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function monthTitle(k: string) {
  const [y, m] = splitKey(k);
  return `${monthName(m)} ${y}`;
}

// ---------------------------------------------------------------- week

export function WeekView({
  startK, occs, terms, todayK, onSelectDay, onOpen, weather,
}: {
  startK: string; occs: Occ[]; terms: Term[]; todayK: string; onSelectDay: (k: string) => void; onOpen: (o: Occ) => void;
  weather?: Map<string, DayWeather>;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startK, i)), [startK]);
  const map = useMemo(() => byDay(occs, days[0], days[6]), [occs, days]);
  return (
    <div className="scrollbar-thin grid h-full min-h-0 gap-2 overflow-y-auto md:grid-cols-7 md:overflow-hidden">
      {days.map((k) => {
        const list = map.get(k) ?? [];
        const term = termFor(terms, k);
        return (
          <section key={k} className="flex min-h-0 flex-col rounded-2xl bg-[var(--surface)]/40 p-1.5 md:overflow-hidden">
            <button type="button" onClick={() => onSelectDay(k)} className="relative mb-1.5 flex items-center justify-between rounded-xl px-2 py-1.5 text-left hover:bg-[var(--surface)]">
              <span>
                <span className="text-[11px] font-semibold uppercase text-muted-foreground">{shortDay(weekdayOf(k))}</span>{" "}
                <span className={cn("rounded-full px-1.5 text-sm font-bold", k === todayK && "bg-[var(--tile-active)] text-[var(--tile-active-fg)]")}>{splitKey(k)[2]}</span>
              </span>
              <WeatherMini w={weather?.get(k)} />
              {term ? <span className="absolute inset-x-2 bottom-0 h-1 rounded-full" style={{ background: term.kind === "term" ? "var(--ev-term)" : term.kind === "inset" ? "var(--ev-inset)" : "var(--ev-holiday)" }} title={term.name} /> : null}
            </button>
            <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-1.5 md:overflow-y-auto">
              {list.length ? list.map((o) => <EventRow key={o.key + k} occ={o} onOpen={onOpen} dayK={k} />) : <p className="px-2 pb-2 text-xs text-muted-foreground">Nothing on</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- day

export function DayList({ dayK, occs, onOpen, big }: { dayK: string; occs: Occ[]; onOpen: (o: Occ) => void; big?: boolean }) {
  const list = useMemo(() => byDay(occs, dayK, dayK).get(dayK) ?? [], [occs, dayK]);
  if (!list.length) return <p className="py-6 text-center text-sm text-muted-foreground">Nothing on this day.</p>;
  return (
    <div className="flex flex-col gap-2">
      {list.map((o) => <EventRow key={o.key} occ={o} onOpen={onOpen} dayK={dayK} big={big} />)}
    </div>
  );
}

// ---------------------------------------------------------------- list (what's coming up)

export function AgendaView({ fromK, toK, occs, todayK, onOpen }: { fromK: string; toK: string; occs: Occ[]; todayK: string; onOpen: (o: Occ) => void }) {
  const map = useMemo(() => byDay(occs, fromK, toK), [occs, fromK, toK]);
  const days = [...map.entries()].filter(([, l]) => l.length);
  if (!days.length) return <p className="py-10 text-center text-sm text-muted-foreground">Nothing coming up.</p>;
  return (
    <div className="scrollbar-thin h-full min-h-0 space-y-4 overflow-y-auto pr-1">
      {days.map(([k, list]) => (
        <section key={k}>
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {k === todayK ? "Today" : k === addDays(todayK, 1) ? "Tomorrow" : `${shortDay(weekdayOf(k))} ${splitKey(k)[2]} ${monthName(splitKey(k)[1]).slice(0, 3)}`}
          </h3>
          <div className="flex flex-col gap-1.5">
            {list.map((o) => <EventRow key={o.key + k} occ={o} onOpen={onOpen} dayK={k} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
