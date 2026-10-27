// Today (and tomorrow): one card per child – what to bring, clubs, who's taking and picking up, what's due.
import { Backpack, Car, ClipboardList, School, Sparkles, Sun, Utensils } from "lucide-react";
import { useMemo, useState } from "react";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { useFamilyState } from "@/lib/family-context";
import { Chip, Empty } from "@/modules/calendar/ui";

import { addDaysKey, runFor, shortDate, todayIn, useRunChanges, useSchoolSetup, useTasks, TASK_KIND_LABEL } from "./data";
import type { TabProps } from "./school-page";
import { SchoolSettingsDialog } from "./settings";
import { dayPlan, LUNCH_LABEL, nameOf, runText } from "./today-parts";

export function TodayTab({ onGo }: TabProps) {
  const { family, members, me, role, isParent } = useFamilyState();
  const tz = family.timezone || "Europe/London";
  const today = todayIn(tz);
  const [tomorrow, setTomorrow] = useState(false);
  const [settings, setSettings] = useState(false);
  const day = tomorrow ? addDaysKey(today, 1) : today;
  const setup = useSchoolSetup().data;
  const changes = useRunChanges(today, addDaysKey(today, 7)).data ?? [];
  const tasks = useTasks(addDaysKey(today, -14)).data ?? [];

  const children = useMemo(
    () => members.filter((m) => m.role === "child" && !m.archived_at && (role !== "child" || m.id === me.id)),
    [members, role, me.id],
  );
  if (!setup) return null;
  const nothingSetUp = !setup.children.length && !setup.days.length && !setup.runs.length && !setup.activities.length;

  // a grown-up who isn't a parent: their own school runs first
  const myRuns = role === "member"
    ? children.flatMap((c) => {
        const r = runFor(setup, changes, c.id, day);
        const out: string[] = [];
        if (r?.drop_by === me.id) out.push(`take ${c.display_name}`);
        if (r?.pick_by === me.id) out.push(`pick up ${c.display_name}${r.pick_time ? ` at ${r.pick_time.slice(0, 5)}` : ""}`);
        return out;
      })
    : [];

  const upcoming = tasks
    .filter((t) => !t.done_at && t.due_on && t.due_on >= today && t.due_on <= addDaysKey(today, 7))
    .filter((t) => role !== "child" || t.member_id === me.id || t.member_id === null);

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">{tomorrow ? "Tomorrow" : "Today"} <span className="text-sm font-normal text-muted-foreground">{shortDate(day)}</span></h2>
          <div className="flex gap-1">
            <Chip on={!tomorrow} onClick={() => setTomorrow(false)}>Today</Chip>
            <Chip on={tomorrow} onClick={() => setTomorrow(true)}><span data-testid="today-tomorrow">Tomorrow</span></Chip>
          </div>
        </div>

        {!children.length ? (
          <Empty icon={School} title="No children in the household">School and clubs appear here once a child is added in Family.</Empty>
        ) : nothingSetUp ? (
          <Empty icon={School} title="School isn't set up yet">
            <p>Add each child's school, what they bring each day and who picks them up. It takes a couple of minutes.</p>
            {isParent ? <Button data-testid="school-setup" className="mt-4 h-12 rounded-full px-6 text-base font-semibold" onClick={() => setSettings(true)}>Set up school</Button> : null}
          </Empty>
        ) : (
          <>
            {role === "member" ? (
              <div className="rounded-2xl bg-[var(--status-blue-soft)] p-3 text-[var(--status-blue)]">
                <p className="flex items-center gap-2 font-semibold"><Car className="size-5" /> Your school runs {tomorrow ? "tomorrow" : "today"}</p>
                <p className="mt-0.5 text-sm">{myRuns.length ? myRuns.join(" · ") : "None"}</p>
              </div>
            ) : null}
            <ul className="space-y-3">
              {children.map((c) => {
                const plan = dayPlan(setup, changes, tasks, c.id, day, tz, addDaysKey(day, 1));
                const run = runText(members, plan.run);
                const empty = !plan.bring.length && !plan.lunch && !plan.clubs.length && !run && !plan.due.length;
                return (
                  <li key={c.id} data-testid="today-child" className="glass-tile space-y-3 p-4">
                    <div className="flex items-center gap-3">
                      <MemberAvatar member={c} />
                      <h3 className="flex-1 text-lg font-bold">{role === "child" ? "Your day" : c.display_name}</h3>
                      {role !== "child" ? <Button variant="ghost" className="h-9 rounded-full text-sm" onClick={() => onGo({ tab: "week", childId: c.id })}>The week</Button> : null}
                    </div>
                    {empty ? <p className="text-base text-muted-foreground">Nothing special {tomorrow ? "tomorrow" : "today"}.</p> : null}
                    {plan.bring.length || plan.lunch ? (
                      <div data-testid="today-bring" className="flex items-start gap-3">
                        <Backpack className="mt-0.5 size-6 shrink-0 text-[var(--status-amber)]" />
                        <div className="text-base">
                          {plan.bring.length ? <p className="font-semibold">{plan.bring.join(", ")}</p> : null}
                          {plan.lunch ? <p className="flex items-center gap-1 text-sm text-muted-foreground"><Utensils className="size-4" /> {LUNCH_LABEL[plan.lunch]}</p> : null}
                        </div>
                      </div>
                    ) : null}
                    {plan.clubs.length ? (
                      <div data-testid="today-clubs" className="flex items-start gap-3">
                        <Sparkles className="mt-0.5 size-6 shrink-0 text-[var(--status-blue)]" />
                        <ul className="text-base">
                          {plan.clubs.map((k) => (
                            <li key={k.id}><span className="font-semibold">{k.time} {k.title}</span>{k.kit.length ? <span className="text-sm text-muted-foreground"> · bring {k.kit.join(", ")}</span> : null}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {run ? (
                      <div data-testid="today-runs" className="flex items-start gap-3">
                        <Car className="mt-0.5 size-6 shrink-0 text-[var(--status-green)]" />
                        <p className="text-base">{run}{plan.run?.changed ? <span className="ml-2 rounded-full bg-[var(--status-amber-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--status-amber)]">Changed</span> : null}</p>
                      </div>
                    ) : null}
                    {plan.due.length ? (
                      <div data-testid="today-due" className="flex items-start gap-3">
                        <ClipboardList className="mt-0.5 size-6 shrink-0 text-[var(--status-red)]" />
                        <ul className="text-base">
                          {plan.due.map((t) => (
                            <li key={t.id}>
                              <button type="button" className="text-left font-semibold underline-offset-2 hover:underline" onClick={() => onGo({ tab: "todo", taskId: t.id })}>{t.title}</button>
                              <span className="text-sm text-muted-foreground"> · {t.due_on && t.due_on < day ? "late" : t.due_on === day ? "due today" : "due tomorrow"}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </RecordsWindow>
      <DetailWindow>
        <h3 className="mb-2 flex items-center gap-2 font-bold"><Sun className="size-4" /> Coming up this week</h3>
        {upcoming.length ? (
          <ul className="space-y-2">
            {upcoming.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => onGo({ tab: "todo", taskId: t.id })} className="glass-tile w-full p-3 text-left">
                  <p className="font-semibold">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{TASK_KIND_LABEL[t.kind as keyof typeof TASK_KIND_LABEL]} · {t.member_id ? nameOf(members, t.member_id) : "Everyone"} · {t.due_on ? shortDate(t.due_on) : ""}</p>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing due in the next week.</p>
        )}
      </DetailWindow>
      <SchoolSettingsDialog open={settings} onOpenChange={setSettings} />
    </Windows>
  );
}
