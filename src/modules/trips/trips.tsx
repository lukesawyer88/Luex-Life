// The trips: a card for each (countdown and packing left), and one trip at a time with its packing, jobs and plans.
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, Check, MapPin, Plane, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { EditClash, insertEvent, saveEventChanges, type CalEvent } from "@/modules/calendar/data";
import { dayStart } from "@/modules/calendar/time";
import { Chip, Empty, Field, Sheet } from "@/modules/calendar/ui";

import {
  BEFORE_WE_GO, PACK_LISTS, PLAN_KINDS, addMonths, countdownWords, datesWords, errMsg, refreshTrips, todayIn, usePassports, useTripItems,
  useTripProgress, useTrips, type Trip, type TripItem,
} from "./data";

export function TripsTab({ firstTrip }: { firstTrip: string | null }) {
  const { family, role } = useFamilyState();
  const q = useTrips();
  const today = todayIn(family.timezone);
  const [openId, setOpenId] = useState<string | null>(firstTrip);
  const [edit, setEdit] = useState<Trip | "new" | null>(null);
  const grownUp = role !== "child";
  const trips = q.data ?? [];
  const coming = trips.filter((t) => t.endDay >= today);
  const been = trips.filter((t) => t.endDay < today).reverse();
  const progress = useTripProgress(coming.map((t) => t.id)).data ?? {};
  const open = trips.find((t) => t.id === openId) ?? null;

  const card = (t: Trip) => {
    const p = progress[t.id];
    return (
      <li key={t.id}>
        <button type="button" data-testid="trip-card" onClick={() => setOpenId(t.id)}
          className={cn("glass-tile flex w-full items-center gap-3 p-3 text-left", openId === t.id && "ring-2 ring-[var(--status-blue)]")}>
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--surface)] text-2xl" aria-hidden>{t.emoji ?? "✈️"}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold">{t.event.title}</span>
            <span className="block truncate text-sm text-muted-foreground">{[datesWords(t), t.event.location].filter(Boolean).join(" · ")}</span>
            {p && t.endDay >= today ? <span className="block text-sm">{p.left ? `${p.left} of ${p.total} still to pack or do` : "All packed"}</span> : null}
          </span>
          {t.endDay >= today ? <span className="shrink-0 rounded-full bg-[var(--surface)] px-3 py-1 text-sm font-bold">{countdownWords(t, today)}</span> : null}
        </button>
      </li>
    );
  };

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Trips and holidays</h2>
          {grownUp ? <Button data-testid="trip-add" className="h-11 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-5" /> Trip</Button> : null}
        </div>
        {q.isLoading ? null : !trips.length ? (
          <Empty icon={Plane} title="No trips yet">
            {grownUp ? "Add a trip with its dates and who's going. It goes on the Calendar with a countdown, and you get packing lists and a before-we-go checklist." : "When a grown-up adds a trip, it shows here with your packing list."}
          </Empty>
        ) : (
          <>
            {coming.length ? <ul className="space-y-2">{coming.map(card)}</ul> : <p className="text-base text-muted-foreground">Nothing booked yet.</p>}
            {been.length ? (
              <section>
                <h3 className="mb-2 text-sm font-bold text-muted-foreground">Been</h3>
                <ul className="space-y-2 opacity-80">{been.slice(0, 10).map(card)}</ul>
              </section>
            ) : null}
          </>
        )}
      </RecordsWindow>
      <DetailWindow className="lg:w-[42%] xl:w-[38%]">
        {open ? <TripDetail t={open} onEdit={() => setEdit(open)} /> : <p className="text-sm text-muted-foreground">Tap a trip to see its packing, before-we-go jobs and plans.</p>}
      </DetailWindow>
      <TripViewSheet t={open} onEdit={() => open && setEdit(open)} onClose={() => setOpenId(null)} />
      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} title={edit === "new" ? "Add a trip" : "Change the trip"}>
        {edit !== null ? <TripForm key={edit === "new" ? "new" : edit.id} existing={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={setOpenId} /> : null}
      </Sheet>
    </Windows>
  );
}

