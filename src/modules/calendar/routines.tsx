import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown, ArrowUp, Backpack, Bath, BedDouble, BookOpen, Camera, Check, Droplets, Footprints, Loader2, Moon, PartyPopper, Pencil,
  Plus, Shirt, Smile, Star, Sun, Timer, Trash2, Utensils, X, type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useExtra } from "@/lib/extras";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { fitJpeg } from "@/lib/image";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

import { useFileUrl, useRoutineDay, useRoutines, type RoutineRun, type RoutineStep, type RoutineTick, type RoutineWithSteps } from "./data";
import { pad, shortDay, todayKey, weekdayOf } from "./time";
import { Chip, Empty, Field, PeoplePicker, Sheet, Tabs } from "./ui";

// ---------------------------------------------------------------- icons (stored by name)

export const ROUTINE_ICONS: Record<string, LucideIcon> = {
  sun: Sun, moon: Moon, backpack: Backpack, check: Check, bath: Bath, shirt: Shirt, utensils: Utensils, book: BookOpen,
  bed: BedDouble, shoes: Footprints, wash: Droplets, smile: Smile,
};
export function routineIcon(name: string): LucideIcon {
  return ROUTINE_ICONS[name] ?? Check;
}

function totalMinutes(r: RoutineWithSteps) {
  return r.steps.reduce((n, s) => n + (s.minutes ?? 0), 0);
}
function mmss(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

// ---------------------------------------------------------------- the tab

export function RoutinesTab() {
  const { family, me, members, role, isParent } = useFamilyState();
  const timers = useExtra("cal.timers");
  const today = todayKey(family.timezone);
  const wd = weekdayOf(today);
  const q = useRoutines();
  const dayQ = useRoutineDay(today);
  const [view, setView] = useState<"today" | "manage">("today");
  const [running, setRunning] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);

  const todays = useMemo(
    () => (q.data ?? []).filter((r) => r.active && r.days.includes(wd) && (role !== "child" || r.member_id === me.id)),
    [q.data, wd, role, me.id],
  );
  const byPerson = members
    .map((m) => ({ m, list: todays.filter((r) => r.member_id === m.id) }))
    .filter((g) => g.list.length);
  const runFor = (id: string) => dayQ.data?.runs.find((r) => r.routine_id === id);
  const ticksFor = (id: string) => dayQ.data?.ticks.filter((t) => t.routine_id === id) ?? [];
  const runRoutine = q.data?.find((r) => r.id === running) ?? null;
  const editRoutine = editing && editing !== "new" ? q.data?.find((r) => r.id === editing) ?? null : null;

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={view} onChange={setView} items={[{ key: "today", label: "Today" }, ...(isParent ? [{ key: "manage" as const, label: "Set up routines" }] : [])]} />
          {view === "manage" && isParent ? <Button className="ml-auto h-10 rounded-full" onClick={() => setEditing("new")}><Plus className="size-4" /> New routine</Button> : null}
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
          {view === "today" ? (
            <>
              {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
              {!q.isLoading && !byPerson.length ? (
                <Empty icon={Sun} title="No routines today">{isParent ? "Set up a morning or bedtime routine in “Set up routines”." : "Nothing to do here today."}</Empty>
              ) : null}
              <div className="space-y-4">
                {byPerson.map(({ m, list }) => (
                  <section key={m.id}>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><MemberAvatar member={m} size="sm" className="ring-0 ring-offset-0" />{m.id === me.id ? "You" : m.display_name}</h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {list.map((r) => {
                        const Icon = routineIcon(r.icon);
                        const run = runFor(r.id);
                        const done = ticksFor(r.id).length;
                        const canDo = isParent || r.member_id === me.id;
                        return (
                          <button key={r.id} type="button" disabled={!canDo} onClick={() => setRunning(r.id)} className="glass-tile flex min-h-20 items-center gap-3 px-4 py-3 text-left disabled:cursor-default">
                            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--status-amber-soft)] text-[var(--status-amber)]"><Icon className="size-6" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-base font-bold">{r.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {run?.finished_at ? "Finished!" : `${done} of ${r.steps.length} done`}
                                {hhmm(r.start_time) ? ` · ${hhmm(r.start_time)}` : ""}
                                {timers && totalMinutes(r) ? ` · ${totalMinutes(r)} min` : ""}
                              </span>
                            </span>
                            {run?.finished_at ? <Check className="size-7 text-[var(--status-green)]" /> : canDo ? <span className="rounded-full bg-[var(--tile-active)] px-4 py-2 text-sm font-semibold text-[var(--tile-active-fg)]">{run ? "Carry on" : "Start"}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </>
          ) : null}

          {view === "manage" && isParent ? (
            <div className="space-y-2">
              {!(q.data ?? []).length ? <Empty icon={Sun} title="No routines yet">Make a morning, after-school or bedtime list. Children tick each step and can earn stars.</Empty> : null}
              {(q.data ?? []).map((r) => {
                const Icon = routineIcon(r.icon);
                const who = members.find((m) => m.id === r.member_id);
                return (
                  <button key={r.id} type="button" onClick={() => setEditing(r.id)} className={cn("glass-tile flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left", !r.active && "opacity-50")}>
                    <Icon className="size-5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{r.name} · {who?.display_name ?? "Someone"}</span>
                      <span className="block truncate text-xs text-muted-foreground">{r.steps.length} steps · {r.days.length === 7 ? "every day" : r.days.map(shortDay).join(", ")}{hhmm(r.start_time) ? ` · ${hhmm(r.start_time)}` : ""}{!r.active ? " · paused" : ""}</span>
                    </span>
                    <Pencil className="size-4 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </RecordsWindow>
      <DetailWindow>
        <h3 className="mb-2 text-sm font-bold">How routines work</h3>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>Tap a routine to start it.{timers ? " The clock starts counting down." : ""}</li>
          <li>Tick each step as you do it.</li>
          <li>Tick them all, then press Finish to get your stars.</li>
          {timers ? <li>Finish early and you'll see how much time you saved.</li> : null}
        </ol>
      </DetailWindow>

      {runRoutine ? (
        <RoutineRunner routine={runRoutine} run={runFor(runRoutine.id)} ticks={ticksFor(runRoutine.id)} day={today} onClose={() => setRunning(null)} />
      ) : null}
      {isParent ? <RoutineEditor open={editing !== null} routine={editRoutine} onClose={() => setEditing(null)} onCreated={(id) => setEditing(id)} /> : null}
    </Windows>
  );
}

// ---------------------------------------------------------------- doing a routine (big, child-friendly)

function RoutineRunner({ routine, run, ticks, day, onClose }: { routine: RoutineWithSteps; run: RoutineRun | undefined; ticks: RoutineTick[]; day: string; onClose: () => void }) {
  const { family, members } = useFamilyState();
  const timers = useExtra("cal.timers");
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const started = useRef(false);
  const total = timers ? totalMinutes(routine) * 60 : 0;
  const done = new Set(ticks.map((t) => t.step_id));
  const current = routine.steps.find((s) => !done.has(s.id));
  const [stepStart, setStepStart] = useState<{ id: string | null; at: number }>({ id: null, at: Date.now() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["cal", family.id] });
  const who = members.find((m) => m.id === routine.member_id);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if ((current?.id ?? null) !== stepStart.id) setStepStart({ id: current?.id ?? null, at: Date.now() });
  }, [current?.id, stepStart.id]);

  // starting the routine records the start time (once a day)
  useEffect(() => {
    if (run || started.current) return;
    started.current = true;
    void (async () => {
      const { error } = await supabase.from("routine_runs").insert({ family_id: family.id, routine_id: routine.id, run_on: day });
      if (error && error.code !== "23505") toast.error(friendlyError(error));
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  async function toggle(s: RoutineStep) {
    setBusy(s.id);
    try {
      const t = ticks.find((x) => x.step_id === s.id);
      const { error } = t
        ? await supabase.from("routine_ticks").delete().eq("id", t.id)
        : await supabase.from("routine_ticks").insert({ family_id: family.id, routine_id: routine.id, step_id: s.id, done_on: day });
      if (error) throw error;
      await refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }
  async function finish() {
    if (!run) return;
    setBusy("finish");
    try {
      const { error } = await supabase.from("routine_runs").update({ finished_at: new Date().toISOString() }).eq("id", run.id);
      if (error) throw error;
      await refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  const elapsed = run ? (now - new Date(run.started_at).getTime()) / 1000 : 0;
  const left = total - elapsed;
  const finished = run?.finished_at;
  const early = finished && total ? Math.floor((total - (new Date(finished).getTime() - new Date(run!.started_at).getTime()) / 1000) / 60) : 0;
  const stepLeft = timers && current?.minutes ? current.minutes * 60 - (now - stepStart.at) / 1000 : null;
  const allTicked = routine.steps.length > 0 && routine.steps.every((s) => done.has(s.id));

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={`${routine.name}${who ? ` · ${who.display_name}` : ""}`} wide
      footer={
        finished ? <Button className="h-12 flex-1 rounded-full text-base" onClick={onClose}>Close</Button> : (
          <>
            <Button className="h-12 flex-1 rounded-full text-base" disabled={!allTicked || !run || busy === "finish"} onClick={finish}>
              {busy === "finish" ? <Loader2 className="size-5 animate-spin" /> : <><Star className="size-5" /> Finish</>}
            </Button>
            <Button variant="ghost" className="h-12 rounded-full" onClick={onClose}>Later</Button>
          </>
        )
      }
    >
      {finished ? (
        <div className="py-8 text-center">
          <PartyPopper className="mx-auto size-16 text-[var(--gold)]" />
          <p className="mt-3 text-2xl font-extrabold">All done!</p>
          {early > 0 ? <p className="mt-1 text-lg font-semibold">Finished {early} {early === 1 ? "minute" : "minutes"} early!</p> : null}
          {run?.stars ? <p className="mt-2 inline-flex items-center gap-1 text-lg"><Star className="size-5 fill-current text-[var(--gold)]" /> {run.stars} {run.stars === 1 ? "star" : "stars"}</p> : null}
          {routine.reward ? <p className="mt-3 rounded-2xl bg-[var(--status-green-soft)] p-3 font-semibold">Now: {routine.reward}</p> : null}
        </div>
      ) : (
        <div className="space-y-3">
          {total ? (
            <div className={cn("flex items-center justify-center gap-2 rounded-2xl p-3 text-3xl font-extrabold tabular-nums", left < 0 ? "bg-[var(--status-red-soft)] text-[var(--status-red)]" : "bg-[var(--status-blue-soft)] text-[var(--status-blue)]")}>
              <Timer className="size-7" /> {left < 0 ? `${mmss(-left)} over` : mmss(left)}
            </div>
          ) : null}
          {routine.steps.map((s, i) => {
            const isDone = done.has(s.id);
            const isNow = current?.id === s.id;
            return (
              <button key={s.id} type="button" disabled={busy === s.id} onClick={() => toggle(s)}
                className={cn("glass-tile flex min-h-24 w-full items-center gap-4 p-3 text-left transition", isDone && "opacity-55", isNow && "ring-2 ring-[var(--gold)]")}>
                <StepPicture step={s} />
                <span className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-muted-foreground">Step {i + 1}</span>
                  <span className={cn("block text-xl font-bold", isDone && "line-through")}>{s.title}</span>
                  {isNow && stepLeft !== null ? <span className={cn("text-sm font-semibold tabular-nums", stepLeft < 0 ? "text-[var(--status-red)]" : "text-muted-foreground")}>{stepLeft < 0 ? "Time's up" : `${mmss(stepLeft)} left`}</span> : timers && s.minutes ? <span className="text-sm text-muted-foreground">{s.minutes} min</span> : null}
                </span>
                <span className={cn("grid size-14 shrink-0 place-items-center rounded-full border-2", isDone ? "border-transparent bg-[var(--status-green)] text-white" : "border-[var(--status-green)] text-[var(--status-green)]")}>
                  {busy === s.id ? <Loader2 className="size-6 animate-spin" /> : <Check className="size-8" />}
                </span>
              </button>
            );
          })}
          {!routine.steps.length ? <p className="text-sm text-muted-foreground">This routine has no steps yet. A parent can add them.</p> : null}
          {routine.reward ? <p className="text-center text-sm font-semibold">When you finish: {routine.reward}</p> : null}
        </div>
      )}
    </Sheet>
  );
}

function StepPicture({ step, small }: { step: RoutineStep; small?: boolean }) {
  const url = useFileUrl(step.photo_path);
  const Icon = routineIcon(step.icon);
  const size = small ? "size-10" : "size-16";
  if (step.photo_path && url.data) return <img src={url.data} alt="" className={cn(size, "shrink-0 rounded-2xl object-cover")} />;
  return <span className={cn(size, "grid shrink-0 place-items-center rounded-2xl bg-[var(--status-amber-soft)] text-[var(--status-amber)]")}><Icon className={small ? "size-5" : "size-8"} /></span>;
}

// ---------------------------------------------------------------- setting up a routine (parents)

function RoutineEditor({ open, routine, onClose, onCreated }: { open: boolean; routine: RoutineWithSteps | null; onClose: () => void; onCreated: (id: string) => void }) {
  const { family, members } = useFamilyState();
  const qc = useQueryClient();
  const blank = () => ({ member: members.find((m) => m.role === "child")?.id ?? members[0]?.id ?? "", name: "", icon: "sun", time: "", days: [1, 2, 3, 4, 5, 6, 7], reward: "", stars: 1, active: true });
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["cal", family.id] });

  useEffect(() => {
    if (!open) return;
    if (routine) setF({ member: routine.member_id, name: routine.name, icon: routine.icon, time: hhmm(routine.start_time) ?? "", days: routine.days, reward: routine.reward ?? "", stars: routine.stars, active: routine.active });
    else setF(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, routine?.id]);
  const set = <K extends keyof ReturnType<typeof blank>>(k: K, v: ReturnType<typeof blank>[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save(close: boolean) {
    if (!f.name.trim() || !f.member) return void toast.error("Give it a name and pick who it's for");
    setBusy(true);
    try {
      const row = { member_id: f.member, name: f.name.trim(), icon: f.icon, start_time: f.time || null, days: f.days.length ? f.days : [1, 2, 3, 4, 5, 6, 7], reward: f.reward.trim() || null, stars: f.stars, active: f.active };
      if (routine) {
        const { error } = await supabase.from("routines").update(row).eq("id", routine.id);
        if (error) throw error;
        toast.success("Saved");
        if (close) onClose();
      } else {
        const { data, error } = await supabase.from("routines").insert({ ...row, family_id: family.id }).select("id").single();
        if (error) throw error;
        toast.success("Saved. Now add the steps");
        onCreated(data.id as string);
      }
      await refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!routine || !window.confirm(`Remove “${routine.name}”?`)) return;
    const { error } = await supabase.from("routines").delete().eq("id", routine.id);
    if (error) return void toast.error(friendlyError(error));
    await refresh();
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={routine ? "Change routine" : "New routine"} wide
      footer={
        <>
          <Button className="h-11 flex-1 rounded-full px-6 sm:flex-none" disabled={busy || !f.name.trim()} onClick={() => save(true)}>{busy ? <Loader2 className="size-4 animate-spin" /> : routine ? "Save" : "Next: add steps"}</Button>
          <Button variant="ghost" className="h-11 rounded-full" onClick={onClose}>{routine ? "Close" : "Cancel"}</Button>
          {routine ? <Button variant="ghost" className="ml-auto h-11 rounded-full text-destructive" onClick={remove}><Trash2 className="size-4" /> Remove</Button> : null}
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Who is it for?">
          <PeoplePicker members={members} value={f.member ? [f.member] : []} onChange={(v) => v[0] && set("member", v[0])} single allowNone={false} />
        </Field>
        <Input value={f.name} maxLength={60} placeholder="e.g. Morning, After school, Bedtime" aria-label="Name" className="h-12 text-base font-semibold" onChange={(e) => set("name", e.target.value)} />
        <Field label="Picture">
          <IconPicker value={f.icon} onChange={(v) => set("icon", v)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts at (optional)">
            <Input type="time" value={f.time} onChange={(e) => set("time", e.target.value)} className="h-11 w-auto" />
          </Field>
          <Field label="Stars for finishing">
            <div className="flex flex-wrap gap-1.5">{[0, 1, 2, 3, 5].map((n) => <Chip key={n} on={f.stars === n} onClick={() => set("stars", n)}>{n === 0 ? "None" : n}</Chip>)}</div>
          </Field>
        </div>
        <Field label="Which days">
          <div className="flex flex-wrap gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <Chip key={d} className="min-w-11 justify-center px-2" on={f.days.includes(d)} onClick={() => set("days", f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort())}>{shortDay(d)}</Chip>
            ))}
          </div>
        </Field>
        <Field label="Reward when finished (optional)">
          <Input value={f.reward} maxLength={120} placeholder="e.g. 20 minutes on the tablet" onChange={(e) => set("reward", e.target.value)} className="h-11" />
        </Field>
        {routine ? (
          <label className="flex min-h-10 items-center justify-between gap-3 text-sm font-semibold">Switched on<Switch checked={f.active} onCheckedChange={(v) => set("active", v)} /></label>
        ) : null}
        {routine ? <StepsEditor routine={routine} /> : null}
      </div>
    </Sheet>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(ROUTINE_ICONS).map(([k, Icon]) => (
        <button key={k} type="button" aria-pressed={value === k} aria-label={k} onClick={() => onChange(k)}
          className={cn("grid size-11 place-items-center rounded-full border", value === k ? "border-transparent bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "border-[var(--surface-border)] bg-[var(--surface)]")}>
          <Icon className="size-5" />
        </button>
      ))}
    </div>
  );
}

function StepsEditor({ routine }: { routine: RoutineWithSteps }) {
  const { family } = useFamilyState();
  const timers = useExtra("cal.timers");
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("check");
  const [minutes, setMinutes] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoFor, setPhotoFor] = useState<RoutineStep | null>(null);
  const steps = routine.steps;
  const refresh = () => qc.invalidateQueries({ queryKey: ["cal", family.id] });

  async function run(fn: () => PromiseLike<{ error: unknown }>) {
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) throw error;
      await refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function add() {
    if (!title.trim()) return;
    const m = Number(minutes);
    await run(() => supabase.from("routine_steps").insert({
      family_id: family.id, routine_id: routine.id, title: title.trim(), icon, minutes: m >= 1 && m <= 120 ? Math.round(m) : null,
      position: (steps[steps.length - 1]?.position ?? 0) + 1,
    }));
    setTitle("");
    setMinutes("");
  }
  async function move(i: number, dir: -1 | 1) {
    const a = steps[i];
    const b = steps[i + dir];
    if (!a || !b) return;
    setBusy(true);
    try {
      // positions may be equal for old rows, so give every step a clean number
      const order = steps.map((s) => s.id);
      [order[i], order[i + dir]] = [order[i + dir], order[i]];
      for (let n = 0; n < order.length; n++) {
        const { error } = await supabase.from("routine_steps").update({ position: n + 1 }).eq("id", order[n]);
        if (error) throw error;
      }
      await refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function uploadPhoto(step: RoutineStep, file: File) {
    setBusy(true);
    try {
      if (!file.type.startsWith("image/")) throw new Error("Please choose a photo");
      const blob = await fitJpeg(file, 800);
      const path = `${family.id}/routines/${crypto.randomUUID()}.jpg`;
      const up = await supabase.storage.from("family-files").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const { error } = await supabase.from("routine_steps").update({ photo_path: path }).eq("id", step.id);
      if (error) throw error;
      if (step.photo_path) await supabase.storage.from("family-files").remove([step.photo_path]);
      await refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field label="Steps">
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && photoFor) void uploadPhoto(photoFor, f); }} />
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.id} className="glass-tile flex items-center gap-2 p-2">
            <StepPicture step={s} small />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{i + 1}. {s.title}</span>
              {timers && s.minutes ? <span className="text-xs text-muted-foreground">{s.minutes} min</span> : null}
            </span>
            <Button type="button" variant="ghost" size="icon" className="size-9 rounded-full" aria-label="Add a photo" disabled={busy} onClick={() => { setPhotoFor(s); fileRef.current?.click(); }}><Camera className="size-4" /></Button>
            {s.photo_path ? <Button type="button" variant="ghost" size="icon" className="size-9 rounded-full" aria-label="Remove photo" disabled={busy} onClick={() => run(() => supabase.from("routine_steps").update({ photo_path: null }).eq("id", s.id))}><X className="size-4" /></Button> : null}
            <Button type="button" variant="ghost" size="icon" className="size-9 rounded-full" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
            <Button type="button" variant="ghost" size="icon" className="size-9 rounded-full" aria-label="Move down" disabled={busy || i === steps.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
            <Button type="button" variant="ghost" size="icon" className="size-9 rounded-full text-destructive" aria-label="Remove step" disabled={busy} onClick={() => run(() => supabase.from("routine_steps").delete().eq("id", s.id))}><Trash2 className="size-4" /></Button>
          </li>
        ))}
      </ol>
      <div className="mt-2 space-y-2 rounded-2xl bg-muted/60 p-3">
        <div className={cn("grid gap-2", timers ? "grid-cols-[1fr_6rem]" : "grid-cols-1")}>
          <Input value={title} maxLength={80} placeholder="Next step, e.g. Brush teeth" aria-label="Step" onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }} className="h-11" />
          {timers ? <Input type="number" inputMode="numeric" min={1} max={120} value={minutes} placeholder="Mins" aria-label="Minutes (optional)" onChange={(e) => setMinutes(e.target.value)} className="h-11" /> : null}
        </div>
        <IconPicker value={icon} onChange={setIcon} />
        <Button type="button" className="h-11 rounded-full" disabled={busy || !title.trim()} onClick={add}><Plus className="size-4" /> Add step</Button>
      </div>
    </Field>
  );
}
