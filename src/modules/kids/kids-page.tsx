// Kids' Space: a little space for each child. Screen time (the rules and "can I have more time?"), growing up
// (milestones and heights) and all about me. Grown-ups pick a child at the top; a child sees their own.
import { useQueryClient } from "@tanstack/react-query";
import { Clock, Ruler, Smile, Sparkles, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { takeLinkParams } from "@/lib/link-params";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Empty, Field, Sheet, Tabs } from "@/modules/calendar/ui";

import { AskCard } from "./ask-card";
import {
  MILESTONE_IDEAS, QUESTIONS, RULE_IDEAS, ageOn, dateWords, errMsg, refreshKids, todayIn, useAbout, useAsks, useChildren,
  useKidsLive, useMilestones, useRules, type Milestone,
} from "./data";

type Tab = "screen" | "growing" | "about";

function fromUrl(): { tab?: Tab; child?: string } {
  const p = takeLinkParams();
  const t = p.get("tab");
  return { tab: t === "screen" || t === "growing" || t === "about" ? t : undefined, child: p.get("child") ?? undefined };
}

export function KidsPage() {
  useKidsLive();
  const { role } = useFamilyState();
  const first = useMemo(fromUrl, []);
  const kids = useChildren();
  const [tab, setTab] = useState<Tab>(first.tab ?? (role === "child" ? "screen" : "growing"));
  const [pick, setPick] = useState<string | null>(first.child ?? null);
  const child = kids.find((k) => k.id === pick) ?? kids[0] ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Tabs<Tab> value={tab} onChange={setTab} items={[
        { key: "screen", label: "Screen time", icon: Clock }, { key: "growing", label: "Growing up", icon: Sparkles }, { key: "about", label: "All about me", icon: Smile },
      ]} />
      {role !== "child" && kids.length > 1 ? (
        <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1" data-testid="kid-pick">
          {kids.map((k) => (
            <Chip key={k.id} on={child?.id === k.id} onClick={() => setPick(k.id)} className="min-h-11 shrink-0 text-base">
              <MemberAvatar member={k} size="sm" className="size-6 ring-0 ring-offset-0" /> {k.display_name}
            </Chip>
          ))}
        </div>
      ) : null}
      <Windows>
        <RecordsWindow className="flex flex-col gap-4">
          {!child ? (
            <Empty icon={Smile} title="No children yet">Add a child in Family settings (they don't need their own login) and they get their own space here.</Empty>
          ) : tab === "screen" ? <ScreenTime key={child.id} child={child} /> : tab === "growing" ? <Growing key={child.id} child={child} /> : <AboutMe key={child.id} child={child} />}
        </RecordsWindow>
      </Windows>
    </div>
  );
}

// ---------------------------------------------------------------- screen time

