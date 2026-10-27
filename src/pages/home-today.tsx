// Home's "Today": what's on today from the Calendar (with who it's for) and today's chores, at a glance.
// Tapping anything opens it in the Calendar.
import { Link } from "@tanstack/react-router";
import { CalendarDays, Check, Plus } from "lucide-react";

import { MemberAvatar } from "@/components/member-avatar";
import { useFamilyState } from "@/lib/family-context";
import { cn } from "@/lib/utils";
import { choreAssignees, choreIcon } from "@/modules/calendar/chore-helpers";
import { useChoreDone, useChores } from "@/modules/calendar/data";
import { useOccurrences, type Occ } from "@/modules/calendar/occurrences";
import { datesBetween } from "@/modules/calendar/recurrence";
import { timeOf, todayKey } from "@/modules/calendar/time";
import { typeInfo } from "@/modules/calendar/types";

function when(o: Occ, today: string, tz: string): string {
  if (o.allDay || o.startDay < today) return o.endDay > today ? "All day, until later" : "All day";
  // reminders and other moments have no end time
  return o.end.getTime() <= o.start.getTime() ? timeOf(o.start, tz) : `${timeOf(o.start, tz)}–${timeOf(o.end, tz)}`;
}

export function TodayOnHome() {
  const { family, members, me, role } = useFamilyState();
  const tz = family.timezone;
  const today = todayKey(tz);
  const { occs, isLoading } = useOccurrences(today, today, []);
  const chores = useChores().data ?? [];
  const done = useChoreDone(today, today).data ?? [];
  const child = role === "child";

  // today's chores: who's on each, and whether it's done (a child sees only their own)
  const jobs = chores
    .filter((c) => c.active && today >= c.starts_on && datesBetween(c.rrule, c.starts_on, today, today).length > 0)
    .flatMap((c) => {
      const who = choreAssignees(c, today);
      const people = who === null ? [null] : who;
      return people.map((p) => ({ chore: c, member: p, done: done.some((d) => d.chore_id === c.id && (p === null || d.for_member === p)) }));
    })
    .filter((j) => !child || j.member === me.id || j.member === null);
  const left = jobs.filter((j) => !j.done).length;
  const person = (id: string | null) => (id ? members.find((m) => m.id === id) : undefined);

  return (
    <section className="mb-5" data-testid="home-today">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex flex-1 items-center gap-2 text-base font-bold"><CalendarDays className="size-5" /> Today</h3>
        <Link to="/m/$key" params={{ key: "calendar" }} className="flex min-h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold hover:bg-muted"><Plus className="size-4" /> Add</Link>
      </div>
      {isLoading ? null : occs.length ? (
        <ul className="space-y-1.5">
          {occs.map((o) => {
            const info = typeInfo(o.event.type, null);
            const Icon = info.icon;
            const people = o.event.people.map((id) => person(id)).filter(Boolean);
            const over = !o.allDay && o.end.getTime() < Date.now();
            return (
              <li key={o.key}>
                <Link to="/m/$key" params={{ key: "calendar" }} search={(o.virtual ? {} : { event: o.seriesId }) as never} data-testid="today-event"
                  className={cn("glass-tile flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-muted/40", over && "opacity-60")}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-full text-white" style={{ background: info.colour }}><Icon className="size-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{o.event.title}</span>
                    <span className="block truncate text-sm text-muted-foreground">{when(o, today, tz)}{o.event.location ? ` · ${o.event.location}` : ""}</span>
                  </span>
                  {people.length ? (
                    <span className="flex shrink-0 -space-x-2">
                      {people.slice(0, 4).map((m) => <MemberAvatar key={m!.id} member={m!} size="sm" className="size-7 ring-2 ring-[var(--surface)] ring-offset-0" />)}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <p className="glass-tile p-3 text-base text-muted-foreground">Nothing on the Calendar today.</p>}

      {jobs.length ? (
        <Link to="/m/$key" params={{ key: "calendar" }} search={{ tab: "chores" } as never} data-testid="today-chores" className="glass-tile mt-2 block p-3 hover:bg-muted/40">
          <span className="mb-1.5 block text-sm font-semibold">{left ? `${left} ${left === 1 ? "chore" : "chores"} still to do` : "All of today's chores are done"}</span>
          <span className="flex flex-wrap gap-1.5">
            {jobs.map((j, i) => {
              const Icon = choreIcon(j.chore.icon);
              const m = person(j.member);
              return (
                <span key={`${j.chore.id}-${j.member ?? "any"}-${i}`} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-sm", j.done ? "bg-[var(--status-green-soft)] text-muted-foreground line-through" : "bg-[var(--surface)]")}>
                  {j.done ? <Check className="size-4 text-[var(--status-green)]" /> : <Icon className="size-4" />}
                  {j.chore.title}
                  {!child && m ? <MemberAvatar member={m} size="sm" className="size-5 ring-0 ring-offset-0" /> : null}
                </span>
              );
            })}
          </span>
        </Link>
      ) : null}
    </section>
  );
}
