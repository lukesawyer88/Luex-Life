// "To do" (grown-ups) or "Homework" (children): forms, money, dress-up days and homework, each with a due day and a big tick.
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Check, ListTodo, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { useDesktop } from "@/lib/use-desktop";
import { fitJpeg } from "@/lib/image";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Empty, Field, Sheet } from "@/modules/calendar/ui";

import {
  TASK_KIND_LABEL, addDaysKey, errMsg, money, refreshSchool, shortDate, todayIn, uploadLetter, useLetterUrls, useTasks, type Task,
} from "./data";
import type { TabProps } from "./school-page";
import { TaskPhoto } from "./task-photo";

const KINDS: Task["kind"][] = ["form", "money", "dressup", "homework", "other"];
const KIND_EMOJI: Record<Task["kind"], string> = { form: "✍️", money: "💷", dressup: "🦸", homework: "📚", other: "📌" };

export function TasksTab({ target }: TabProps) {
  const { family, me, members, role, isParent } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const q = useTasks(addDaysKey(today, -14));
  const [edit, setEdit] = useState<Task | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(target.taskId ?? null);
  const child = role === "child";
  const nameOf = (id: string | null) => members.find((m) => m.id === id);

  const all = useMemo(() => {
    const list = q.data ?? [];
    return child ? list.filter((t) => t.kind === "homework" && t.member_id === me.id) : list;
  }, [q.data, child, me.id]);
  const weekEnd = addDaysKey(today, 7);
  const groups = [
    { key: "overdue", title: "Overdue", list: all.filter((t) => !t.done_at && t.due_on && t.due_on < today) },
    { key: "week", title: "This week", list: all.filter((t) => !t.done_at && (!t.due_on || (t.due_on >= today && t.due_on <= weekEnd))) },
    { key: "later", title: "Later", list: all.filter((t) => !t.done_at && t.due_on && t.due_on > weekEnd) },
    { key: "done", title: "Done", list: all.filter((t) => !!t.done_at).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? "")) },
  ].filter((g) => g.list.length);
  const open = all.find((t) => t.id === openId) ?? null;

  const canChange = (t: Task) => isParent || t.created_by === me.id;
  const canTick = (t: Task) => !child || (t.kind === "homework" && t.member_id === me.id);

  async function tick(t: Task) {
    const { error } = await supabase.from("school_tasks").update({ done_at: t.done_at ? null : new Date().toISOString() }).eq("id", t.id);
    if (error) return void toast.error(errMsg(error));
    await refreshSchool(qc, family.id);
    if (!t.done_at) toast.success("Done", { action: { label: "Undo", onClick: async () => { await supabase.from("school_tasks").update({ done_at: null }).eq("id", t.id); await refreshSchool(qc, family.id); } } });
  }

  const row = (t: Task) => {
    const who = nameOf(t.member_id);
    const overdue = !t.done_at && t.due_on && t.due_on < today;
    return (
      <li key={t.id} className={cn("glass-tile flex items-center gap-3 p-3", openId === t.id && "ring-2 ring-[var(--status-blue)]")} data-testid="task-row">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpenId(t.id)}>
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--surface)] text-xl" aria-hidden>{KIND_EMOJI[t.kind]}</span>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-base font-semibold", t.done_at && "text-muted-foreground line-through")}>{t.title}</span>
            <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              {who ? <span className="inline-flex items-center gap-1"><MemberAvatar member={who} size="sm" className="size-5 ring-0 ring-offset-0" />{who.display_name}</span> : <span>Everyone</span>}
              {t.due_on ? <span className={cn(overdue && "font-semibold text-[var(--status-red)]")}>{t.due_on === today ? "Today" : t.due_on === addDaysKey(today, 1) ? "Tomorrow" : shortDate(t.due_on)}</span> : null}
              {t.kind === "money" && t.amount != null ? <span className="font-semibold text-foreground">{money(t.amount)}</span> : null}
              {t.photo_path ? <Camera className="size-4" aria-label="Has a photo" /> : null}
            </span>
          </span>
        </button>
        {canTick(t) ? (
          <button
            type="button"
            data-testid="task-tick"
            aria-pressed={!!t.done_at}
            aria-label={t.done_at ? `Not done: ${t.title}` : `Done: ${t.title}`}
            onClick={() => void tick(t)}
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-full border-2 transition",
              t.done_at ? "border-transparent bg-[var(--status-green)] text-white" : "border-[var(--surface-border)] bg-[var(--surface)] hover:bg-muted",
            )}
          >
            <Check className="size-6" />
          </button>
        ) : null}
      </li>
    );
  };

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">{child ? "My homework" : "To do"}</h2>
          <Button data-testid="task-add" className="h-11 rounded-full px-4 text-base font-semibold" onClick={() => setEdit("new")}><Plus className="size-5" /> Add</Button>
        </div>
        {q.isLoading ? null : !groups.length ? (
          <Empty icon={ListTodo} title={child ? "No homework" : "Nothing to do"}>
            {child ? "Add your homework here and tick it when it's done." : "Add forms to sign, money to pay, dress-up days and homework. Take a photo of the letter so nobody has to find it later."}
          </Empty>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.key}>
                <h3 className={cn("mb-2 text-sm font-bold", g.key === "overdue" && "text-[var(--status-red)]")}>{g.title}</h3>
                <ul className="space-y-2">{g.list.map(row)}</ul>
              </section>
            ))}
          </div>
        )}
      </RecordsWindow>
      <DetailWindow>
        {open ? <TaskDetail t={open} canChange={canChange(open)} onEdit={() => setEdit(open)} today={today} />
          : <p className="text-sm text-muted-foreground">Tap something to see it here, with the photo of the letter if there is one.</p>}
      </DetailWindow>
      <TaskViewSheet t={open} canChange={!!open && canChange(open)} onEdit={() => open && setEdit(open)} onClose={() => setOpenId(null)} today={today} />
      <TaskEditSheet value={edit} onClose={() => setEdit(null)} />
    </Windows>
  );
}

