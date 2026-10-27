// Family goals: grown-ups set them up, everyone helps, a grown-up confirms "Goal reached!".
import { useQueryClient } from "@tanstack/react-query";
import { Archive, Check, Loader2, Minus, Pencil, PartyPopper, Plus, Star, Target, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { Empty, Field, PeoplePicker, Sheet } from "@/modules/calendar/ui";

import type { BoardTarget } from "./board-page";
import { refreshBoard, useGoals, type Goal, type GoalStep } from "./data";

const GOAL_EMOJIS = ["🎯", "📚", "🏊", "🚴", "🎹", "🌱", "🧹", "🏃", "🎨", "⚽", "💪", "⭐"];

/** How far along a goal is (0–1), and whether it's ready to celebrate */
export function goalProgress(g: Goal, steps: GoalStep[]) {
  const parts: number[] = [];
  if (g.target) parts.push(Math.min(1, g.progress / g.target));
  if (steps.length) parts.push(steps.filter((s) => s.done_at).length / steps.length);
  const ratio = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
  const ready = !g.done_at && parts.length > 0 && parts.every((p) => p >= 1);
  return { ratio, ready };
}

export function ProgressBar({ ratio, className }: { ratio: number; className?: string }) {
  return (
    <div className={cn("h-3 overflow-hidden rounded-full bg-[var(--surface-border)]", className)} role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-[var(--status-green)] transition-all" style={{ width: `${Math.round(ratio * 100)}%` }} />
    </div>
  );
}

export function GoalsTab({ target }: { target: BoardTarget; onGo: (t: BoardTarget) => void }) {
  const { role } = useFamilyState();
  const desktop = useDesktop();
  const data = useGoals();
  const goals = useMemo(() => data.data?.goals ?? [], [data.data]);
  const steps = useMemo(() => data.data?.steps ?? [], [data.data]);
  const [sel, setSel] = useState<string | null>(target.goalId ?? null);
  const [edit, setEdit] = useState<Goal | "new" | null>(null);
  useEffect(() => { if (target.goalId) setSel(target.goalId); }, [target.goalId]);
  const isAdult = role !== "child";

  const open = goals.filter((g) => !g.done_at);
  const finished = goals.filter((g) => g.done_at);
  const chosen = goals.find((g) => g.id === sel) ?? (desktop ? open[0] ?? finished[0] : undefined);

  const listPanel = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-lg font-bold">Family goals</h2>
        {isAdult ? <Button className="h-10 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-4" /> New goal</Button> : null}
      </div>
      {data.isLoading ? <Loader2 className="size-5 animate-spin" /> : null}
      {!data.isLoading && goals.length === 0 ? (
        <Empty icon={Target} title="No goals yet">{isAdult ? "Set a goal for the family, like \"Read 50 books\" or \"Learn to swim\"." : "Ask a grown-up to set a family goal."}</Empty>
      ) : null}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {open.map((g) => <GoalCard key={g.id} goal={g} steps={steps.filter((s) => s.goal_id === g.id)} on={chosen?.id === g.id} onOpen={() => setSel(g.id)} />)}
      </ul>
      {finished.length ? (
        <>
          <h3 className="flex items-center gap-2 text-sm font-bold text-muted-foreground"><PartyPopper className="size-4" /> Reached</h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {finished.map((g) => <GoalCard key={g.id} goal={g} steps={steps.filter((s) => s.goal_id === g.id)} on={chosen?.id === g.id} onOpen={() => setSel(g.id)} />)}
          </ul>
        </>
      ) : null}
    </div>
  );

  const detail = chosen ? (
    <GoalDetail key={chosen.id} goal={chosen} steps={steps.filter((s) => s.goal_id === chosen.id)} onEdit={() => setEdit(chosen)} onBack={desktop ? undefined : () => setSel(null)} />
  ) : <Empty icon={Target} title="Pick a goal">Tap a goal to help with it.</Empty>;

  return (
    <>
      <Windows>
        <RecordsWindow>{!desktop && chosen ? detail : listPanel}</RecordsWindow>
        <DetailWindow>{detail}</DetailWindow>
      </Windows>
      <GoalEditor goal={edit} steps={edit && edit !== "new" ? steps.filter((s) => s.goal_id === edit.id) : []} onClose={() => setEdit(null)} onSaved={(id) => setSel(id)} />
    </>
  );
}