function ScreenTime({ child }: { child: Member }) {
  const { family, me, role } = useFamilyState();
  const qc = useQueryClient();
  const rules = useRules(child.id).data ?? [];
  const asks = useAsks(child.id).data ?? [];
  const isMe = child.id === me.id;
  const parent = role === "parent";
  const [adding, setAdding] = useState(false);
  const [asking, setAsking] = useState(false);
  const open = asks.find((a) => a.status === "asked" && Date.parse(a.created_at) > Date.now() - 3 * 3600_000);
  const latest = asks[0];

  async function addRule(emoji: string | null, title: string) {
    if (rules.some((r) => r.title.toLowerCase() === title.toLowerCase())) return void toast("Already a rule");
    const { error } = await supabase.from("kid_rules").insert({ family_id: family.id, child_id: child.id, emoji, title, position: Date.now() / 1000 });
    if (error) return void toast.error(errMsg(error));
    await refreshKids(qc, family.id);
  }
  async function removeRule(id: string) {
    const { error } = await supabase.from("kid_rules").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) return void toast.error(errMsg(error));
    await refreshKids(qc, family.id);
  }

  return (
    <>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">{isMe ? "My screen time rules" : `${child.display_name}'s screen time rules`}</h2>
        {rules.length ? (
          <ul className="space-y-1.5">
            {rules.map((r) => (
              <li key={r.id} data-testid="kid-rule" className="glass-tile flex min-h-14 items-center gap-3 px-3 py-2">
                <span className="text-2xl" aria-hidden>{r.emoji ?? "📏"}</span>
                <span className="min-w-0 flex-1 text-base font-semibold">{r.title}</span>
                {parent ? <button type="button" aria-label={`Remove rule: ${r.title}`} onClick={() => void removeRule(r.id)} className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-4" /></button> : null}
              </li>
            ))}
          </ul>
        ) : <p className="text-base text-muted-foreground">{parent ? "No rules yet. Add a few so everyone knows where they stand." : "No rules set yet."}</p>}
        {parent ? <Button variant="outline" data-testid="rule-add" className="h-11 rounded-full" onClick={() => setAdding(true)}>Add a rule</Button> : null}
        {role !== "child" ? <p className="text-xs text-muted-foreground">These are the household's rules. Luex can't switch devices off; use the phone's own screen time settings for that.</p> : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">{isMe ? "Want more time?" : "Asks for more time"}</h2>
        {open ? (
          <AskCard ask={open} child={child} canAnswer={parent} />
        ) : latest && latest.status !== "asked" && latest.status !== "lapsed" ? (
          <p className="rounded-2xl bg-[var(--surface)] p-3 text-base" data-testid="ask-answer">
            {latest.status === "yes" ? `✅ Yes, ${latest.minutes} more minutes` : "❌ Not this time"} <span className="text-sm text-muted-foreground">({new Date(latest.answered_at ?? latest.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: family.timezone })})</span>
          </p>
        ) : !isMe ? <p className="text-base text-muted-foreground">Nothing asked today.</p> : null}
        {isMe && !open ? <Button data-testid="ask-open" className="h-14 rounded-full px-6 text-lg font-semibold" onClick={() => setAsking(true)}>🙏 Ask for more time</Button> : null}
      </section>

      <Sheet open={adding} onOpenChange={setAdding} title="Add a rule">
        {adding ? <RuleForm onAdd={async (e, t) => { await addRule(e, t); setAdding(false); }} /> : null}
      </Sheet>
      <Sheet open={asking} onOpenChange={setAsking} title="Ask for more time">
        {asking ? <AskForm child={child} onDone={() => setAsking(false)} /> : null}
      </Sheet>
    </>
  );
}

function RuleForm({ onAdd }: { onAdd: (emoji: string | null, title: string) => Promise<void> }) {
  const [v, setV] = useState("");
  return (
    <div className="space-y-4">
      <Field label="Ready-made">
        <div className="flex flex-wrap gap-2">{RULE_IDEAS.map((r) => <Chip key={r.title} on={false} onClick={() => void onAdd(r.emoji, r.title)} className="min-h-11 text-base">{r.emoji} {r.title}</Chip>)}</div>
      </Field>
      <Field label="Or write your own">
        <div className="flex gap-2">
          <Input data-testid="rule-new" value={v} maxLength={120} onChange={(e) => setV(e.target.value)} placeholder="Tablet only in the living room" className="h-12 text-base" />
          <Button className="h-12 rounded-full" disabled={!v.trim()} onClick={() => void onAdd(null, v.trim())}>Add</Button>
        </div>
      </Field>
    </div>
  );
}

function AskForm({ child, onDone }: { child: Member; onDone: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [minutes, setMinutes] = useState(30);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    const { error } = await supabase.from("kid_asks").insert({ family_id: family.id, child_id: child.id, minutes, reason: reason.trim() });
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    await refreshKids(qc, family.id);
    toast.success("Asked. You'll hear back soon");
    onDone();
  }
  return (
    <div className="space-y-4">
      <Field label="How much more?">
        <div className="flex gap-2">{[15, 30, 60].map((m) => <Chip key={m} on={minutes === m} onClick={() => setMinutes(m)} className="min-h-14 flex-1 justify-center text-lg">{m === 60 ? "1 hour" : `${m} min`}</Chip>)}</div>
      </Field>
      <Field label="Why?" hint="Optional"><Input data-testid="ask-reason" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} placeholder="To finish my game" className="h-12 text-base" /></Field>
      <Button data-testid="ask-send" className="h-14 w-full rounded-full text-lg font-semibold" disabled={busy} onClick={() => void send()}>{busy ? "Asking…" : "Ask"}</Button>
    </div>
  );
}

// ---------------------------------------------------------------- growing up