function TripViewSheet({ t, onEdit, onClose }: { t: Trip | null; onEdit: () => void; onClose: () => void }) {
  const wide = useDesktop();
  if (wide) return null;
  return (
    <Sheet open={!!t} onOpenChange={(o) => !o && onClose()} title={t ? `${t.emoji ?? "✈️"} ${t.event.title}` : ""}>
      {t ? <TripDetail t={t} onEdit={() => { onClose(); onEdit(); }} /> : null}
    </Sheet>
  );
}

// ---------------------------------------------------------------- one trip

function TripDetail({ t, onEdit }: { t: Trip; onEdit: () => void }) {
  const { family, me, members, role } = useFamilyState();
  const today = todayIn(family.timezone);
  const items = useTripItems(t.id);
  const grownUp = role !== "child";
  const going = members.filter((m) => t.event.people.includes(m.id) && !m.archived_at);
  const [section, setSection] = useState<"pack" | "todo" | "plan">("pack");
  const all = items.data ?? [];
  const passports = usePassports(going.map((m) => m.id)).data ?? [];
  // a passport should have at least six months left after coming home
  const mustLast = addMonths(t.endDay, 6);
  const warnings = going.flatMap((m) => {
    const p = passports.filter((x) => x.person_id === m.id && x.expires_on).sort((a, b) => b.expires_on!.localeCompare(a.expires_on!))[0];
    return p && p.expires_on! < mustLast ? [`${m.display_name}'s passport runs out ${p.expires_on! < t.endDay ? "before you're back" : "within six months of coming home"}`] : [];
  });

  return (
    <div className="space-y-3" data-testid="trip-detail">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-bold">{t.emoji ?? "✈️"} {t.event.title}</h3>
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><CalendarDays className="size-4" /> {datesWords(t)}</span>
            {t.event.location ? <span className="inline-flex items-center gap-1"><MapPin className="size-4" /> {t.event.location}</span> : null}
            {t.endDay >= today ? <span className="font-semibold text-foreground">{countdownWords(t, today)}</span> : null}
          </p>
          {going.length ? <div className="mt-1 flex flex-wrap gap-1">{going.map((m) => <MemberAvatar key={m.id} member={m} size="sm" className="ring-0 ring-offset-0" />)}</div> : null}
        </div>
        {canChangeEvent(t.event, role, me.id) ? <Button variant="outline" data-testid="trip-change" className="h-10 rounded-full" onClick={onEdit}>Change</Button> : null}
      </div>
      {warnings.length ? (
        <div className="space-y-1 rounded-2xl bg-[var(--status-amber-soft)] p-3 text-sm" data-testid="passport-warning">
          {warnings.map((w) => <p key={w} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--status-amber)]" /> {w}. Many countries need six months left.</p>)}
        </div>
      ) : null}
      <div className="flex gap-1.5">
        <Chip on={section === "pack"} onClick={() => setSection("pack")} className="min-h-11 text-base">🧳 Packing</Chip>
        {grownUp ? <Chip on={section === "todo"} onClick={() => setSection("todo")} className="min-h-11 text-base">✅ Before we go</Chip> : null}
        <Chip on={section === "plan"} onClick={() => setSection("plan")} className="min-h-11 text-base">🎫 Plans</Chip>
      </div>
      {section === "pack" ? <Packing t={t} items={all.filter((i) => i.kind === "pack")} going={going} me={me} grownUp={grownUp} /> : null}
      {section === "todo" ? <Todos t={t} items={all.filter((i) => i.kind === "todo")} /> : null}
      {section === "plan" ? <Plans t={t} items={all.filter((i) => i.kind === "plan")} grownUp={grownUp} /> : null}
    </div>
  );
}

