// My habits: tick, count, skip a day, gentle streaks; the add/edit sheet; and habits I'm cheering someone on with.
import { useQueryClient } from "@tanstack/react-query";
import { Archive, Check, Flame, HandHeart, Minus, Pencil, Plus, Sparkles, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Empty, Field, PeoplePicker, Sheet } from "@/modules/calendar/ui";

import { addDaysKey, errMsg, refreshRewards, rewardKey, shortDate, type Habit, type HabitLog } from "./data";
import { bestRun, currentRun, dayState, metThisWeek, weekDays, type DayState } from "./habit-streak";
import { tickHabit } from "./outbox";

const DAY_LETTER = ["M", "T", "W", "T", "F", "S", "S"];

/** Set a day's count for a habit, show it straight away, and send it (or keep it for when there's a signal) */
export function useTick(since: string) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  return async (h: Habit, day: string, count: number, skipped: boolean) => {
    const key = rewardKey(family.id, "habits", since);
    qc.setQueryData<{ habits: Habit[]; logs: HabitLog[] }>(key, (old) => {
      if (!old) return old;
      const rest = old.logs.filter((l) => !(l.habit_id === h.id && l.day === day));
      const prev = old.logs.find((l) => l.habit_id === h.id && l.day === day);
      const row: HabitLog = { id: prev?.id ?? `local-${h.id}-${day}`, family_id: family.id, habit_id: h.id, member_id: h.member_id, day, count, skipped, updated_at: new Date().toISOString() };
      return { ...old, logs: [...rest, row] };
    });
    try {
      const r = await tickHabit({ family_id: family.id, habit_id: h.id, member_id: h.member_id, day, count, skipped });
      if (r === "waiting") toast("Saved, it will send when you have a signal");
      else void refreshRewards(qc, family.id);
    } catch (e) {
      toast.error(errMsg(e));
      void refreshRewards(qc, family.id);
    }
  };
}

function Dots({ habit, logs, today, onTap }: { habit: Habit; logs: HabitLog[]; today: string; onTap?: (day: string, state: DayState) => void }) {
  const days = weekDays(habit, logs, today);
  const oldest = addDaysKey(today, -7);
  return (
    <span className="flex gap-1">
      {days.map((d, i) => {
        const can = !!onTap && !d.future && d.day >= oldest;
        return (
          <button
            key={d.day}
            type="button"
            disabled={!can}
            onClick={(e) => { e.stopPropagation(); if (can) onTap!(d.day, d.state); }}
            aria-label={`${shortDate(d.day)}: ${d.state === "met" ? "done" : d.state === "skipped" ? "skipped" : "not ticked"}`}
            className={cn(
              "grid size-8 place-items-center rounded-full text-[11px] font-bold transition",
              d.state === "met" && "bg-[var(--status-green)] text-white",
              d.state === "part" && "bg-[var(--status-green-soft)] text-[var(--status-green)]",
              d.state === "skipped" && "bg-muted text-muted-foreground line-through",
              (d.state === "none") && "bg-[var(--surface)] text-muted-foreground",
              d.day === today && "ring-2 ring-[var(--status-blue)]",
              d.future && "opacity-40",
            )}
          >
            {d.state === "met" ? <Check className="size-3.5" /> : DAY_LETTER[i]}
          </button>
        );
      })}
    </span>
  );
}

