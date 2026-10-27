// Family Health (parents only): medicine reminders with a "given" tick, check-ups and jabs, and appointments
// from the Calendar. Dates and reminders only, never medical records.
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, MapPin, Pill, Plus, Stethoscope, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { takeLinkParams } from "@/lib/link-params";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { insertEvent } from "@/modules/calendar/data";
import { dayStart } from "@/modules/calendar/time";
import { Chip, Empty, Field, Sheet, Tabs } from "@/modules/calendar/ui";

import {
  CHECK_IDEAS, TIMES, addDaysKey, dateWords, errMsg, everyWords, refreshHealth, slotsFor, todayIn, useAppointments,
  useChecks, useDoses, useHealthLive, useMeds, type Check as CheckRow, type Med,
} from "./data";
import { DoseRow } from "./dose";

type Tab = "medicine" | "checks" | "appointments";

function fromUrl(): Tab | undefined {
  const t = takeLinkParams().get("tab");
  return t === "medicine" || t === "checks" || t === "appointments" ? t : undefined;
}

export function HealthPage() {
  useHealthLive();
  const first = useMemo(fromUrl, []);
  const [tab, setTab] = useState<Tab>(first ?? "medicine");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Tabs<Tab> value={tab} onChange={setTab} items={[
        { key: "medicine", label: "Medicine", icon: Pill }, { key: "checks", label: "Check-ups and jabs", icon: Stethoscope },
        { key: "appointments", label: "Appointments", icon: CalendarClock },
      ]} />
      <Windows>
        <RecordsWindow className="flex flex-col gap-4">
          {tab === "medicine" ? <Medicine /> : tab === "checks" ? <Checks /> : <Appointments />}
        </RecordsWindow>
      </Windows>
    </div>
  );
}

// ---------------------------------------------------------------- medicine

