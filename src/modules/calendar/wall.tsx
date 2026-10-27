// Kitchen screen: a big, always-on view of today and tomorrow for an old tablet on the wall.
import { NotebookPen, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useFamilyState } from "@/lib/family-context";

import { prefsOf, useChoreDone, useChores, useDayNotes } from "./data";
import { Countdowns } from "./day-panel";
import { byDay, useOccurrences, type Occ } from "./occurrences";
import { datesBetween } from "./recurrence";
import { addDays, longDate, pad, parts, todayKey } from "./time";
import { PeopleStack, TypeDot, occTime } from "./views";
import { useWeather, weatherLook } from "./weather";

type WakeLock = { release: () => Promise<void> };

export function WallScreen({ onClose }: { onClose: () => void }) {
  const { family, members } = useFamilyState();
  const tz = family.timezone;
  const prefs = prefsOf(family);
  const [now, setNow] = useState(() => new Date());
  const today = todayKey(tz);
  const tomorrow = addDays(today, 1);
  const { occs } = useOccurrences(today, tomorrow, []);
  const map = useMemo(() => byDay(occs, today, tomorrow), [occs, today, tomorrow]);
  const weather = useWeather(family.weather_lat, family.weather_lon, tz);
  const w = weather.data?.get(today);
  const notes = useDayNotes(today, today);
  const note = notes.data?.find((n) => n.day === today);
  const chores = useChores();
  const done = useChoreDone(today, today);

  // clock ticks every 15 seconds; data refreshes every minute (the calendar also updates live)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  // keep the screen on while this is open
  useEffect(() => {
    let lock: WakeLock | null = null;
    let gone = false;
    const nav = navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } };
    const get = async () => {
      try {
        if (nav.wakeLock && document.visibilityState === "visible" && !gone) lock = await nav.wakeLock.request("screen");
      } catch {
        /* not allowed: the screen may sleep */
      }
    };
    const onVis = () => { if (document.visibilityState === "visible") void get(); };
    void get();
    document.addEventListener("visibilitychange", onVis);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", onKey);
      void lock?.release().catch(() => {});
    };
  }, [onClose]);

  const choresLeft = useMemo(() => {
    let left = 0;
    for (const c of chores.data ?? []) {
      if (!c.active || !datesBetween(c.rrule, c.starts_on, today, today).length) continue;
      const need = c.mode === "each" ? Math.max(1, c.people.length) : 1;
      const got = (done.data ?? []).filter((d) => d.chore_id === c.id && d.due_on === today).length;
      left += Math.max(0, need - got);
    }
    return left;
  }, [chores.data, done.data, today]);

  const p = parts(now, tz);
  const look = w ? weatherLook(w.code) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col gap-4 overflow-hidden p-5 sm:p-8" style={{ background: "var(--backdrop-base)", color: "var(--foreground)" }} role="dialog" aria-label="Kitchen screen">
      <button type="button" onClick={onClose} className="absolute right-4 top-4 grid size-12 place-items-center rounded-full bg-[var(--surface)] shadow" aria-label="Close kitchen screen">
        <X className="size-6" />
      </button>

      <header className="flex shrink-0 flex-wrap items-end gap-x-8 gap-y-2 pr-14">
        <div>
          <div className="text-6xl font-extrabold tabular-nums leading-none sm:text-7xl">{pad(p.h)}:{pad(p.mi)}</div>
          <div className="mt-2 text-xl font-semibold sm:text-2xl">{longDate(today)}</div>
        </div>
        {look && w ? (
          <div className="flex items-center gap-3 text-xl font-semibold">
            <look.icon className="size-12" />
            <span>{look.label}<br /><span className="text-base font-medium text-muted-foreground">{w.min}° to {w.max}°{w.rain >= 30 ? `, ${w.rain}% rain` : ""}</span></span>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2"><Countdowns /></div>
      </header>

      {note || choresLeft ? (
        <div className="flex shrink-0 flex-wrap gap-3">
          {note ? (
            <div className="min-w-0 flex-1 rounded-3xl bg-[var(--status-amber-soft)] px-5 py-3 text-lg">
              <span className="mr-2 inline-flex items-center gap-2 font-bold"><NotebookPen className="size-5" /> Note:</span>
              <span className="line-clamp-2">{note.body}</span>
            </div>
          ) : null}
          {choresLeft ? (
            <div className="flex items-center gap-2 rounded-3xl bg-[var(--surface)] px-5 py-3 text-lg font-semibold">
              <Sparkles className="size-6" /> {choresLeft} {choresLeft === 1 ? "chore" : "chores"} left today
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[3fr_2fr]">
        <DayColumn title="Today" list={map.get(today) ?? []} dayK={today} prefs={prefs} tz={tz} members={members} big />
        <DayColumn title="Tomorrow" list={map.get(tomorrow) ?? []} dayK={tomorrow} prefs={prefs} tz={tz} members={members} />
      </div>
    </div>
  );
}

function DayColumn({ title, list, dayK, prefs, tz, members, big }: {
  title: string; list: Occ[]; dayK: string; prefs: ReturnType<typeof prefsOf>; tz: string; members: ReturnType<typeof useFamilyState>["members"]; big?: boolean;
}) {
  return (
    <section className="glass-panel flex min-h-0 flex-col p-4">
      <h2 className="mb-3 shrink-0 text-2xl font-bold">{title}</h2>
      <div className="scrollbar-none min-h-0 flex-1 space-y-2 overflow-y-auto">
        {list.length ? list.map((o) => (
          <div key={o.key} className="glass-tile flex items-center gap-4 px-4 py-3">
            <TypeDot occ={o} prefs={prefs} size="lg" />
            <div className="min-w-0 flex-1">
              <p className={big ? "truncate text-2xl font-bold" : "truncate text-xl font-bold"}>{o.event.title}</p>
              <p className="text-lg text-muted-foreground">{occTime(o, tz, dayK)}{o.event.location ? ` · ${o.event.location}` : ""}</p>
            </div>
            <PeopleStack ids={o.event.people} members={members} max={4} />
          </div>
        )) : <p className="text-xl text-muted-foreground">Nothing on.</p>}
      </div>
    </section>
  );
}
