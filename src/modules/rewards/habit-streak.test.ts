import { describe, expect, it } from "vitest";

import { bestRun, currentRun, dayState, metThisWeek, mondayKey, weekDays } from "./habit-streak";

const daily = { per: "day", target: 1 };
const water = { per: "day", target: 8 };
const gym = { per: "week", target: 3 };
const tick = (day: string, count = 1, skipped = false) => ({ day, count, skipped });

describe("habit streaks", () => {
  it("knows how a day went", () => {
    expect(dayState(water, tick("2026-10-27", 5))).toBe("part");
    expect(dayState(water, tick("2026-10-27", 8))).toBe("met");
    expect(dayState(water, tick("2026-10-27", 0, true))).toBe("skipped");
    expect(dayState(water, undefined)).toBe("none");
  });

  it("doesn't count today against you until it's over", () => {
    const logs = [tick("2026-10-25"), tick("2026-10-26")];
    expect(currentRun(daily, logs, "2026-10-27")).toBe(2);
    expect(currentRun(daily, [...logs, tick("2026-10-27")], "2026-10-27")).toBe(3);
  });

  it("passes over skipped days without breaking or adding", () => {
    const logs = [tick("2026-10-23"), tick("2026-10-24", 0, true), tick("2026-10-25", 0, true), tick("2026-10-26")];
    expect(currentRun(daily, logs, "2026-10-27")).toBe(2);
  });

  it("a missed day ends the run", () => {
    const logs = [tick("2026-10-22"), tick("2026-10-23"), tick("2026-10-25"), tick("2026-10-26")];
    expect(currentRun(daily, logs, "2026-10-27")).toBe(2);
    expect(bestRun(daily, logs, "2026-10-27")).toBe(2);
  });

  it("remembers the best run", () => {
    const logs = ["01", "02", "03", "04", "06"].map((d) => tick(`2026-10-${d}`));
    expect(bestRun(daily, logs, "2026-10-27")).toBe(4);
  });

  it("counts weekly habits in weeks", () => {
    // Mon 19 Oct week: 3 days; Mon 26 Oct week: 1 day so far (not yet reached)
    const logs = [tick("2026-10-12"), tick("2026-10-14"), tick("2026-10-16"), tick("2026-10-19"), tick("2026-10-20"), tick("2026-10-22"), tick("2026-10-26")];
    expect(metThisWeek(gym, logs, "2026-10-27")).toBe(1);
    expect(currentRun(gym, logs, "2026-10-27")).toBe(2);
    expect(bestRun(gym, logs, "2026-10-27")).toBe(2);
  });

  it("lays out this week Monday first", () => {
    expect(mondayKey("2026-11-01")).toBe("2026-10-26");
    const w = weekDays(daily, [tick("2026-10-26")], "2026-10-27");
    expect(w.map((d) => d.state)).toEqual(["met", "none", "none", "none", "none", "none", "none"]);
    expect(w[2].future).toBe(true);
  });
});