function TaskDetail({ t, canChange, onEdit, today }: { t: Task; canChange: boolean; onEdit: () => void; today: string }) {
  const { members } = useFamilyState();
  const who = members.find((m) => m.id === t.member_id);
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold">{t.title}</h3>
      <dl className="space-y-1 text-sm">
        <div className="flex gap-2"><dt className="w-20 text-muted-foreground">What</dt><dd>{TASK_KIND_LABEL[t.kind]}</dd></div>
        <div className="flex gap-2"><dt className="w-20 text-muted-foreground">Who</dt><dd>{who?.display_name ?? "Everyone"}</dd></div>
        {t.due_on ? <div className="flex gap-2"><dt className="w-20 text-muted-foreground">Due</dt><dd>{t.due_on === today ? "Today" : shortDate(t.due_on)}</dd></div> : null}
        {t.kind === "money" && t.amount != null ? <div className="flex gap-2"><dt className="w-20 text-muted-foreground">Amount</dt><dd className="font-semibold">{money(t.amount)}</dd></div> : null}
        {t.done_at ? <div className="flex gap-2"><dt className="w-20 text-muted-foreground">Done</dt><dd>{members.find((m) => m.id === t.done_by)?.display_name ?? "Yes"}</dd></div> : null}
      </dl>
      {t.note ? <p className="whitespace-pre-wrap rounded-2xl bg-[var(--surface)] p-3 text-sm">{t.note}</p> : null}
      {t.photo_path ? <TaskPhoto path={t.photo_path} /> : null}
      {canChange ? <Button variant="outline" className="h-11 w-full rounded-full" onClick={onEdit}>Change</Button> : null}
    </div>
  );
}

/** on phones and tablets the detail opens as a sheet */
function TaskViewSheet({ t, canChange, onEdit, onClose, today }: { t: Task | null; canChange: boolean; onEdit: () => void; onClose: () => void; today: string }) {
  const wide = useDesktop();
  if (wide) return null;
  return (
    <Sheet open={!!t} onOpenChange={(o) => !o && onClose()} title={t?.title ?? ""}>
      {t ? <TaskDetail t={t} canChange={canChange} onEdit={() => { onClose(); onEdit(); }} today={today} /> : null}
    </Sheet>
  );
}

function TaskEditSheet({ value, onClose }: { value: Task | "new" | null; onClose: () => void }) {
  const open = value !== null;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={value === "new" ? "Add something to do" : "Change"}>
      {open ? <TaskForm key={value === "new" ? "new" : value.id} existing={value === "new" ? null : value} onClose={onClose} /> : null}
    </Sheet>
  );
}

