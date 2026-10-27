import { describe, expect, it } from "vitest";

import { countBefore, datesBetween, describeRule, expand, ruleToSpec, specToRule, untilBefore, type EventLike } from "./recurrence";
import { addDays, dayKey, fromWall, timeOf, weekStart } from "./time";

const TZ = "Europe/London";
const ev = (o: Partial<EventLike> & { id: string; starts_at: string; ends_at: string }): EventLike => ({
  all_day: false, rrule: null, exdates: [], recurrence_of: null, recurrence_date: null, ...o,
});

describe("time", () => {
  it("handles the October clock change", () => {
    const before = fromWall(2026, 10, 24, 17, 0, TZ);
    const after = fromWall(2026, 10, 26, 17, 0, TZ);
    expect(timeOf(before, TZ)).toBe("17:00");
    expect(timeOf(after, TZ)).toBe("17:00");
    expect(after.getTime() - before.getTime()).toBe(49 * 3600 * 1000);
  });
  it("finds the week start (Monday)", () => {
    expect(weekStart("2026-10-27")).toBe("2026-10-26");
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("expand", () => {
  const start = fromWall(2026, 10, 19, 17, 0, TZ); // Monday 17:00 BST
  const end = fromWall(2026, 10, 19, 18, 0, TZ);
  const weekly = ev({ id: "s", starts_at: start.toISOString(), ends_at: end.toISOString(), rrule: "FREQ=WEEKLY;BYDAY=MO" });

  it("keeps the wall-clock time across the clock change", () => {
    const occ = expand([weekly], fromWall(2026, 10, 19, 0, 0, TZ), fromWall(2026, 11, 3, 0, 0, TZ), TZ);
    expect(occ.map((o) => o.startDay)).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
    expect(occ.every((o) => timeOf(o.start, TZ) === "17:00")).toBe(true);
  });

  it("skips removed dates and uses changed ones", () => {
    const ex = { ...weekly, exdates: [fromWall(2026, 10, 26, 17, 0, TZ).toISOString()] };
    const moved = ev({
      id: "o", recurrence_of: "s", recurrence_date: fromWall(2026, 11, 2, 17, 0, TZ).toISOString(),
      starts_at: fromWall(2026, 11, 2, 18, 30, TZ).toISOString(), ends_at: fromWall(2026, 11, 2, 19, 30, TZ).toISOString(),
    });
    const occ = expand([ex, moved], fromWall(2026, 10, 19, 0, 0, TZ), fromWall(2026, 11, 3, 0, 0, TZ), TZ);
    expect(occ.map((o) => o.startDay)).toEqual(["2026-10-19", "2026-11-02"]);
    expect(timeOf(occ[1].start, TZ)).toBe("18:30");
    expect(occ[1].event.id).toBe("o");
  });

  it("spreads all-day events over every day they cover", () => {
    const trip = ev({ id: "t", all_day: true, starts_at: fromWall(2026, 10, 30, 0, 0, TZ).toISOString(), ends_at: fromWall(2026, 11, 2, 0, 0, TZ).toISOString() });
    const [o] = expand([trip], fromWall(2026, 11, 1, 0, 0, TZ), fromWall(2026, 11, 2, 0, 0, TZ), TZ);
    expect(o.startDay).toBe("2026-10-30");
    expect(o.endDay).toBe("2026-11-02");
  });

  it("repeats yearly birthdays-style events", () => {
    const b = ev({ id: "b", all_day: true, rrule: "FREQ=YEARLY", starts_at: fromWall(2020, 3, 4, 0, 0, TZ).toISOString(), ends_at: fromWall(2020, 3, 4, 0, 0, TZ).toISOString() });
    const occ = expand([b], fromWall(2027, 1, 1, 0, 0, TZ), fromWall(2028, 1, 1, 0, 0, TZ), TZ);
    expect(occ.map((o) => o.startDay)).toEqual(["2027-03-04"]);
  });

  it("ends a series before a cut date", () => {
    const r = untilBefore("FREQ=WEEKLY;BYDAY=MO;COUNT=10", fromWall(2026, 11, 2, 17, 0, TZ), TZ);
    expect(r).toBe("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261101T235959Z");
    const occ = expand([{ ...weekly, rrule: r }], fromWall(2026, 10, 1, 0, 0, TZ), fromWall(2027, 1, 1, 0, 0, TZ), TZ);
    expect(occ.map((o) => dayKey(o.start, TZ))).toEqual(["2026-10-19", "2026-10-26"]);
  });
});

describe("repeat picker", () => {
  it("round-trips the presets", () => {
    for (const p of ["daily", "weekdays", "weekly", "fortnightly", "monthly", "monthly-weekday", "quarterly", "yearly"] as const) {
      const spec = { ...ruleToSpec(null, "2026-10-27"), preset: p };
      const rule = specToRule(spec, "2026-10-27")!;
      expect(ruleToSpec(rule, "2026-10-27").preset).toBe(p);
    }
  });
  it("describes rules in plain English", () => {
    expect(describeRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE", "2026-10-26")).toBe("Every other week on Mon and Wed");
    expect(describeRule("FREQ=MONTHLY;INTERVAL=3", "2026-10-27")).toBe("Every 3 months on the 27th");
    expect(describeRule("FREQ=MONTHLY;BYDAY=-1TU", "2026-10-27")).toBe("Every month on the last Tue");
    expect(describeRule(null, "2026-10-27")).toBe("Does not repeat");
  });
});

describe("chores", () => {
  it("lists due dates and counts turns for a rota", () => {
    expect(datesBetween("FREQ=WEEKLY;BYDAY=SA", "2026-10-01", "2026-10-26", "2026-11-08")).toEqual(["2026-10-31", "2026-11-07"]);
    expect(countBefore("FREQ=WEEKLY;BYDAY=SA", "2026-10-01", "2026-10-31")).toBe(4);
    expect(countBefore("FREQ=DAILY", "2026-10-27", "2026-10-27")).toBe(0);
  });
});
