// The week: one child at a time – what to bring, lunch, clubs and the school run for each day.
// Parents tap a day to change the normal week; any grown-up can change the school run for one day.
import { useQueryClient } from "@tanstack/react-query";
import { Backpack, Car, Plus, School, Sparkles, Utensils, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { Chip, Empty, Field, PeoplePicker, Sheet } from "@/modules/calendar/ui";

import { addDaysKey, DAY_NAME, errMsg, hhmm, mondayOf, refreshSchool, shortDate, todayIn, useRunChanges, useSchoolSetup, useTasks, weekdayOf } from "./data";
import type { TabProps } from "./school-page";
import { dayPlan, LUNCH_LABEL, runText } from "./today-parts";

export function WeekTab({ target }: TabProps) {
  const { family, members, me, role, isParent } = useFamilyState();
  const tz = family.timezone || "Europe/London";
  const today = todayIn(tz);
  const children = useMemo(() => members.filter((m) => m.role === "child" && !m.archived_at && (role !== "child" || m.id === me.id)), [members, role, me.id]);
  const [childId, setChildId] = useState<string | null>(target.childId ?? null);
  const [next, setNext] = useState(false);
  const [edit, setEdit] = useState<number | null>(null);
  const [change, setChange] = useState<string | null>(null);
  const monday = addDaysKey(mondayOf(today), next ? 7 : 0);
  const setup = useSchoolSetup().data;
  const changes = useRunChanges(monday, addDaysKey(monday, 6)).data ?? [];
  const tasks = useTasks(addDaysKey(today, -14)).data ?? [];

  useEffect(() => {
    if (!childId && children.length) setChildId(children[0].id);
  }, [childId, children]);

  if (!setup) return null;
  const child = children.find((c) => c.id === childId) ?? null;
  const grownUp = role !== "child";

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        {children.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {children.map((c) => (
              <Chip key={c.id} on={c.id === childId} onClick={() => setChildId(c.id)}>
                <span data-testid={`week-child-${c.display_name}`} className="inline-flex items-center gap-1.5"><MemberAvatar member={c} size="sm" className="size-6 ring-0 ring-offset-0" />{c.display_name}</span>
              </Chip>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">{next ? "Next week" : "This week"} <span className="text-sm font-normal text-muted-foreground">from {shortDate(monday)}</span></h2>
          <Chip on={!next} onClick={() => setNext(false)}>This week</Chip>
          <Chip on={next} onClick={() => setNext(true)}>Next week</Chip>
          {grownUp && child ? (
            <Button data-testid="run-change" variant="outline" className="h-10 rounded-full" onClick={() => setChange(today >= monday && today <= addDaysKey(monday, 6) ? today : monday)}>
              <Car className="size-4" /> Change for one day
            </Button>
          ) : null}
        </div>

        {!child ? (
          <Empty icon={School} title="No children in the household">The week appears here once a child is added in Family.</Empty>
        ) : (
          <ul className="space-y-2">
            {[1, 2, 3, 4, 5, 6, 7].map((wd) => {
              const dayKey = addDaysKey(monday, wd - 1);
              const plan = dayPlan(setup, changes, tasks, child.id, dayKey, tz);
              const run = runText(members, plan.run);
              const anything = plan.bring.length || plan.lunch || plan.clubs.length || run;
              if (wd > 5 && !anything) return null;
              const isToday = dayKey === today;
              return (
                <li key={wd}>
                  <button
                    type="button"
                    data-testid={`week-day-${wd}`}
                    disabled={!grownUp}
                    onClick={() => (isParent ? setEdit(wd) : grownUp ? setChange(dayKey) : undefined)}
                    className={`glass-tile w-full space-y-1.5 p-3 text-left disabled:opacity-100 ${isToday ? "ring-2 ring-[var(--status-blue)]" : ""}`}
                  >
                    <p className="font-bold">{DAY_NAME[wd]} <span className="text-sm font-normal text-muted-foreground">{shortDate(dayKey).replace(/^\w+ /, "")}{isToday ? " · today" : ""}</span></p>
                    {!anything ? <p className="text-sm text-muted-foreground">{isParent ? "Nothing set. Tap to add" : "Nothing set"}</p> : null}
                    {plan.bring.length || plan.lunch ? (
                      <p className="flex items-start gap-2 text-sm"><Backpack className="mt-0.5 size-4 shrink-0 text-[var(--status-amber)]" />
                        <span><span className="font-semibold">{plan.bring.join(", ")}</span>{plan.lunch ? <span className="text-muted-foreground">{plan.bring.length ? " · " : ""}<Utensils className="inline size-3.5" /> {LUNCH_LABEL[plan.lunch]}</span> : null}</span>
                      </p>
                    ) : null}
                    {plan.clubs.map((k) => (
                      <p key={k.id} className="flex items-start gap-2 text-sm"><Sparkles className="mt-0.5 size-4 shrink-0 text-[var(--status-blue)]" /><span><span className="font-semibold">{k.time} {k.title}</span>{k.kit.length ? ` · bring ${k.kit.join(", ")}` : ""}</span></p>
                    ))}
                    {run ? (
                      <p className="flex items-start gap-2 text-sm"><Car className="mt-0.5 size-4 shrink-0 text-[var(--status-green)]" />
                        <span>{run}{plan.run?.changed ? <span className="ml-2 rounded-full bg-[var(--status-amber-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--status-amber)]">Changed{plan.run.note ? `: ${plan.run.note}` : ""}</span> : null}</span>
                      </p>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </RecordsWindow>
      {child && edit !== null ? <DaySheet childId={child.id} childName={child.display_name} weekday={edit} onClose={() => setEdit(null)} /> : null}
      {child && change ? <RunChangeSheet childId={child.id} childName={child.display_name} day={change} onClose={() => setChange(null)} /> : null}
    </Windows>
  );
}

/** Parents: the normal week for one day – what to bring, lunch, and who takes and picks up */
function DaySheet({ childId, childName, weekday, onClose }: { childId: string; childName: string; weekday: number; onClose: () => void }) {
  const { family, members } = useFamilyState();
  const qc = useQueryClient();
  const setup = useSchoolSetup().data!;
  const day = setup.days.find((d) => d.member_id === childId && d.weekday === weekday);
  const run = setup.runs.find((r) => r.member_id === childId && r.weekday === weekday);
  const [bring, setBring] = useState<string[]>(day?.bring ?? []);
  const [item, setItem] = useState("");
  const [lunch, setLunch] = useState<string | null>(day?.lunch ?? null);
  const [drop, setDrop] = useState<string[]>(run?.drop_by ? [run.drop_by] : []);
  const [pick, setPick] = useState<string[]>(run?.pick_by ? [run.pick_by] : []);
  const [pickTime, setPickTime] = useState(hhmm(run?.pick_time));
  const [busy, setBusy] = useState(false);
  const grownUps = members.filter((m) => m.role !== "child" && !m.archived_at);
  const schoolDay = weekday <= 5;

  const add = () => {
    const v = item.trim().slice(0, 40);
    if (!v || bring.length >= 10 || bring.includes(v)) return setItem("");
    setBring([...bring, v]);
    setItem("");
  };

  async function save() {
    setBusy(true);
    try {
      const pending = item.trim() ? [...bring, item.trim().slice(0, 40)].slice(0, 10) : bring;
      const d = day
        ? await supabase.from("school_days").update({ bring: pending, lunch }).eq("member_id", childId).eq("weekday", weekday)
        : await supabase.from("school_days").insert({ member_id: childId, family_id: family.id, weekday, bring: pending, lunch });
      if (d.error) throw d.error;
      if (schoolDay) {
        const row = { drop_by: drop[0] ?? null, pick_by: pick[0] ?? null, pick_time: pickTime || null };
        const r = run
          ? await supabase.from("school_runs").update(row).eq("member_id", childId).eq("weekday", weekday)
          : row.drop_by || row.pick_by || row.pick_time
            ? await supabase.from("school_runs").insert({ member_id: childId, family_id: family.id, weekday, ...row })
            : { error: null };
        if (r.error) throw r.error;
      }
      await refreshSchool(qc, family.id);
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${childName} on ${DAY_NAME[weekday]}s`}
      description="The normal week. For a one-off change, use Change for one day."
      footer={
        <>
          <Button data-testid="week-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
          <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="What to bring" hint="Kit, books, instruments. Up to 10.">
          {bring.length ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {bring.map((b) => (
                <span key={b} className="inline-flex min-h-10 items-center gap-1 rounded-full bg-[var(--surface)] py-1 pl-3 pr-1 text-sm font-medium">
                  {b}
                  <button type="button" aria-label={`Remove ${b}`} className="grid size-8 place-items-center rounded-full hover:bg-muted" onClick={() => setBring(bring.filter((x) => x !== b))}><X className="size-4" /></button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Input data-testid="week-bring-input" value={item} maxLength={40} placeholder="e.g. PE kit" className="h-11"
              onChange={(e) => setItem(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
            <Button data-testid="week-bring-add" variant="outline" className="h-11 rounded-full" disabled={!item.trim() || bring.length >= 10} onClick={add}><Plus className="size-4" /> Add</Button>
          </div>
        </Field>
        <Field label="Lunch">
          <div className="flex gap-2">
            <Chip on={lunch === "dinner"} onClick={() => setLunch(lunch === "dinner" ? null : "dinner")}><span data-testid="week-lunch-dinner">School dinner</span></Chip>
            <Chip on={lunch === "packed"} onClick={() => setLunch(lunch === "packed" ? null : "packed")}><span data-testid="week-lunch-packed">Packed lunch</span></Chip>
          </div>
        </Field>
        {schoolDay ? (
          <>
            <Field label="Who takes them">
              <div data-testid="week-drop"><PeoplePicker members={grownUps} value={drop} onChange={setDrop} single /></div>
            </Field>
            <Field label="Who picks them up">
              <div data-testid="week-pick"><PeoplePicker members={grownUps} value={pick} onChange={setPick} single /></div>
            </Field>
            <Field label="Pick-up time" hint="Optional">
              <Input data-testid="week-pick-time" type="time" value={pickTime} onChange={(e) => setPickTime(e.target.value)} className="h-11 w-36" />
            </Field>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}

/** Any grown-up: who takes and picks up on one particular day */
function RunChangeSheet({ childId, childName, day: startDay, onClose }: { childId: string; childName: string; day: string; onClose: () => void }) {
  const { family, members } = useFamilyState();
  const qc = useQueryClient();
  const tz = family.timezone || "Europe/London";
  const today = todayIn(tz);
  const setup = useSchoolSetup().data!;
  const [day, setDay] = useState(startDay < today ? today : startDay);
  const changes = useRunChanges(day, day).data;
  const existing = changes?.find((c) => c.member_id === childId && c.on_date === day) ?? null;
  const normal = setup.runs.find((r) => r.member_id === childId && r.weekday === weekdayOf(day));
  const [drop, setDrop] = useState<string[]>([]);
  const [pick, setPick] = useState<string[]>([]);
  const [pickTime, setPickTime] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const grownUps = members.filter((m) => m.role !== "child" && !m.archived_at);

  // start from that day's change, or the normal week
  const loadedKey = `${day}:${existing?.id ?? "none"}:${changes ? "y" : "n"}`;
  const [loaded, setLoaded] = useState("");
  useEffect(() => {
    if (!changes || loaded === loadedKey) return;
    const src = existing ?? normal;
    setDrop(src?.drop_by ? [src.drop_by] : []);
    setPick(src?.pick_by ? [src.pick_by] : []);
    setPickTime(hhmm(src?.pick_time));
    setNote(existing?.note ?? "");
    setLoaded(loadedKey);
  }, [changes, existing, normal, loaded, loadedKey]);

  async function save() {
    setBusy(true);
    try {
      const row = { drop_by: drop[0] ?? null, pick_by: pick[0] ?? null, pick_time: pickTime || null, note: note.trim().slice(0, 120) };
      const r = existing
        ? await supabase.from("school_run_changes").update(row).eq("id", existing.id)
        : await supabase.from("school_run_changes").insert({ family_id: family.id, member_id: childId, on_date: day, ...row });
      if (r.error) throw r.error;
      await refreshSchool(qc, family.id);
      toast.success("Changed. Whoever's doing it now gets a message");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function backToNormal() {
    if (!existing) return onClose();
    setBusy(true);
    const { error } = await supabase.from("school_run_changes").delete().eq("id", existing.id);
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    await refreshSchool(qc, family.id);
    toast.success("Back to the normal week");
    onClose();
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${childName}'s school run`}
      description="A change for one day only"
      footer={
        <>
          <Button data-testid="run-change-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !changes} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
          {existing ? <Button variant="outline" className="h-12 rounded-full" disabled={busy} onClick={() => void backToNormal()}>Back to normal</Button> : null}
          <Button variant="ghost" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Which day" hint={shortDate(day)}>
          <Input data-testid="run-change-date" type="date" min={today} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="h-11 w-48" />
        </Field>
        <Field label="Who takes them">
          <PeoplePicker members={grownUps} value={drop} onChange={setDrop} single />
        </Field>
        <Field label="Who picks them up">
          <div data-testid="run-change-pick"><PeoplePicker members={grownUps} value={pick} onChange={setPick} single /></div>
        </Field>
        <Field label="Pick-up time" hint="Optional">
          <Input type="time" value={pickTime} onChange={(e) => setPickTime(e.target.value)} className="h-11 w-36" />
        </Field>
        <Field label="Note" hint="Optional, e.g. Gran's away">
          <Input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} className="h-11" />
        </Field>
      </div>
    </Sheet>
  );
}