function Growing({ child }: { child: Member }) {
  const { me, role } = useFamilyState();
  const list = useMilestones(child.id).data ?? [];
  const [edit, setEdit] = useState<Milestone | "new" | "height" | null>(null);
  const grownUp = role !== "child";
  const isMe = child.id === me.id;
  const canAdd = grownUp || isMe;
  const heights = list.filter((m) => m.height_cm != null);
  const tallest = heights[0];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-lg font-bold">{isMe ? "Growing up" : `${child.display_name} growing up`}</h2>
        {canAdd ? (
          <>
            <Button variant="outline" data-testid="height-add" className="h-11 rounded-full" onClick={() => setEdit("height")}><Ruler className="size-4" /> Height</Button>
            <Button data-testid="milestone-add" className="h-11 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}>⭐ Milestone</Button>
          </>
        ) : null}
      </div>
      {tallest ? (
        <p className="rounded-2xl bg-[var(--surface)] p-3 text-base" data-testid="height-now">
          📏 <strong>{Number(tallest.height_cm)} cm</strong> on {dateWords(tallest.on_date)}
          {heights[1] ? <span className="text-muted-foreground"> · grown {(Number(tallest.height_cm) - Number(heights[1].height_cm)).toFixed(1).replace(/\.0$/, "")} cm since {dateWords(heights[1].on_date)}</span> : null}
        </p>
      ) : null}
      {list.length ? (
        <ol className="space-y-2">
          {list.map((m) => {
            const age = ageOn(child.birthday, m.on_date);
            const mine = role === "parent" || m.created_by === me.id;
            return (
              <li key={m.id}>
                <button type="button" disabled={!mine} data-testid="milestone-row" onClick={() => setEdit(m)} className="glass-tile flex w-full items-center gap-3 p-3 text-left disabled:cursor-default">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--surface)] text-2xl" aria-hidden>{m.emoji ?? (m.height_cm != null ? "📏" : "⭐")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">{m.title}{m.height_cm != null ? ` · ${Number(m.height_cm)} cm` : ""}</span>
                    <span className="block text-sm text-muted-foreground">{dateWords(m.on_date)}{age ? ` · aged ${age}` : ""}</span>
                    {m.notes ? <span className="block whitespace-pre-wrap text-sm">{m.notes}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <Empty icon={Sparkles} title="Nothing yet">
          {canAdd ? "Keep the big moments (first steps, a lost tooth, riding a bike) and how tall they are, with their age worked out." : "When someone adds a milestone it shows here."}
        </Empty>
      )}
      {!child.birthday && grownUp ? <p className="text-xs text-muted-foreground">Add {child.display_name}'s birthday in Family settings to see their age on each milestone.</p> : null}
      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} title={edit === "height" ? "How tall?" : edit === "new" ? "Add a milestone" : "Change the milestone"}>
        {edit !== null ? <MilestoneForm key={typeof edit === "string" ? edit : edit.id} child={child} existing={typeof edit === "string" ? null : edit} height={edit === "height" || (typeof edit !== "string" && edit.height_cm != null)} onClose={() => setEdit(null)} /> : null}
      </Sheet>
    </>
  );
}

function MilestoneForm({ child, existing, height, onClose }: { child: Member; existing: Milestone | null; height: boolean; onClose: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const [title, setTitle] = useState(existing?.title ?? (height ? "Measured" : ""));
  const [emoji, setEmoji] = useState<string | null>(existing?.emoji ?? (height ? "📏" : "⭐"));
  const [on, setOn] = useState(existing?.on_date ?? today);
  const [cm, setCm] = useState(existing?.height_cm != null ? String(existing.height_cm) : "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const cmNum = cm ? Number(cm) : null;
  const cmOk = !height || (cmNum != null && cmNum >= 30 && cmNum <= 250);

  async function save() {
    setBusy(true);
    try {
      const row = { title: title.trim(), emoji, on_date: on, height_cm: height ? Math.round(cmNum! * 10) / 10 : null, notes: notes.trim() };
      const { error } = existing
        ? await supabase.from("kid_milestones").update(row).eq("id", existing.id)
        : await supabase.from("kid_milestones").insert({ ...row, family_id: family.id, child_id: child.id });
      if (error) throw error;
      await refreshKids(qc, family.id);
      toast.success(height ? "Height saved" : "🎉 Saved");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!existing) return;
    const { error } = await supabase.from("kid_milestones").update({ deleted_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) return void toast.error(errMsg(error));
    await refreshKids(qc, family.id);
    onClose();
  }

  return (
    <div className="space-y-4">
      {height ? (
        <Field label="Height in cm"><Input data-testid="height-cm" data-autofocus type="number" inputMode="decimal" min={30} max={250} step={0.5} value={cm} onChange={(e) => setCm(e.target.value)} placeholder="112" className="h-12 w-32 text-lg" /></Field>
      ) : (
        <>
          {!existing ? (
            <Field label="Ideas">
              <div className="flex flex-wrap gap-2">{MILESTONE_IDEAS.map((m) => <Chip key={m.title} on={title === m.title} onClick={() => { setTitle(m.title); setEmoji(m.emoji); }} className="min-h-11 text-base">{m.emoji} {m.title}</Chip>)}</div>
            </Field>
          ) : null}
          <Field label="What happened?"><Input data-testid="milestone-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Learned to tie shoelaces" className="h-12 text-base" /></Field>
        </>
      )}
      <Field label="When"><Input data-testid="milestone-date" type="date" value={on} max={today} min={child.birthday ?? undefined} onChange={(e) => setOn(e.target.value)} className="h-12 w-44 text-base" /></Field>
      {!height ? (
        <Field label="Notes" hint="Optional">
          <textarea value={notes} maxLength={300} rows={2} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-testid="milestone-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !title.trim() || !on || !cmOk} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
        {existing ? <Button variant="ghost" className="h-12 rounded-full text-[var(--status-red)]" onClick={() => void remove()}><Trash2 className="size-4" /> Remove</Button> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- all about me

function AboutMe({ child }: { child: Member }) {
  const { family, me, role } = useFamilyState();
  const qc = useQueryClient();
  const about = useAbout(child.id);
  const answers = (about.data?.answers ?? {}) as Record<string, string>;
  const isMe = child.id === me.id;
  const canEdit = isMe || role === "parent";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const filled = QUESTIONS.filter((q) => answers[q.key]);

  function start() { setDraft({ ...answers }); setEditing(true); }
  async function save() {
    setBusy(true);
    const clean: Record<string, string> = {};
    for (const q of QUESTIONS) { const v = (draft[q.key] ?? "").trim().slice(0, 80); if (v) clean[q.key] = v; }
    const { error } = about.data
      ? await supabase.from("kid_about").update({ answers: clean }).eq("child_id", child.id)
      : await supabase.from("kid_about").insert({ family_id: family.id, child_id: child.id, answers: clean });
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    await refreshKids(qc, family.id);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold">{isMe ? "All about me" : `All about ${child.display_name}`}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {QUESTIONS.map((q) => (
            <Field key={q.key} label={`${q.emoji} ${q.label}`}>
              <Input data-testid={`about-${q.key}`} value={draft[q.key] ?? ""} maxLength={80} onChange={(e) => setDraft({ ...draft, [q.key]: e.target.value })} placeholder={q.placeholder} className="h-12 text-base" />
            </Field>
          ))}
        </div>
        <div className="flex gap-2">
          <Button data-testid="about-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
          <Button variant="outline" className="h-12 rounded-full" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <MemberAvatar member={child} size="lg" className="ring-0 ring-offset-0" />
        <h2 className="flex-1 text-xl font-bold">{isMe ? "All about me" : `All about ${child.display_name}`}{child.birthday ? <span className="block text-sm font-normal text-muted-foreground">Aged {ageOn(child.birthday, todayIn(family.timezone))}</span> : null}</h2>
        {canEdit ? <Button variant="outline" data-testid="about-edit" className="h-11 rounded-full" onClick={start}>{filled.length ? "Change" : "Fill in"}</Button> : null}
      </div>
      {filled.length ? (
        <ul className="grid gap-2 sm:grid-cols-2" data-testid="about-list">
          {filled.map((q) => (
            <li key={q.key} className={cn("glass-tile flex items-center gap-3 p-3")}>
              <span className="text-3xl" aria-hidden>{q.emoji}</span>
              <span className="min-w-0">
                <span className="block text-sm text-muted-foreground">{q.label}</span>
                <span className="block text-lg font-semibold">{answers[q.key]}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="text-base text-muted-foreground">{canEdit ? "Favourite things, best friend, what they want to be. Grandparents love this." : "Nothing filled in yet."}</p>}
    </>
  );
}
