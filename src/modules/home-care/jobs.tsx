// Yearly and seasonal jobs: boiler service, smoke alarms, gutters. Each has its own "every so many months"; tick it when
// it's done and the next date sets itself. Nothing piles up: a missed job just shows as due.
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Phone, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { Chip, Empty, Field, Sheet } from "@/modules/calendar/ui";

import { STARTER_JOBS, addDays, daysBetween, errMsg, everyWords, refreshHome, shortDate, todayIn, useContactList, useJobHistory, useJobs, type Job } from "./data";

const EVERY = [1, 3, 6, 12, 24, 60];

export function JobsTab() {
  const { family, members, role } = useFamilyState();
  const q = useJobs();
  const today = todayIn(family.timezone);
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Job | "new" | null>(null);
  const [starter, setStarter] = useState(false);
  const grownUp = role !== "child";
  const jobs = q.data ?? [];
  const open = jobs.find((j) => j.id === openId) ?? null;
  const groups = [
    { key: "due", title: "Due now", list: jobs.filter((j) => j.next_due <= today) },
    { key: "soon", title: "In the next month", list: jobs.filter((j) => j.next_due > today && j.next_due <= addDays(today, 31)) },
    { key: "later", title: "Later", list: jobs.filter((j) => j.next_due > addDays(today, 31)) },
  ].filter((g) => g.list.length);

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Yearly jobs</h2>
          {grownUp ? <Button variant="outline" data-testid="job-starter" className="h-11 rounded-full" onClick={() => setStarter(true)}>Ideas</Button> : null}
          {grownUp ? <Button data-testid="job-add" className="h-11 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-5" /> Job</Button> : null}
        </div>
        {q.isLoading ? null : !groups.length ? (
          <Empty icon={CalendarClock} title="No jobs yet">
            {grownUp ? "Tap Ideas to switch on the usual ones (boiler service, smoke alarms, gutters), or add your own. You'll be reminded a week before." : "A grown-up can add the jobs here."}
          </Empty>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.key}>
                <h3 className={cn("mb-2 text-sm font-bold", g.key === "due" && "text-[var(--status-red)]")}>{g.title}</h3>
                <ul className="space-y-2">
                  {g.list.map((j) => {
                    const who = members.find((m) => m.id === j.who);
                    const n = daysBetween(today, j.next_due);
                    return (
                      <li key={j.id}>
                        <button type="button" data-testid="job-row" onClick={() => setOpenId(j.id)} className={cn("glass-tile flex w-full items-center gap-3 p-3 text-left", openId === j.id && "ring-2 ring-[var(--status-blue)]")}>
                          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--surface)] text-xl" aria-hidden>{j.emoji ?? "🛠️"}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-base font-semibold">{j.title}</span>
                            <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                              <span className={cn(n < 0 && "font-semibold text-[var(--status-red)]")}>{n < 0 ? `Was due ${shortDate(j.next_due)}` : n === 0 ? "Due today" : `Due ${shortDate(j.next_due)}`}</span>
                              {who ? <span className="inline-flex items-center gap-1"><MemberAvatar member={who} size="sm" className="size-5 ring-0 ring-offset-0" />{who.display_name}</span> : null}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </RecordsWindow>
      <DetailWindow>
        {open ? <JobDetail j={open} canEdit={grownUp} onEdit={() => setEdit(open)} /> : <p className="text-sm text-muted-foreground">Tap a job to tick it done or see when it was last done.</p>}
      </DetailWindow>
      <JobViewSheet j={open} canEdit={grownUp} onEdit={() => open && setEdit(open)} onClose={() => setOpenId(null)} />
      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} title={edit === "new" ? "Add a job" : "Change the job"}>
        {edit !== null ? <JobForm key={edit === "new" ? "new" : edit.id} existing={edit === "new" ? null : edit} today={today} onClose={() => setEdit(null)} /> : null}
      </Sheet>
      <Sheet open={starter} onOpenChange={setStarter} title="Jobs most homes need">
        {starter ? <StarterList existing={jobs} today={today} onClose={() => setStarter(false)} /> : null}
      </Sheet>
    </Windows>
  );
}

function JobDetail({ j, canEdit, onEdit }: { j: Job; canEdit: boolean; onEdit: () => void }) {
  const { family, members } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const history = useJobHistory(j.id).data ?? [];
  const contact = useContactList().data?.find((c) => c.id === j.contact_id);
  const [doneOn, setDoneOn] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function tick() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("hc_job_tick", { p_job: j.id, p_done_on: doneOn, p_note: note });
      if (error) throw error;
      await refreshHome(qc, family.id);
      setNote("");
      toast.success(`Done. Next one ${shortDate(String(data))}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="job-detail">
      <div>
        <h3 className="text-xl font-bold">{j.emoji} {j.title}</h3>
        <p className="text-sm text-muted-foreground">{everyWords(j.every_months)} · next {shortDate(j.next_due)}{j.last_done_on ? ` · last done ${shortDate(j.last_done_on)}` : ""}</p>
      </div>
      {contact ? (
        <a href={contact.phone ? `tel:${contact.phone.replace(/[^\d+]/g, "")}` : undefined} className="glass-tile flex min-h-12 items-center gap-2 p-3 font-semibold">
          <Phone className="size-5" /> {contact.name}{contact.phone ? ` · ${contact.phone}` : ""}
        </a>
      ) : null}
      {j.notes ? <p className="whitespace-pre-wrap rounded-2xl bg-[var(--surface)] p-3 text-sm">{j.notes}</p> : null}
      {canEdit ? (
        <section className="glass-tile space-y-2 p-3">
          <h4 className="font-bold">Done it?</h4>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="When"><Input data-testid="job-done-on" type="date" max={today} value={doneOn} onChange={(e) => setDoneOn(e.target.value)} className="h-11 w-44 text-base" /></Field>
            <Field label="Note" hint="Optional"><Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Gary came, all fine" className="h-11 w-56 text-base" /></Field>
          </div>
          <Button data-testid="job-tick" className="h-12 w-full rounded-full text-base font-semibold" disabled={busy || !doneOn} onClick={() => void tick()}><Check className="size-5" /> Done</Button>
        </section>
      ) : null}
      {history.length ? (
        <section>
          <h4 className="mb-1 text-sm font-bold">Done before</h4>
          <ul className="space-y-1 text-sm">
            {history.map((h) => <li key={h.id}>{shortDate(h.done_on)}{h.note ? `: ${h.note}` : ""}{members.find((m) => m.id === h.done_by) ? ` (${members.find((m) => m.id === h.done_by)!.display_name})` : ""}</li>)}
          </ul>
        </section>
      ) : null}
      {canEdit ? <Button variant="outline" className="h-11 w-full rounded-full" onClick={onEdit}>Change</Button> : null}
    </div>
  );
}

function JobViewSheet({ j, canEdit, onEdit, onClose }: { j: Job | null; canEdit: boolean; onEdit: () => void; onClose: () => void }) {
  const wide = useDesktop();
  if (wide) return null;
  return (
    <Sheet open={!!j} onOpenChange={(o) => !o && onClose()} title={j?.title ?? ""}>
      {j ? <JobDetail j={j} canEdit={canEdit} onEdit={() => { onClose(); onEdit(); }} /> : null}
    </Sheet>
  );
}

function JobForm({ existing, today, onClose }: { existing: Job | null; today: string; onClose: () => void }) {
  const { family, members, isParent } = useFamilyState();
  const qc = useQueryClient();
  const contacts = useContactList().data ?? [];
  const [title, setTitle] = useState(existing?.title ?? "");
  const [emoji, setEmoji] = useState(existing?.emoji ?? "🛠️");
  const [every, setEvery] = useState(existing?.every_months ?? 12);
  const [next, setNext] = useState(existing?.next_due ?? today);
  const [who, setWho] = useState<string | null>(existing?.who ?? null);
  const [contactId, setContactId] = useState<string | null>(existing?.contact_id ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const people = members.filter((m) => !m.archived_at && (m.role !== "child" || isParent));

  async function save() {
    setBusy(true);
    try {
      const row = { title: title.trim(), emoji: emoji.trim() || null, every_months: every, next_due: next, who, contact_id: contactId, notes: notes.trim() };
      const { error } = existing
        ? await supabase.from("hc_jobs").update(row).eq("id", existing.id)
        : await supabase.from("hc_jobs").insert({ ...row, family_id: family.id });
      if (error) throw error;
      await refreshHome(qc, family.id);
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing || !window.confirm(`Remove ${existing.title}?`)) return;
    const { error } = await supabase.from("hc_jobs").update({ archived_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) return void toast.error(errMsg(error));
    await refreshHome(qc, family.id);
    onClose();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Field label="Emoji"><Input value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} className="h-12 w-16 text-center text-xl" /></Field>
        <div className="flex-1"><Field label="Job"><Input data-testid="job-title" data-autofocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Boiler service" className="h-12 text-base" /></Field></div>
      </div>
      <Field label="How often?">
        <div className="flex flex-wrap gap-2">{EVERY.map((n) => <Chip key={n} on={every === n} onClick={() => setEvery(n)} className="min-h-11 text-base">{everyWords(n)}</Chip>)}</div>
      </Field>
      <Field label="Next due"><Input data-testid="job-next" type="date" value={next} onChange={(e) => setNext(e.target.value)} className="h-12 w-48 text-base" /></Field>
      <Field label="Who looks after it?" hint="They get the reminder. Pick nobody and every grown-up does.">
        <div className="flex flex-wrap gap-2">
          {people.map((m) => <Chip key={m.id} on={who === m.id} onClick={() => setWho(who === m.id ? null : m.id)} className="min-h-11 text-base"><MemberAvatar member={m} size="sm" className="size-6 ring-0 ring-offset-0" /> {m.display_name}</Chip>)}
        </div>
      </Field>
      {contacts.length ? (
        <Field label="Who to call" hint="From Contacts">
          <select value={contactId ?? ""} onChange={(e) => setContactId(e.target.value || null)} className="h-12 w-full rounded-xl border border-input bg-transparent px-3 text-base">
            <option value="">Nobody yet</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      ) : null}
      <Field label="Note" hint="Optional"><Input value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} className="h-12 text-base" /></Field>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-testid="job-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !title.trim() || !next} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
        {existing ? <Button variant="ghost" className="h-12 rounded-full text-[var(--status-red)]" onClick={() => void remove()}><Trash2 className="size-4" /> Remove</Button> : null}
      </div>
    </div>
  );
}

function StarterList({ existing, today, onClose }: { existing: Job[]; today: string; onClose: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const have = new Set(existing.map((j) => j.title.toLowerCase()));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const rows = STARTER_JOBS.filter((s) => picked.has(s.title)).map((s) => ({ family_id: family.id, title: s.title, emoji: s.emoji, every_months: s.every, next_due: addDays(today, 7) }));
      const { error } = await supabase.from("hc_jobs").insert(rows);
      if (error) throw error;
      await refreshHome(qc, family.id);
      toast.success(`${rows.length} added. Change the dates to when they're really due`);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Tick the ones that apply to your home. You can change the dates after.</p>
      <ul className="space-y-1" data-testid="starter-list">
        {STARTER_JOBS.map((s) => {
          const already = have.has(s.title.toLowerCase());
          return (
            <li key={s.title}>
              <label className={cn("flex min-h-12 items-center gap-3 rounded-xl px-2", already ? "opacity-50" : "cursor-pointer hover:bg-muted")}>
                <input type="checkbox" className="size-5" disabled={already} checked={already || picked.has(s.title)}
                  onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(s.title)) n.delete(s.title); else n.add(s.title); return n; })} />
                <span className="text-xl" aria-hidden>{s.emoji}</span>
                <span className="min-w-0 flex-1"><span className="block font-semibold">{s.title}</span><span className="block text-sm text-muted-foreground">{already ? "Already added" : everyWords(s.every)}</span></span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2">
        <Button data-testid="starter-add" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !picked.size} onClick={() => void add()}>Add {picked.size || ""}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