function GoalCard({ goal, steps, on, onOpen }: { goal: Goal; steps: GoalStep[]; on: boolean; onOpen: () => void }) {
  const { ratio, ready } = goalProgress(goal, steps);
  return (
    <li>
      <button type="button" onClick={onOpen}
        className={cn("flex w-full flex-col gap-2 rounded-2xl p-3 text-left transition", on ? "bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "bg-[var(--surface)] hover:bg-muted")}>
        <span className="flex items-center gap-2">
          <span className="text-2xl">{goal.emoji ?? "🎯"}</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{goal.title}</span>
          {goal.done_at ? <PartyPopper className="size-5" /> : ready ? <span className="rounded-full bg-[var(--status-amber-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--status-amber)]">Ready to celebrate</span> : null}
        </span>
        <ProgressBar ratio={goal.done_at ? 1 : ratio} />
        <span className={cn("text-xs", on ? "opacity-80" : "text-muted-foreground")}>
          {goal.target ? `${goal.progress} of ${goal.target}${goal.unit ? ` ${goal.unit}` : ""}` : `${steps.filter((s) => s.done_at).length} of ${steps.length} steps`}
          {goal.stars ? ` · ${goal.stars} ★ each` : ""}
        </span>
      </button>
    </li>
  );
}

function GoalDetail({ goal, steps, onEdit, onBack }: { goal: Goal; steps: GoalStep[]; onEdit: () => void; onBack?: () => void }) {
  const { family, members, role } = useFamilyState();
  const qc = useQueryClient();
  const isAdult = role !== "child";
  const locked = !!goal.done_at && !isAdult;
  const { ratio, ready } = goalProgress(goal, steps);
  const [setTo, setSetTo] = useState("");
  const [party, setParty] = useState(false);
  const who = goal.people.length ? members.filter((m) => goal.people.includes(m.id)) : [];
  const refresh = () => refreshBoard(qc, family.id);

  async function changeProgress(n: number) {
    const v = Math.max(0, Math.min(100000, n));
    const { error } = await supabase.from("board_goals").update({ progress: v }).eq("id", goal.id);
    if (error) { toast.error(friendlyError(error)); return; }
    if (goal.target && v >= goal.target && goal.progress < goal.target) toast.success("Target reached! A grown-up can now celebrate it");
    await refresh();
  }
  async function tick(s: GoalStep) {
    const { error } = await supabase.from("board_goal_steps").update({ done_at: s.done_at ? null : new Date().toISOString() }).eq("id", s.id);
    if (error) { toast.error(friendlyError(error)); return; }
    await refresh();
  }
  async function celebrate() {
    const { error } = await supabase.from("board_goals").update({ done_at: new Date().toISOString() }).eq("id", goal.id);
    if (error) { toast.error(friendlyError(error)); return; }
    setParty(true);
    setTimeout(() => setParty(false), 4000);
    await refresh();
  }
  async function reopen() {
    const { error } = await supabase.from("board_goals").update({ done_at: null }).eq("id", goal.id);
    if (error) { toast.error(friendlyError(error)); return; }
    await refresh();
  }

  return (
    <div className="relative flex flex-col gap-4">
      {party ? <Confetti /> : null}
      <div className="flex items-center gap-2">
        {onBack ? <Button variant="ghost" className="h-10 rounded-full px-3" onClick={onBack}>← Goals</Button> : null}
        <span className="text-3xl">{goal.emoji ?? "🎯"}</span>
        <h2 className="min-w-0 flex-1 text-lg font-bold">{goal.title}</h2>
        {isAdult ? <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={onEdit} aria-label="Change goal"><Pencil className="size-5" /></Button> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {who.length ? who.map((m) => (
          <span key={m.id} className="flex items-center gap-1.5 rounded-full bg-[var(--surface)] py-1 pl-1 pr-3">
            <MemberAvatar member={m} size="sm" className="size-6 text-[10px] ring-0 ring-offset-0" /> {m.display_name}
          </span>
        )) : <span className="rounded-full bg-[var(--surface)] px-3 py-1">The whole family</span>}
        {goal.due_on ? <span className="text-muted-foreground">By {new Date(goal.due_on + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</span> : null}
        {goal.stars ? <span className="flex items-center gap-1 font-semibold text-[var(--status-amber)]"><Star className="size-4 fill-current" /> {goal.stars} stars each</span> : null}
      </div>

      <ProgressBar ratio={goal.done_at ? 1 : ratio} className="h-4" />

      {goal.done_at ? (
        <div className="rounded-2xl bg-[var(--status-green-soft)] p-4 text-center">
          <PartyPopper className="mx-auto size-8 text-[var(--status-green)]" />
          <p className="mt-1 text-lg font-bold">Goal reached!</p>
          <p className="text-sm text-muted-foreground">{new Date(goal.done_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
          {goal.stars ? <p className="mt-1 text-xs text-muted-foreground">Stars are spent in Pocket Money (coming soon).</p> : null}
          {isAdult ? <Button variant="ghost" className="mt-2 h-10 rounded-full" onClick={reopen}>Not finished after all</Button> : null}
        </div>
      ) : ready ? (
        <div className="rounded-2xl bg-[var(--status-amber-soft)] p-4 text-center">
          <p className="font-bold">Ready to celebrate!</p>
          {isAdult ? (
            <Button className="mt-2 h-12 rounded-full px-6 text-base font-semibold" onClick={celebrate}><PartyPopper className="size-5" /> Goal reached!</Button>
          ) : <p className="text-sm">Ask a grown-up to confirm it.</p>}
        </div>
      ) : null}

      {goal.target ? (
        <div className="space-y-2">
          <p className="text-center text-2xl font-bold">{goal.progress} <span className="text-base font-medium text-muted-foreground">of {goal.target}{goal.unit ? ` ${goal.unit}` : ""}</span></p>
          {!locked ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" size="icon" className="size-12 rounded-full" onClick={() => changeProgress(goal.progress - 1)} aria-label="One less" disabled={goal.progress <= 0}><Minus className="size-5" /></Button>
              <Button className="h-12 rounded-full px-6 text-base font-semibold" onClick={() => changeProgress(goal.progress + 1)}><Plus className="size-5" /> Add 1</Button>
              <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (setTo !== "") { void changeProgress(Number(setTo)); setSetTo(""); } }}>
                <Input type="number" inputMode="numeric" min={0} value={setTo} onChange={(e) => setSetTo(e.target.value)} placeholder="Set to" className="h-12 w-24" aria-label="Set progress to" />
                <Button type="submit" variant="outline" className="h-12 rounded-full" disabled={setTo === ""}>Set</Button>
              </form>
            </div>
          ) : null}
        </div>
      ) : null}

      {steps.length ? (
        <div>
          <h3 className="mb-2 text-sm font-bold">Steps</h3>
          <ul className="space-y-1.5">
            {steps.map((s) => (
              <li key={s.id}>
                <button type="button" disabled={locked} onClick={() => tick(s)} aria-pressed={!!s.done_at}
                  className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-[var(--surface)] px-3 text-left disabled:opacity-70">
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border-2", s.done_at ? "border-transparent bg-[var(--status-green)] text-white" : "border-[var(--surface-border)]")}>
                    {s.done_at ? <Check className="size-4" /> : null}
                  </span>
                  <span className={cn("flex-1 font-medium", s.done_at && "text-muted-foreground line-through")}>{s.text}</span>
                  {s.done_by ? <span className="text-xs text-muted-foreground">{members.find((m) => m.id === s.done_by)?.display_name}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** A short burst of colour (CSS only) */
function Confetti() {
  const colours = ["var(--ev-birthday)", "var(--ev-school)", "var(--ev-activity)", "var(--ev-social)", "var(--ev-reminder)", "var(--ev-trip)"];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-4 z-10 h-64 overflow-hidden">
      <style>{"@keyframes lx-confetti{0%{transform:translateY(-20px) rotate(0)}100%{transform:translateY(260px) rotate(540deg);opacity:0}}"}</style>
      {Array.from({ length: 36 }, (_, n) => (
        <span key={n} className="absolute top-0 block h-3 w-2 rounded-sm"
          style={{ left: `${(n * 37) % 100}%`, background: colours[n % colours.length], animation: `lx-confetti ${1.6 + (n % 5) * 0.35}s ease-in ${(n % 7) * 0.12}s forwards` }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- set up or change a goal (grown-ups)

function GoalEditor({ goal, steps, onClose, onSaved }: { goal: Goal | "new" | null; steps: GoalStep[]; onClose: () => void; onSaved: (id: string) => void }) {
  const { family, members } = useFamilyState();
  const qc = useQueryClient();
  const existing = goal && goal !== "new" ? goal : null;
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("🎯");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [due, setDue] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [stars, setStars] = useState("0");
  const [stepList, setStepList] = useState<{ id?: string; text: string }[]>([]);
  const [newStep, setNewStep] = useState("");
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<Goal | "new" | null>(null);
  if (goal !== seen) {
    setSeen(goal);
    setTitle(existing?.title ?? "");
    setEmoji(existing?.emoji ?? "🎯");
    setTarget(existing?.target ? String(existing.target) : "");
    setUnit(existing?.unit ?? "");
    setDue(existing?.due_on ?? "");
    setPeople(existing?.people ?? []);
    setStars(String(existing?.stars ?? 0));
    setStepList(steps.map((s) => ({ id: s.id, text: s.text })));
    setNewStep("");
  }

  async function save() {
    if (!title.trim()) return;
    if (!target && stepList.length === 0 && !newStep.trim()) { toast.error("Add a number to reach, or some steps"); return; }
    setBusy(true);
    try {
      const fields = {
        title: title.trim().slice(0, 100), emoji, target: target ? Math.max(1, Number(target)) : null, unit: unit.trim() || null,
        due_on: due || null, people, stars: Math.max(0, Math.min(100, Number(stars) || 0)),
      };
      let id = existing?.id;
      if (existing) {
        const { error } = await supabase.from("board_goals").update(fields).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("board_goals").insert({ family_id: family.id, ...fields }).select("id").single();
        if (error || !data) throw error;
        id = data.id;
      }
      const all = newStep.trim() ? [...stepList, { text: newStep.trim() }] : stepList;
      const keep = new Set(all.filter((s) => s.id).map((s) => s.id));
      const gone = steps.filter((s) => !keep.has(s.id)).map((s) => s.id);
      if (gone.length) {
        const { error } = await supabase.from("board_goal_steps").delete().in("id", gone);
        if (error) throw error;
      }
      for (const [n, s] of all.entries()) {
        const old = steps.find((x) => x.id === s.id);
        if (old) {
          if (old.text !== s.text || old.position !== n) {
            const { error } = await supabase.from("board_goal_steps").update({ text: s.text, position: n }).eq("id", old.id);
            if (error) throw error;
          }
        } else {
          const { error } = await supabase.from("board_goal_steps").insert({ goal_id: id!, family_id: family.id, text: s.text.slice(0, 200), position: n });
          if (error) throw error;
        }
      }
      await refreshBoard(qc, family.id);
      onSaved(id!);
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!existing) return;
    const { error } = await supabase.from("board_goals").update({ archived_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) { toast.error(friendlyError(error)); return; }
    await refreshBoard(qc, family.id);
    onClose();
    toast("Goal put away", {
      action: { label: "Undo", onClick: async () => { await supabase.from("board_goals").update({ archived_at: null }).eq("id", existing.id); await refreshBoard(qc, family.id); } },
    });
  }

  return (
    <Sheet open={!!goal} onOpenChange={(o) => !o && onClose()} title={existing ? "Change goal" : "New family goal"} wide
      footer={
        <>
          {existing ? <Button variant="ghost" className="h-11 rounded-full" onClick={archive}><Archive className="size-4" /> Put away</Button> : null}
          <span className="flex-1" />
          <Button className="h-11 rounded-full px-6 font-semibold" onClick={save} disabled={busy || !title.trim()}>{busy ? <Loader2 className="size-4 animate-spin" /> : null} Save</Button>
        </>
      }>
      <div className="space-y-4">
        <Field label="Goal"><Input data-autofocus autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Read 50 books" className="h-12 text-base" /></Field>
        <Field label="Picture">
          <div className="flex flex-wrap gap-1.5">
            {GOAL_EMOJIS.map((e) => (
              <button key={e} type="button" aria-pressed={emoji === e} onClick={() => setEmoji(e)}
                className={cn("grid size-11 place-items-center rounded-full text-xl", emoji === e ? "bg-[var(--tile-active)]" : "bg-[var(--surface)]")}>{e}</button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Number to reach" hint="Leave empty to use steps only"><Input type="number" inputMode="numeric" min={1} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="50" className="h-12" /></Field>
          <Field label="Of what"><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="books" className="h-12" /></Field>
        </div>
        <Field label="Steps (optional)">
          <ul className="space-y-1.5">
            {stepList.map((s, n) => (
              <li key={s.id ?? `new-${n}`} className="flex items-center gap-2">
                <Input value={s.text} onChange={(e) => setStepList((l) => l.map((x, i) => (i === n ? { ...x, text: e.target.value } : x)))} className="h-11" aria-label={`Step ${n + 1}`} />
                <Button variant="ghost" size="icon" className="size-10 rounded-full" aria-label="Remove step" onClick={() => setStepList((l) => l.filter((_, i) => i !== n))}><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
          <form className="mt-1.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newStep.trim()) { setStepList((l) => [...l, { text: newStep.trim() }]); setNewStep(""); } }}>
            <Input value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder="Join the library" className="h-11" aria-label="New step" />
            <Button type="submit" variant="outline" className="h-11 rounded-full" disabled={!newStep.trim()}><Plus className="size-4" /> Step</Button>
          </form>
        </Field>
        <Field label="Who it's for" hint="Nobody picked = the whole family"><PeoplePicker members={members} value={people} onChange={setPeople} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Finish by (optional)"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-12" /></Field>
          <Field label="Stars each when reached"><Input type="number" inputMode="numeric" min={0} max={100} value={stars} onChange={(e) => setStars(e.target.value)} className="h-12" /></Field>
        </div>
      </div>
    </Sheet>
  );
}
