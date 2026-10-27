// Gentle streaks for habits. A skipped day (ill, away) neither breaks a run nor adds to it, and today never counts
// against you until it's over. Pure functions (no dates from the clock) so they can be tested.

export type StreakHabit = { per: string; target: number };
export type StreakLog = { day: string; count: number; skipped: boolean };
export type DayState = "met" | "skipped" | "part" | "none";

function addDays(k: string, n: number): string {
  const d = new Date(k + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function mondayKey(k: string): string {
  const d = new Date(k + "T12:00:00Z");
  return addDays(k, -((d.getUTCDay() + 6) % 7));
}

/** How a single day went. For weekly habits any tick on a day counts that day. */
export function dayState(h: StreakHabit, log: StreakLog | undefined): DayState {
  if (!log) return "none";
  if (log.skipped) return "skipped";
  const need = h.per === "week" ? 1 : h.target;
  if (log.count >= need) return "met";
  return log.count > 0 ? "part" : "none";
}

function byDay(logs: StreakLog[]): Map<string, StreakLog> {
  return new Map(logs.map((l) => [l.day, l]));
}

/** The 7 days (Monday first) of the week containing today, with how each went */
export function weekDays(h: StreakHabit, logs: StreakLog[], today: string): { day: string; state: DayState; future: boolean }[] {
  const m = byDay(logs);
  const mon = mondayKey(today);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(mon, i);
    return { day, state: dayState(h, m.get(day)), future: day > today };
  });
}

/** Days ticked (met) this week */
export function metThisWeek(h: StreakHabit, logs: StreakLog[], today: string): number {
  return weekDays(h, logs, today).filter((d) => d.state === "met").length;
}

type WeekState = "met" | "skipped" | "missed";
function weekState(h: StreakHabit, m: Map<string, StreakLog>, mon: string): WeekState {
  let met = 0;
  let skipped = 0;
  for (let i = 0; i < 7; i++) {
    const s = dayState(h, m.get(addDays(mon, i)));
    if (s === "met") met++;
    else if (s === "skipped") skipped++;
  }
  if (met >= h.target) return "met";
  if (skipped > 0 && met + skipped >= h.target) return "skipped";
  return "missed";
}

const LIMIT = 800;

/** Current run: days (daily habits) or weeks (weekly habits) in a row, skipped ones passed over */
export function currentRun(h: StreakHabit, logs: StreakLog[], today: string): number {
  const m = byDay(logs);
  let run = 0;
  if (h.per === "week") {
    let mon = mondayKey(today);
    // this week only counts once it's reached; until then start from last week
    if (weekState(h, m, mon) !== "met") mon = addDays(mon, -7);
    for (let i = 0; i < LIMIT / 7; i++, mon = addDays(mon, -7)) {
      const s = weekState(h, m, mon);
      if (s === "met") run++;
      else if (s === "missed") break;
    }
    return run;
  }
  let day = today;
  if (dayState(h, m.get(today)) !== "met") day = addDays(today, -1);
  for (let i = 0; i < LIMIT; i++, day = addDays(day, -1)) {
    const s = dayState(h, m.get(day));
    if (s === "met") run++;
    else if (s !== "skipped") break;
  }
  return run;
}

/** Best run ever (same rules), from the first tick up to today */
export function bestRun(h: StreakHabit, logs: StreakLog[], today: string): number {
  if (!logs.length) return 0;
  const m = byDay(logs);
  const first = logs.reduce((a, l) => (l.day < a ? l.day : a), logs[0].day);
  let best = 0;
  let run = 0;
  if (h.per === "week") {
    const thisMon = mondayKey(today);
    for (let mon = mondayKey(first); mon <= thisMon; mon = addDays(mon, 7)) {
      const s = weekState(h, m, mon);
      if (s === "met") { run++; best = Math.max(best, run); }
      else if (s === "missed" && mon !== thisMon) run = 0;
    }
    return best;
  }
  for (let day = first; day <= today; day = addDays(day, 1)) {
    const s = dayState(h, m.get(day));
    if (s === "met") { run++; best = Math.max(best, run); }
    else if (s !== "skipped" && day !== today) run = 0;
  }
  return best;
}
