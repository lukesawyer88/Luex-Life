// A small Home screen card: for each child today, what to bring and who's picking up. Nothing when School isn't set up.
import { Link } from "@tanstack/react-router";
import { Backpack } from "lucide-react";

import { useFamilyState } from "@/lib/family-context";

import { eventOnDay, hhmm, runFor, todayIn, useRunChanges, useSchoolSetup, weekdayOf } from "./data";

export function SchoolTodayCard() {
  const { family, members, role, me } = useFamilyState();
  const setup = useSchoolSetup().data;
  const today = todayIn(family.timezone);
  const changes = useRunChanges(today, today).data ?? [];
  if (!setup || (!setup.children.length && !setup.days.length && !setup.activities.length)) return null;

  const wd = weekdayOf(today);
  const children = members.filter((m) => m.role === "child" && !m.archived_at && (role !== "child" || m.id === me.id));
  const lines = children.map((c) => {
    const day = setup.days.find((d) => d.member_id === c.id && d.weekday === wd);
    const clubs = setup.activities.filter((a) => a.member_id === c.id).flatMap((a) => {
      const e = setup.events.find((x) => x.id === a.event_id);
      return e && eventOnDay(e, today, family.timezone) ? [e.title, ...a.kit] : [];
    });
    const bring = [...(day?.bring ?? []), ...(day?.lunch === "packed" ? ["packed lunch"] : []), ...clubs];
    const run = runFor(setup, changes, c.id, today);
    const picker = run?.pick_by ? members.find((m) => m.id === run.pick_by) : null;
    const parts = [bring.join(", "), picker ? `${picker.display_name} picks up${run?.pick_time ? ` at ${hhmm(run.pick_time)}` : ""}` : ""].filter(Boolean);
    return parts.length ? { id: c.id, name: c.display_name, text: parts.join(" · ") } : null;
  }).filter((x): x is { id: string; name: string; text: string } => !!x);
  if (!lines.length) return null;

  return (
    <Link to="/m/$key" params={{ key: "school" }} data-testid="home-school" className="glass-tile block p-4 hover:bg-muted/40">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Backpack className="size-4" /> Today at school</h3>
      <ul className="space-y-1 text-sm">
        {lines.map((l) => (
          <li key={l.id}>{role === "child" ? null : <span className="font-semibold">{l.name}: </span>}{l.text}</li>
        ))}
      </ul>
    </Link>
  );
}