function TaskForm({ existing, onClose }: { existing: Task | null; onClose: () => void }) {
  const { family, me, members, role } = useFamilyState();
  const qc = useQueryClient();
  const child = role === "child";
  const children = members.filter((m) => m.role === "child" && !m.archived_at);
  const [kind, setKind] = useState<Task["kind"]>(existing?.kind ?? (child ? "homework" : "form"));
  const [who, setWho] = useState<string | null>(existing ? existing.member_id : child ? me.id : children.length === 1 ? children[0].id : null);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [due, setDue] = useState(existing?.due_on ?? "");
  const [amount, setAmount] = useState(existing?.amount != null ? Number(existing.amount).toFixed(2) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(existing?.photo_path ?? null);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  const urls = useLetterUrls([photoPath]);

  async function save() {
    const amt = kind === "money" && amount.trim() ? Math.round(Number(amount.replace(/[£,\s]/g, "")) * 100) / 100 : null;
    if (amt != null && (!Number.isFinite(amt) || amt < 0 || amt >= 10000)) return void toast.error("Type an amount like 5.00");
    setBusy(true);
    try {
      const path = photo ? await uploadLetter(family.id, await fitJpeg(photo, 1600)) : photoPath;
      const row = {
        member_id: child ? me.id : who, title: title.trim(), kind: child ? "homework" : kind, due_on: due || null,
        amount: amt, note: note.trim(), photo_path: path,
      };
      const { error } = existing
        ? await supabase.from("school_tasks").update(row).eq("id", existing.id)
        : await supabase.from("school_tasks").insert({ ...row, family_id: family.id });
      if (error) throw error;
      await refreshSchool(qc, family.id);
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    const { error } = await supabase.from("school_tasks").update({ deleted_at: new Date().toISOString() }).eq("id", existing.id);
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    await refreshSchool(qc, family.id);
    onClose();
    toast(`${existing.title} removed`, { action: { label: "Undo", onClick: async () => { await supabase.from("school_tasks").update({ deleted_at: null }).eq("id", existing.id); await refreshSchool(qc, family.id); } } });
  }

  return (
    <div className="space-y-4">
      {!child ? (
        <Field label="What is it?">
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <Chip key={k} on={kind === k} onClick={() => setKind(k)} className="min-h-12 px-4 text-base">
                <span data-testid={`task-kind-${k}`}>{KIND_EMOJI[k]} {TASK_KIND_LABEL[k]}</span>
              </Chip>
            ))}
          </div>
        </Field>
      ) : null}
      {!child ? (
        <Field label="Who's it for?">
          <div className="flex flex-wrap gap-2" data-testid="task-child">
            <Chip on={who === null} onClick={() => setWho(null)} className="min-h-12 px-4 text-base">Everyone</Chip>
            {children.map((c) => (
              <Chip key={c.id} on={who === c.id} onClick={() => setWho(c.id)} className="min-h-12 px-4 text-base">
                <MemberAvatar member={c} size="sm" className="size-6 ring-0 ring-offset-0" /> {c.display_name}
              </Chip>
            ))}
          </div>
        </Field>
      ) : null}
      <Field label="What needs doing">
        <Input data-testid="task-title" data-autofocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "money" ? "Trip money" : kind === "dressup" ? "World Book Day" : kind === "homework" ? "Spellings" : "Sign the trip form"} className="h-12 text-base" />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Field label="By when">
          <Input data-testid="task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-12 w-44 text-base" />
        </Field>
        {kind === "money" && !child ? (
          <Field label="How much">
            <div className="flex items-center gap-1"><span className="text-lg font-bold">£</span>
              <Input data-testid="task-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-12 w-28 text-base" />
            </div>
          </Field>
        ) : null}
      </div>
      <Field label="Note" hint="Optional">
        <textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} rows={2}
          className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </Field>
      <Field label="Photo of the letter" hint="Optional. Saves hunting for it later.">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-full border border-[var(--surface-border)] bg-[var(--surface)] px-4 font-semibold hover:bg-muted">
            <Camera className="size-5" /> {photo || photoPath ? "Change photo" : "Take or choose a photo"}
            <input data-testid="task-photo" type="file" accept="image/*" capture="environment" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhoto(f); e.target.value = ""; }} />
          </label>
          {photo || photoPath ? (
            <button type="button" className="text-sm font-semibold text-muted-foreground underline" onClick={() => { setPhoto(null); setPhotoPath(null); }}>Remove photo</button>
          ) : null}
        </div>
        {preview ? <img src={preview} alt="The letter" className="mt-2 max-h-48 rounded-2xl object-contain" />
          : photoPath && urls.data?.get(photoPath) ? <img src={urls.data.get(photoPath)} alt="The letter" className="mt-2 max-h-48 rounded-2xl object-contain" /> : null}
      </Field>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-testid="task-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !title.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
        {existing ? <Button variant="ghost" className="h-12 rounded-full text-[var(--status-red)]" disabled={busy} onClick={() => void remove()}><Trash2 className="size-4" /> Remove</Button> : null}
      </div>
    </div>
  );
}