function HabitRow({ habit, logs, today, onTick, onEdit }: {
  habit: Habit; logs: HabitLog[]; today: string;
  onTick: (h: Habit, day: string, count: number, skipped: boolean) => void; onEdit: (h: Habit) => void;
}) {
  const todayLog = logs.find((l) => l.day === today);
  const count = todayLog?.count ?? 0;
  const skipped = !!todayLog?.skipped;
  const state = dayState(habit, todayLog);
  const run = currentRun(habit, logs, today);
  const best = bestRun(habit, logs, today);
  const weekMet = metThisWeek(habit, logs, today);
  const unitWord = habit.per === "week" ? (run === 1 ? "week" : "weeks") : run === 1 ? "day" : "days";
  const counter = habit.per === "day" && habit.target > 1;

  const tapDay = (day: string, s: DayState) => {
    const log = logs.find((l) => l.day === day);
    const need = habit.per === "week" ? 1 : habit.target;
    if (s === "met" || s === "skipped") onTick(habit, day, 0, false);
    else onTick(habit, day, Math.max(need, log?.count ?? 0), false);
  };

  return (
    <li data-testid="habit-row" className="glass-tile flex flex-col gap-2 p-3">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-xl">{habit.emoji || "✨"}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold">{habit.title}</span>
          <span className="block text-xs text-muted-foreground">
            {habit.per === "week"
              ? `${weekMet} of ${habit.target} this week`
              : counter ? `${count} of ${habit.target}${habit.unit ? ` ${habit.unit}` : ""} today` : "Every day"}
            {habit.stars > 0 ? ` · ${habit.stars} ★` : ""}
          </span>
        </span>
        {counter ? (
          <span className="flex shrink-0 items-center gap-1">
            <Button variant="outline" size="icon" className="size-11 rounded-full" aria-label="One less" disabled={skipped || count <= 0}
              onClick={() => onTick(habit, today, Math.max(0, count - 1), false)}><Minus className="size-5" /></Button>
            <Button data-testid="habit-plus" size="icon" className={cn("size-12 rounded-full", state === "met" && "bg-[var(--status-green)] hover:bg-[var(--status-green)]")}
              aria-label="One more" disabled={skipped} onClick={() => onTick(habit, today, count + 1, false)}><Plus className="size-6" /></Button>
          </span>
        ) : (
          <Button data-testid="habit-tick" size="icon" disabled={skipped}
            className={cn("size-12 shrink-0 rounded-full", state === "met" ? "bg-[var(--status-green)] text-white hover:bg-[var(--status-green)]" : "")}
            variant={state === "met" ? "default" : "outline"} aria-label={state === "met" ? "Done today (tap to undo)" : "Tick today"} aria-pressed={state === "met"}
            onClick={() => onTick(habit, today, state === "met" ? 0 : 1, false)}><Check className="size-6" /></Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Dots habit={habit} logs={logs} today={today} onTap={tapDay} />
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Flame className="size-3.5 text-[var(--status-amber)]" />{run ? `${run} ${unitWord} in a row` : "Start a run today"}</span>
          {best > run ? <span className="inline-flex items-center gap-1"><Trophy className="size-3.5" />Best {best}</span> : null}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" data-testid="habit-skip" onClick={() => onTick(habit, today, 0, !skipped)}
          className={cn("min-h-9 rounded-full px-3 text-xs font-semibold", skipped ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted")}>
          {skipped ? "Skipped today (tap to undo)" : "Ill or away – skip today"}
        </button>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" className="h-9 rounded-full" onClick={() => onEdit(habit)}><Pencil className="size-4" /> Change</Button>
      </div>
    </li>
  );
}

export function MyHabits({ habits, logs, today, since }: { habits: Habit[]; logs: HabitLog[]; today: string; since: string }) {
  const tick = useTick(since);
  const [edit, setEdit] = useState<Habit | "new" | null>(null);
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex-1 text-lg font-bold">My habits</h2>
        <Button data-testid="habit-add" className="h-10 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-4" /> Add</Button>
      </div>
      {!habits.length ? (
        <div className="rounded-2xl bg-[var(--surface)]"><Empty icon={Sparkles} title="No habits yet">Add something you'd like to do often, like a walk, drinking water or reading. Earn stars for your own treats.</Empty></div>
      ) : (
        <ul className="space-y-2">
          {habits.map((h) => <HabitRow key={h.id} habit={h} logs={logs.filter((l) => l.habit_id === h.id)} today={today} onTick={tick} onEdit={setEdit} />)}
        </ul>
      )}
      <EditHabit value={edit} onClose={() => setEdit(null)} />
    </section>
  );
}

export function CheeringOn({ habits, logs, today }: { habits: Habit[]; logs: HabitLog[]; today: string }) {
  const { members } = useFamilyState();
  const [sent, setSent] = useState<Set<string>>(new Set());
  if (!habits.length) return null;
  const cheer = async (h: Habit) => {
    const { error } = await supabase.rpc("reward_cheer", { p_habit: h.id });
    if (error) { toast.error(errMsg(error)); return; }
    setSent((s) => new Set(s).add(h.id));
    toast.success("Sent");
  };
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><HandHeart className="size-5" /> Cheering on</h2>
      <ul className="space-y-2">
        {habits.map((h) => {
          const who = members.find((m) => m.id === h.member_id)?.display_name ?? "Someone";
          const hl = logs.filter((l) => l.habit_id === h.id);
          const done = sent.has(h.id);
          return (
            <li key={h.id} className="glass-tile flex flex-col gap-2 p-3">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-xl">{h.emoji || "✨"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{who}: {h.title}</span>
                  <span className="block text-xs text-muted-foreground">{currentRun(h, hl, today)} in a row</span>
                </span>
                <Button data-testid="cheer-btn" className="h-11 rounded-full px-4 font-semibold" disabled={done} onClick={() => void cheer(h)}>
                  {done ? "Sent" : "Cheer"}
                </Button>
              </div>
              <Dots habit={h} logs={hl} today={today} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- add or change a habit

function EditHabit({ value, onClose }: { value: Habit | "new" | null; onClose: () => void }) {
  return value ? <HabitForm key={value === "new" ? "new" : value.id} habit={value === "new" ? null : value} onClose={onClose} /> : null;
}

function HabitForm({ habit, onClose }: { habit: Habit | null; onClose: () => void }) {
  const { family, me, members } = useFamilyState();
  const qc = useQueryClient();
  const [title, setTitle] = useState(habit?.title ?? "");
  const [emoji, setEmoji] = useState(habit?.emoji ?? "");
  const [per, setPer] = useState<"day" | "week">((habit?.per as "day" | "week") ?? "day");
  const [target, setTarget] = useState(String(habit?.target ?? (per === "week" ? 3 : 1)));
  const [unit, setUnit] = useState(habit?.unit ?? "");
  const [stars, setStars] = useState(String(habit?.stars ?? 1));
  const [buddy, setBuddy] = useState<string[]>(habit?.buddy ? [habit.buddy] : []);
  const [busy, setBusy] = useState(false);
  const buddies = useMemo(() => members.filter((m) => m.id !== me.id && m.user_id && !m.archived_at), [members, me.id]);

  const t = Math.round(Number(target));
  const st = Math.round(Number(stars || 0));
  const ok = title.trim().length > 0 && Number.isFinite(t) && t >= 1 && t <= (per === "week" ? 7 : 1000) && Number.isFinite(st) && st >= 0 && st <= 100;

  const save = async () => {
    setBusy(true);
    const row = { title: title.trim(), emoji: emoji.trim() || null, per, target: t, unit: per === "day" && t > 1 ? unit.trim() || null : null, stars: st, buddy: buddy[0] ?? null };
    const { error } = habit
      ? await supabase.from("habits").update(row).eq("id", habit.id)
      : await supabase.from("habits").insert({ ...row, family_id: family.id, member_id: me.id });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    void refreshRewards(qc, family.id);
    onClose();
  };
  const archive = async () => {
    if (!habit) return;
    setBusy(true);
    const { error } = await supabase.from("habits").update({ archived_at: new Date().toISOString() }).eq("id", habit.id);
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    void refreshRewards(qc, family.id);
    toast("Put away", {
      action: { label: "Undo", onClick: () => void supabase.from("habits").update({ archived_at: null }).eq("id", habit.id).then(() => refreshRewards(qc, family.id)) },
    });
    onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={habit ? "Change habit" : "New habit"}
      footer={
        <>
          {habit ? <Button variant="ghost" className="h-11 rounded-full" disabled={busy} onClick={() => void archive()}><Archive className="size-4" /> Put away</Button> : null}
          <span className="flex-1" />
          <Button variant="outline" className="h-11 rounded-full" onClick={onClose}>Cancel</Button>
          <Button data-testid="habit-save" className="h-11 rounded-full px-6 font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        </>
      }>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Field label="Picture"><Input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} placeholder="🚶" className="h-11 w-16 text-center text-xl" aria-label="Emoji" /></Field>
          <div className="flex-1"><Field label="What"><Input data-testid="habit-title" data-autofocus value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Walk the dog" className="h-11" /></Field></div>
        </div>
        <Field label="How often">
          <div className="flex flex-wrap gap-2">
            <Chip on={per === "day"} onClick={() => { setPer("day"); if (Number(target) > 7 || per !== "day") setTarget("1"); }}>Every day</Chip>
            <Chip on={per === "week"} onClick={() => { setPer("week"); setTarget("3"); }}>Some days a week</Chip>
          </div>
        </Field>
        {per === "week" ? (
          <Field label="Days a week">
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <Chip key={n} on={t === n} onClick={() => setTarget(String(n))} className="w-11 justify-center">{n}</Chip>)}
            </div>
          </Field>
        ) : (
          <div className="flex gap-2">
            <div className="w-28"><Field label="How many" hint="1 is a simple tick"><Input data-testid="habit-target" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} className="h-11" /></Field></div>
            {t > 1 ? <div className="flex-1"><Field label="Of what"><Input value={unit} maxLength={20} onChange={(e) => setUnit(e.target.value)} placeholder="glasses" className="h-11" /></Field></div> : null}
          </div>
        )}
        <Field label="Stars each time" hint={per === "week" ? "Paid when you reach your days for the week" : "Paid when you reach today's target"}>
          <Input data-testid="habit-stars" inputMode="numeric" value={stars} onChange={(e) => setStars(e.target.value.replace(/\D/g, ""))} className="h-11 w-28" />
        </Field>
        <Field label="A buddy (optional)" hint="One person who sees your ticks and can cheer you on">
          <div data-testid="habit-buddy">
            {buddies.length ? <PeoplePicker members={buddies} value={buddy} onChange={setBuddy} single /> : <p className="text-sm text-muted-foreground">No one else in your household has a login yet.</p>}
          </div>
        </Field>
      </div>
    </Sheet>
  );
}