function Medicine() {
  const { family, members } = useFamilyState();
  const today = todayIn(family.timezone);
  const meds = useMeds().data ?? [];
  const doses = useDoses(today).data ?? [];
  const slots = slotsFor(meds, doses, today);
  const [edit, setEdit] = useState<Med | "new" | null>(null);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? "";

  return (
    <>
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-lg font-bold">Today's medicine</h2>
        <Button data-testid="med-add" className="h-11 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-5" /> Medicine</Button>
      </div>
      {slots.length ? <ul className="space-y-1.5">{slots.map((s) => <DoseRow key={`${s.med.id}-${s.at}`} s={s} day={today} />)}</ul> : (
        <Empty icon={Pill} title="No medicine today">Add a reminder (antibiotics for a week, an inhaler every evening) and tick each dose when it's given, so nobody gives it twice.</Empty>
      )}
      {meds.length ? (
        <section className="space-y-1.5">
          <h3 className="text-sm font-bold text-muted-foreground">Reminders</h3>
          <ul className="space-y-1.5">
            {meds.map((m) => (
              <li key={m.id}>
                <button type="button" data-testid="med-row" onClick={() => setEdit(m)} className="glass-tile flex w-full items-center gap-3 p-3 text-left">
                  <span className="text-xl" aria-hidden>💊</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{m.name} for {nameOf(m.person_id)}</span>
                    <span className="block truncate text-sm text-muted-foreground">{m.times.join(", ")} · {m.end_on ? `until ${dateWords(m.end_on)}` : "ongoing"}{m.start_on > today ? ` · starts ${dateWords(m.start_on)}` : ""}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="text-xs text-muted-foreground">Always follow the label or your doctor's instructions. Luex only reminds you; it never suggests how much to give.</p>
      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} title={edit === "new" ? "Add a medicine reminder" : "Change the reminder"}>
        {edit !== null ? <MedForm key={edit === "new" ? "new" : edit.id} existing={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
      </Sheet>
    </>
  );
}

function MedForm({ existing, onClose }: { existing: Med | null; onClose: () => void }) {
  const { family, members, me } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const people = members.filter((m) => !m.archived_at);
  const parents = people.filter((m) => m.role === "parent" && m.user_id);
  const [who, setWho] = useState(existing?.person_id ?? people.find((m) => m.role === "child")?.id ?? me.id);
  const [name, setName] = useState(existing?.name ?? "");
  const [amount, setAmount] = useState(existing?.amount ?? "");
  const [times, setTimes] = useState<string[]>(existing?.times ?? ["08:00"]);
  const [extra, setExtra] = useState("");
  const [start, setStart] = useState(existing?.start_on ?? today);
  const [end, setEnd] = useState(existing?.end_on ?? "");
  const [remind, setRemind] = useState<string[]>(existing?.remind ?? [me.id]);
  const [busy, setBusy] = useState(false);
  const toggle = (t: string) => setTimes(times.includes(t) ? times.filter((x) => x !== t) : [...times, t].sort());

  async function save() {
    setBusy(true);
    try {
      const row = { name: name.trim(), amount: amount.trim() || null, times, start_on: start, end_on: end || null, remind };
      const { error } = existing
        ? await supabase.from("health_meds").update(row).eq("id", existing.id)
        : await supabase.from("health_meds").insert({ ...row, family_id: family.id, person_id: who });
      if (error) throw error;
      await refreshHealth(qc, family.id);
      toast.success("Saved. You'll get a reminder at each time");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!existing) return;
    const { error } = await supabase.from("health_meds").update({ deleted_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) return void toast.error(errMsg(error));
    await refreshHealth(qc, family.id);
    onClose();
  }

  return (
    <div className="space-y-4">
      {!existing ? (
        <Field label="Who is it for?">
          <div className="flex flex-wrap gap-2">{people.map((m) => <Chip key={m.id} on={who === m.id} onClick={() => setWho(m.id)} className="min-h-11 text-base"><MemberAvatar member={m} size="sm" className="size-6 ring-0 ring-offset-0" /> {m.display_name}</Chip>)}</div>
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Field label="Medicine"><Input data-testid="med-name" data-autofocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Calpol" className="h-12 w-56 text-base" /></Field>
        <Field label="How much" hint="From the label or doctor"><Input data-testid="med-amount" value={amount} maxLength={40} onChange={(e) => setAmount(e.target.value)} placeholder="5ml" className="h-12 w-32 text-base" /></Field>
      </div>
      <Field label="When each day">
        <div className="flex flex-wrap gap-2" data-testid="med-times">
          {[...new Set([...TIMES, ...times])].sort().map((t) => <Chip key={t} on={times.includes(t)} onClick={() => toggle(t)} className="min-h-11 text-base tabular-nums">{t}</Chip>)}
          <span className="flex items-center gap-1">
            <Input type="time" value={extra} onChange={(e) => setExtra(e.target.value)} className="h-11 w-28 text-base" aria-label="Another time" />
            <Button variant="outline" className="h-11 rounded-full" disabled={!extra || times.includes(extra) || times.length >= 6} onClick={() => { toggle(extra); setExtra(""); }}><Plus className="size-4" /></Button>
          </span>
        </div>
      </Field>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-12 w-44 text-base" /></Field>
        <Field label="Until" hint="Empty if it's ongoing"><Input data-testid="med-end" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className="h-12 w-44 text-base" /></Field>
        <div className="flex gap-1.5 pb-0.5">{[3, 5, 7].map((n) => <Chip key={n} on={end === addDaysKey(start, n - 1)} onClick={() => setEnd(addDaysKey(start, n - 1))} className="min-h-11">{n} days</Chip>)}</div>
      </div>
      {parents.length > 1 ? (
        <Field label="Remind">
          <div className="flex flex-wrap gap-2">{parents.map((m) => { const on = remind.includes(m.id); return <Chip key={m.id} on={on} onClick={() => setRemind(on ? remind.filter((x) => x !== m.id) : [...remind, m.id])} className="min-h-11 text-base"><MemberAvatar member={m} size="sm" className="size-6 ring-0 ring-offset-0" /> {m.display_name}</Chip>; })}</div>
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-testid="med-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !name.trim() || !times.length || !start} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
        {existing ? <Button variant="ghost" className="h-12 rounded-full text-[var(--status-red)]" onClick={() => void remove()}><Trash2 className="size-4" /> Stop</Button> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- check-ups and jabs

function Checks() {
  const { family, members } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const list = useChecks().data ?? [];
  const [edit, setEdit] = useState<CheckRow | "new" | null>(null);
  const soon = addDaysKey(today, 30);

  async function done(c: CheckRow) {
    const { error } = await supabase.from("health_checks").update({ last_done_on: today }).eq("id", c.id);
    if (error) return void toast.error(errMsg(error));
    await refreshHealth(qc, family.id);
    toast.success(c.every_months ? `Done. Next one ${everyWords(c.every_months).toLowerCase().replace("every", "in")}` : "Done");
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-lg font-bold">Check-ups and jabs</h2>
        <Button data-testid="check-add" className="h-11 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-5" /> Add</Button>
      </div>
      {list.length ? (
        <ul className="space-y-1.5">
          {list.map((c) => {
            const who = members.find((m) => m.id === c.person_id);
            const late = c.due_on <= today;
            return (
              <li key={c.id} className="glass-tile flex min-h-14 items-center gap-3 px-3 py-2" data-testid="check-row">
                {who ? <MemberAvatar member={who} size="sm" className="ring-0 ring-offset-0" /> : null}
                <button type="button" onClick={() => setEdit(c)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-base font-semibold">{who?.display_name}: {c.title}</span>
                  <span className={cn("block truncate text-sm", late ? "font-semibold text-[var(--status-red)]" : c.due_on <= soon ? "text-[var(--status-amber)]" : "text-muted-foreground")}>
                    {late ? "Due now" : `Due ${dateWords(c.due_on)}`} · {everyWords(c.every_months)}
                  </span>
                </button>
                <Button data-testid="check-done" variant="outline" className="h-11 rounded-full" onClick={() => void done(c)}><Check className="size-4" /> Done</Button>
              </li>
            );
          })}
        </ul>
      ) : <Empty icon={Stethoscope} title="Nothing due">Add the dentist, eye tests and jabs with when they're due. You get a reminder on the day, and repeating ones move on when ticked.</Empty>}
      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} title={edit === "new" ? "Add a check-up or jab" : "Change it"}>
        {edit !== null ? <CheckForm key={edit === "new" ? "new" : edit.id} existing={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
      </Sheet>
    </>
  );
}

function CheckForm({ existing, onClose }: { existing: CheckRow | null; onClose: () => void }) {
  const { family, members, me } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const people = members.filter((m) => !m.archived_at);
  const [who, setWho] = useState<string[]>(existing ? [existing.person_id] : [me.id]);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [every, setEvery] = useState<number | null>(existing ? existing.every_months : 6);
  const [due, setDue] = useState(existing?.due_on ?? today);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const row = { title: title.trim(), every_months: every, due_on: due };
      const { error } = existing
        ? await supabase.from("health_checks").update(row).eq("id", existing.id)
        : await supabase.from("health_checks").insert(who.map((p) => ({ ...row, family_id: family.id, person_id: p })));
      if (error) throw error;
      await refreshHealth(qc, family.id);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!existing) return;
    const { error } = await supabase.from("health_checks").update({ deleted_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) return void toast.error(errMsg(error));
    await refreshHealth(qc, family.id);
    onClose();
  }

  return (
    <div className="space-y-4">
      {!existing ? (
        <>
          <Field label="Ideas">
            <div className="flex flex-wrap gap-2">{CHECK_IDEAS.map((c) => <Chip key={c.title} on={title === c.title} onClick={() => { setTitle(c.title); setEvery(c.every); }} className="min-h-11 text-base">{c.emoji} {c.title}</Chip>)}</div>
          </Field>
          <Field label="Who?" hint="Pick several to add one each">
            <div className="flex flex-wrap gap-2">{people.map((m) => { const on = who.includes(m.id); return <Chip key={m.id} on={on} onClick={() => setWho(on ? who.filter((x) => x !== m.id) : [...who, m.id])} className="min-h-11 text-base"><MemberAvatar member={m} size="sm" className="size-6 ring-0 ring-offset-0" /> {m.display_name}</Chip>; })}</div>
          </Field>
        </>
      ) : null}
      <Field label="What"><Input data-testid="check-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Dentist" className="h-12 text-base" /></Field>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Due"><Input data-testid="check-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-12 w-44 text-base" /></Field>
        <Field label="How often">
          <div className="flex flex-wrap gap-1.5">{[null, 6, 12, 24, 36].map((m) => <Chip key={String(m)} on={every === m} onClick={() => setEvery(m)} className="min-h-11">{everyWords(m)}</Chip>)}</div>
        </Field>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-testid="check-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !title.trim() || !due || !who.length} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
        {existing ? <Button variant="ghost" className="h-12 rounded-full text-[var(--status-red)]" onClick={() => void remove()}><Trash2 className="size-4" /> Remove</Button> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- appointments (from the Calendar)

function Appointments() {
  const { family, members } = useFamilyState();
  const [range] = useState(() => ({ from: new Date(Date.now() - 3600_000), to: new Date(Date.now() + 120 * 86400_000) }));
  const list = useAppointments(range.from, range.to).data ?? [];
  const [adding, setAdding] = useState(false);
  return (
    <>
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-lg font-bold">Appointments</h2>
        <Button data-testid="appt-add" className="h-11 rounded-full px-4 font-semibold" onClick={() => setAdding(true)}><Plus className="size-5" /> Appointment</Button>
      </div>
      {list.length ? (
        <ul className="space-y-1.5">
          {list.map((o) => {
            const people = members.filter((m) => o.event.people.includes(m.id));
            return (
              <li key={o.key}>
                <Link to="/m/$key" params={{ key: "calendar" }} search={{ event: o.seriesId } as never} data-testid="appt-row" className="glass-tile flex items-center gap-3 p-3">
                  <span className="text-xl" aria-hidden>🩺</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{o.event.title}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {o.start.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(o.allDay ? {} : { hour: "2-digit", minute: "2-digit" }), timeZone: family.timezone })}
                      {people.length ? ` · ${people.map((p) => p.display_name).join(", ")}` : ""}
                    </span>
                    {o.event.location ? <span className="flex items-center gap-1 truncate text-sm text-muted-foreground"><MapPin className="size-3.5" /> {o.event.location}</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <Empty icon={CalendarClock} title="No appointments coming up">Doctor, dentist and hospital appointments live on the Calendar as "appointment" events and show here.</Empty>}
      <Sheet open={adding} onOpenChange={setAdding} title="Add an appointment">
        {adding ? <ApptForm onClose={() => setAdding(false)} /> : null}
      </Sheet>
    </>
  );
}

function ApptForm({ onClose }: { onClose: () => void }) {
  const { family, members, me } = useFamilyState();
  const qc = useQueryClient();
  const tz = family.timezone;
  const today = todayIn(tz);
  const people = members.filter((m) => !m.archived_at);
  const [title, setTitle] = useState("");
  const [who, setWho] = useState<string[]>([me.id]);
  const [day, setDay] = useState("");
  const [time, setTime] = useState("09:00");
  const [where, setWhere] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const [h, m] = time.split(":").map(Number);
      const starts = new Date(dayStart(day, tz).getTime() + (h * 60 + m) * 60000);
      // dates only: the appointment's name and place, never why
      await insertEvent({ family_id: family.id, title: title.trim(), type: "appointment", all_day: false, starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 30 * 60000).toISOString(), people: who, location: where.trim() || null });
      await qc.invalidateQueries({ queryKey: ["cal", family.id] });
      toast.success("On the Calendar");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <Field label="What"><Input data-testid="appt-title" data-autofocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Dentist" className="h-12 text-base" /></Field>
      <Field label="Who for?">
        <div className="flex flex-wrap gap-2">{people.map((m) => { const on = who.includes(m.id); return <Chip key={m.id} on={on} onClick={() => setWho(on ? who.filter((x) => x !== m.id) : [...who, m.id])} className="min-h-11 text-base"><MemberAvatar member={m} size="sm" className="size-6 ring-0 ring-offset-0" /> {m.display_name}</Chip>; })}</div>
      </Field>
      <div className="flex flex-wrap gap-3">
        <Field label="Day"><Input data-testid="appt-day" type="date" value={day} min={today} onChange={(e) => setDay(e.target.value)} className="h-12 w-44 text-base" /></Field>
        <Field label="Time"><Input data-testid="appt-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-12 w-32 text-base" /></Field>
      </div>
      <Field label="Where" hint="Optional"><Input value={where} maxLength={200} onChange={(e) => setWhere(e.target.value)} placeholder="Riverside Dental" className="h-12 text-base" /></Field>
      <p className="text-xs text-muted-foreground">It goes on the Calendar for the people picked. Keep the reason off it; the Calendar is shared.</p>
      <div className="flex gap-2 pt-1">
        <Button data-testid="appt-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !title.trim() || !day || !time || !who.length} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