function TickRow({ i, canTick, canRemove }: { i: TripItem; canTick: boolean; canRemove: boolean }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  async function tick() {
    const { error } = await supabase.from("trip_items").update({ done_at: i.done_at ? null : new Date().toISOString() }).eq("id", i.id);
    if (error) return void toast.error(errMsg(error));
    await refreshTrips(qc, family.id);
  }
  async function remove() {
    const { error } = await supabase.from("trip_items").update({ deleted_at: new Date().toISOString() }).eq("id", i.id);
    if (error) return void toast.error(errMsg(error));
    await refreshTrips(qc, family.id);
  }
  return (
    <li className="flex min-h-12 items-center gap-2" data-testid="tick-row">
      <button type="button" disabled={!canTick} aria-pressed={!!i.done_at} aria-label={i.done_at ? `Not done: ${i.title}` : `Done: ${i.title}`} onClick={() => void tick()}
        className={cn("grid size-10 shrink-0 place-items-center rounded-full border-2 transition disabled:opacity-50",
          i.done_at ? "border-transparent bg-[var(--status-green)] text-white" : "border-[var(--surface-border)] bg-[var(--surface)]")}>
        <Check className="size-5" />
      </button>
      <span className={cn("min-w-0 flex-1 text-base", i.done_at && "text-muted-foreground line-through")}>{i.title}</span>
      {canRemove ? <button type="button" aria-label={`Take off ${i.title}`} onClick={() => void remove()} className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-4" /></button> : null}
    </li>
  );
}

function AddLine({ placeholder, onAdd, testid }: { placeholder: string; onAdd: (title: string) => Promise<void>; testid: string }) {
  const [v, setV] = useState("");
  const add = async () => { const t = v.trim(); if (!t) return; await onAdd(t.slice(0, 120)); setV(""); };
  return (
    <div className="flex gap-2">
      <Input data-testid={testid} value={v} maxLength={120} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="h-11 text-base" onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
      <Button variant="outline" className="h-11 rounded-full" disabled={!v.trim()} onClick={() => void add()}><Plus className="size-4" /> Add</Button>
    </div>
  );
}

function Packing({ t, items, going, me, grownUp }: { t: Trip; items: TripItem[]; going: Member[]; me: Member; grownUp: boolean }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  // grown-ups see everyone's lists; a child sees their own and the shared one
  const lists = grownUp ? [null, ...going.map((m) => m.id)] : [me.id, null];
  const [whose, setWhose] = useState<string | null>(grownUp ? null : me.id);
  const [showLists, setShowLists] = useState(false);
  const mine = items.filter((i) => i.member_id === whose);
  const nameOf = (id: string | null) => (id ? going.find((m) => m.id === id)?.display_name ?? "Me" : "Everyone");

  async function add(titles: string[]) {
    const have = new Set(mine.map((i) => i.title.toLowerCase()));
    const rows = titles.filter((x) => !have.has(x.toLowerCase())).map((title, n) => ({ family_id: family.id, trip_id: t.id, kind: "pack", member_id: whose, title, position: Date.now() / 1000 + n }));
    if (!rows.length) return void toast("Already on the list");
    const { error } = await supabase.from("trip_items").insert(rows);
    if (error) return void toast.error(errMsg(error));
    await refreshTrips(qc, family.id);
  }

  const canChange = grownUp || whose === me.id;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" data-testid="pack-whose">
        {lists.map((id) => {
          const left = items.filter((i) => i.member_id === id && !i.done_at).length;
          const m = going.find((x) => x.id === id) ?? (id === me.id ? me : undefined);
          return (
            <Chip key={id ?? "all"} on={whose === id} onClick={() => setWhose(id)} className="min-h-10">
              {m ? <MemberAvatar member={m} size="sm" className="size-5 ring-0 ring-offset-0" /> : "👪"} {id === me.id && !grownUp ? "Mine" : nameOf(id)}
              {left ? <span className="text-xs opacity-70">{left}</span> : null}
            </Chip>
          );
        })}
      </div>
      {mine.length ? <ul>{mine.map((i) => <TickRow key={i.id} i={i} canTick={canChange} canRemove={canChange} />)}</ul>
        : <p className="text-sm text-muted-foreground">Nothing on {whose === null ? "the shared list" : `${nameOf(whose)}'s list`} yet.</p>}
      {canChange ? (
        <>
          <AddLine placeholder="Add something to pack" testid="pack-new" onAdd={(x) => add([x])} />
          <button type="button" data-testid="pack-lists" className="min-h-11 text-sm font-semibold underline" onClick={() => setShowLists(!showLists)}>{showLists ? "Hide ready-made lists" : "Add a ready-made list"}</button>
          {showLists ? (
            <div className="flex flex-wrap gap-2">
              {PACK_LISTS.map((l) => <Button key={l.key} variant="outline" data-testid={`pack-list-${l.key}`} className="h-10 rounded-full" onClick={() => void add(l.items)}>{l.emoji} {l.label}</Button>)}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Todos({ t, items }: { t: Trip; items: TripItem[] }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  async function add(titles: string[]) {
    const have = new Set(items.map((i) => i.title.toLowerCase()));
    const rows = titles.filter((x) => !have.has(x.toLowerCase())).map((title, n) => ({ family_id: family.id, trip_id: t.id, kind: "todo", title, position: Date.now() / 1000 + n }));
    if (!rows.length) return;
    const { error } = await supabase.from("trip_items").insert(rows);
    if (error) return void toast.error(errMsg(error));
    await refreshTrips(qc, family.id);
  }
  return (
    <div className="space-y-2">
      {items.length ? <ul>{items.map((i) => <TickRow key={i.id} i={i} canTick canRemove />)}</ul> : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">The jobs to do before you leave.</p>
          <Button data-testid="todo-ready" variant="outline" className="h-11 rounded-full" onClick={() => void add(BEFORE_WE_GO)}>Add the usual list</Button>
        </div>
      )}
      <AddLine placeholder="Add a job" testid="todo-new" onAdd={(x) => add([x])} />
    </div>
  );
}

function Plans({ t, items, grownUp }: { t: Trip; items: TripItem[]; grownUp: boolean }) {
  const { family } = useFamilyState();
  const [edit, setEdit] = useState<TripItem | "new" | null>(null);
  const sorted = [...items].sort((a, b) => (a.starts_at ?? "9").localeCompare(b.starts_at ?? "9"));
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: family.timezone }) : null);
  return (
    <div className="space-y-2">
      {sorted.length ? (
        <ul className="space-y-2">
          {sorted.map((p) => (
            <li key={p.id}>
              <button type="button" disabled={!grownUp} onClick={() => setEdit(p)} data-testid="plan-row" className="glass-tile flex w-full items-start gap-3 p-3 text-left disabled:cursor-default">
                <span className="text-xl" aria-hidden>{PLAN_KINDS.find((k) => k.key === p.plan_kind)?.emoji ?? "📌"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{p.title}</span>
                  <span className="block text-sm text-muted-foreground">{[when(p.starts_at), p.place].filter(Boolean).join(" · ")}</span>
                  {p.ref ? <span className="block font-mono text-sm">Ref {p.ref}</span> : null}
                  {p.notes ? <span className="block whitespace-pre-wrap text-sm">{p.notes}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">Flights, the hotel, car hire and anything booked, with the reference to hand.</p>}
      {grownUp ? <Button variant="outline" data-testid="plan-add" className="h-11 rounded-full" onClick={() => setEdit("new")}><Plus className="size-4" /> Add a plan</Button> : null}
      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} title={edit === "new" ? "Add a plan" : "Change the plan"}>
        {edit !== null ? <PlanForm key={edit === "new" ? "new" : edit.id} t={t} existing={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
      </Sheet>
    </div>
  );
}

function PlanForm({ t, existing, onClose }: { t: Trip; existing: TripItem | null; onClose: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const tz = family.timezone;
  const toLocal = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
    const g = (k: string) => p.find((x) => x.type === k)?.value ?? "";
    return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
  };
  const [kind, setKind] = useState<NonNullable<TripItem["plan_kind"]>>(existing?.plan_kind ?? "travel");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [at, setAt] = useState(existing ? toLocal(existing.starts_at) : `${t.startDay}T09:00`);
  const [ref, setRef] = useState(existing?.ref ?? "");
  const [place, setPlace] = useState(existing?.place ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      // the time as typed, in the family's time zone
      let starts: string | null = null;
      if (at) {
        const [d, hm] = at.split("T");
        const base = dayStart(d, tz);
        const [h, m] = (hm ?? "00:00").split(":").map(Number);
        starts = new Date(base.getTime() + (h * 60 + m) * 60000).toISOString();
      }
      const row = { plan_kind: kind, title: title.trim(), starts_at: starts, ref: ref.trim() || null, place: place.trim() || null, notes: notes.trim() };
      const { error } = existing
        ? await supabase.from("trip_items").update(row).eq("id", existing.id)
        : await supabase.from("trip_items").insert({ ...row, family_id: family.id, trip_id: t.id, kind: "plan" });
      if (error) throw error;
      await refreshTrips(qc, family.id);
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
    const { error } = await supabase.from("trip_items").update({ deleted_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) return void toast.error(errMsg(error));
    await refreshTrips(qc, family.id);
    onClose();
  }

  return (
    <div className="space-y-4">
      <Field label="What is it?">
        <div className="flex flex-wrap gap-2">{PLAN_KINDS.map((k) => <Chip key={k.key} on={kind === k.key} onClick={() => setKind(k.key)} className="min-h-11 text-base">{k.emoji} {k.label}</Chip>)}</div>
      </Field>
      <Field label="Name"><Input data-testid="plan-title" data-autofocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "travel" ? "Flight out" : kind === "stay" ? "Hotel" : kind === "car" ? "Car hire" : "Boat trip"} className="h-12 text-base" /></Field>
      <Field label="When" hint="Optional"><Input data-testid="plan-when" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="h-12 w-60 text-base" /></Field>
      <div className="flex flex-wrap gap-3">
        <Field label="Booking reference"><Input data-testid="plan-ref" value={ref} maxLength={80} onChange={(e) => setRef(e.target.value)} className="h-12 w-48 font-mono text-base" /></Field>
        <Field label="Where"><Input value={place} maxLength={200} onChange={(e) => setPlace(e.target.value)} placeholder="Gatwick North" className="h-12 w-60 text-base" /></Field>
      </div>
      <Field label="Notes" hint="Optional">
        <textarea value={notes} maxLength={500} rows={2} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </Field>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-testid="plan-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !title.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
        {existing ? <Button variant="ghost" className="h-12 rounded-full text-[var(--status-red)]" onClick={() => void remove()}><Trash2 className="size-4" /> Remove</Button> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- adding or changing a trip (the Calendar event)

const EMOJIS = ["✈️", "🏖️", "⛰️", "🏕️", "🚗", "🚆", "🏰", "🎢", "⛷️", "🛳️"];

function TripForm({ existing, onClose, onSaved }: { existing: Trip | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { family, members } = useFamilyState();
  const qc = useQueryClient();
  const tz = family.timezone;
  const today = todayIn(tz);
  const [title, setTitle] = useState(existing?.event.title ?? "");
  const [where, setWhere] = useState(existing?.event.location ?? "");
  const [start, setStart] = useState(existing?.startDay ?? "");
  const [end, setEnd] = useState(existing?.endDay ?? "");
  const [people, setPeople] = useState<string[]>(existing?.event.people ?? members.filter((m) => !m.archived_at).map((m) => m.id));
  const [emoji, setEmoji] = useState(existing?.emoji ?? "✈️");
  const [busy, setBusy] = useState(false);
  const live = useMemo(() => members.filter((m) => !m.archived_at), [members]);

  async function save() {
    if (!start) return void toast.error("Pick the day you go");
    const last = end && end >= start ? end : start;
    setBusy(true);
    try {
      const fields = {
        title: title.trim(), type: "trip", all_day: true, starts_at: dayStart(start, tz).toISOString(), ends_at: dayStart(last, tz).toISOString(),
        people, location: where.trim() || null, countdown: true,
      };
      let id = existing?.id;
      if (existing) {
        await saveEventChanges(existing.event, fields);
        const { error } = await supabase.from("trips").update({ emoji }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const ev = await insertEvent({ ...fields, family_id: family.id });
        const { data, error } = await supabase.from("trips").insert({ family_id: family.id, event_id: ev.id, emoji }).select("id").single();
        if (error) {
          await saveEventChanges(ev, { deleted_at: new Date().toISOString() }, true).catch(() => undefined);
          throw error;
        }
        id = data.id;
      }
      await refreshTrips(qc, family.id);
      toast.success(existing ? "Saved" : "On the Calendar with a countdown");
      onClose();
      if (id) onSaved(id);
    } catch (e) {
      toast.error(e instanceof EditClash ? "Someone just changed this on the Calendar. Close this and open it again" : errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing || !window.confirm(`Remove ${existing.event.title}? It comes off the Calendar too.`)) return;
    try {
      await saveEventChanges(existing.event, { deleted_at: new Date().toISOString() }, true);
      await refreshTrips(qc, family.id);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Where are you going?"><Input data-testid="trip-title" data-autofocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Spain" className="h-12 text-base" /></Field>
      <Field label="Place" hint="Optional, for example the town or the hotel"><Input data-testid="trip-where" value={where} maxLength={200} onChange={(e) => setWhere(e.target.value)} placeholder="Malaga" className="h-12 text-base" /></Field>
      <div className="flex flex-wrap gap-3">
        <Field label="Going"><Input data-testid="trip-start" type="date" value={start} min={existing ? undefined : today} onChange={(e) => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value); }} className="h-12 w-44 text-base" /></Field>
        <Field label="Coming back"><Input data-testid="trip-end" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} className="h-12 w-44 text-base" /></Field>
      </div>
      <Field label="Who's going?">
        <div className="flex flex-wrap gap-2" data-testid="trip-people">
          {live.map((m) => {
            const on = people.includes(m.id);
            return <Chip key={m.id} on={on} onClick={() => setPeople(on ? people.filter((x) => x !== m.id) : [...people, m.id])} className="min-h-11 text-base"><MemberAvatar member={m} size="sm" className="size-6 ring-0 ring-offset-0" /> {m.display_name}</Chip>;
          })}
        </div>
      </Field>
      <Field label="Picture">
        <div className="flex flex-wrap gap-1.5">{EMOJIS.map((e) => <Chip key={e} on={emoji === e} onClick={() => setEmoji(e)} className="min-h-11 min-w-11 justify-center text-xl">{e}</Chip>)}</div>
      </Field>
      <p className="text-sm text-muted-foreground">It goes on the Calendar for everyone going, with a countdown. {start ? `${Math.max(0, Math.round((Date.parse(`${start}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000))} sleeps to go.` : ""}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-testid="trip-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !title.trim() || !start} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
        {existing ? <Button variant="ghost" className="h-12 rounded-full text-[var(--status-red)]" onClick={() => void remove()}><Trash2 className="size-4" /> Remove</Button> : null}
      </div>
    </div>
  );
}

/** The Calendar's own rule: a parent, or whoever added the event, changes it */
function canChangeEvent(ev: CalEvent, role: string, me: string) {
  return role === "parent" || ev.created_by_member === me;
}
