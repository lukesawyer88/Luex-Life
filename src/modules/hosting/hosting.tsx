// Hosting: a card for each party or visit (how many coming, what's left), and one at a time with its guests,
// things to get and jobs to do.
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, MapPin, PartyPopper, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { EditClash, insertEvent, saveEventChanges, type CalEvent } from "@/modules/calendar/data";
import { dayStart } from "@/modules/calendar/time";
import { Chip, Empty, Field, Sheet } from "@/modules/calendar/ui";

import {
  STATUS, errMsg, refreshHosting, todayIn, useHostDetail, useHostSummaries, useHostings, whenWords, type Guest, type HostItem, type Hosting,
} from "./data";

export function HostingTab({ firstHost }: { firstHost: string | null }) {
  const { family, role } = useFamilyState();
  const q = useHostings();
  const today = todayIn(family.timezone);
  const [openId, setOpenId] = useState<string | null>(firstHost);
  const [edit, setEdit] = useState<Hosting | "new" | null>(null);
  const grownUp = role !== "child";
  const all = q.data ?? [];
  const coming = all.filter((h) => h.day >= today);
  const been = all.filter((h) => h.day < today).reverse();
  const sums = useHostSummaries(coming.map((h) => h.id)).data ?? {};
  const open = all.find((h) => h.id === openId) ?? null;

  const card = (h: Hosting) => {
    const s = sums[h.id];
    return (
      <li key={h.id}>
        <button type="button" data-testid="host-card" onClick={() => setOpenId(h.id)}
          className={cn("glass-tile flex w-full items-center gap-3 p-3 text-left", openId === h.id && "ring-2 ring-[var(--status-blue)]")}>
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--surface)] text-2xl" aria-hidden>🎉</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold">{h.event.title}</span>
            <span className="block truncate text-sm text-muted-foreground">{whenWords(h.event.starts_at, family.timezone, h.event.all_day)}</span>
            {s ? <span className="block text-sm">{s.coming} coming{s.maybe ? `, ${s.maybe} not sure yet` : ""}{s.left ? ` · ${s.left} still to do` : ""}</span> : null}
          </span>
        </button>
      </li>
    );
  };

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Parties and visits</h2>
          {grownUp ? <Button data-testid="host-add" className="h-11 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-5" /> Plan one</Button> : null}
        </div>
        {q.isLoading ? null : !all.length ? (
          <Empty icon={PartyPopper} title="Nothing planned">
            {grownUp ? "Plan a party, a dinner or people coming to stay. It goes on the Calendar, and you get a guest list, a shopping list and jobs to share out." : "When a grown-up plans a party or visit, it shows here with any jobs for you."}
          </Empty>
        ) : (
          <>
            {coming.length ? <ul className="space-y-2">{coming.map(card)}</ul> : <p className="text-base text-muted-foreground">Nothing coming up.</p>}
            {been.length ? (
              <section>
                <h3 className="mb-2 text-sm font-bold text-muted-foreground">Been and gone</h3>
                <ul className="space-y-2 opacity-80">{been.slice(0, 10).map(card)}</ul>
              </section>
            ) : null}
          </>
        )}
      </RecordsWindow>
      <DetailWindow className="lg:w-[42%] xl:w-[38%]">
        {open ? <HostDetail h={open} onEdit={() => setEdit(open)} /> : <p className="text-sm text-muted-foreground">Tap a plan to see who's coming and what's left to do.</p>}
      </DetailWindow>
      <HostViewSheet h={open} onEdit={() => open && setEdit(open)} onClose={() => setOpenId(null)} />
      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} title={edit === "new" ? "Plan a party or visit" : "Change the plan"}>
        {edit !== null ? <HostForm key={edit === "new" ? "new" : edit.id} existing={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={setOpenId} /> : null}
      </Sheet>
    </Windows>
  );
}

function HostViewSheet({ h, onEdit, onClose }: { h: Hosting | null; onEdit: () => void; onClose: () => void }) {
  const wide = useDesktop();
  if (wide) return null;
  return (
    <Sheet open={!!h} onOpenChange={(o) => !o && onClose()} title={h ? `🎉 ${h.event.title}` : ""}>
      {h ? <HostDetail h={h} onEdit={() => { onClose(); onEdit(); }} /> : null}
    </Sheet>
  );
}

// ---------------------------------------------------------------- one plan

function HostDetail({ h, onEdit }: { h: Hosting; onEdit: () => void }) {
  const { family, me, role } = useFamilyState();
  const grownUp = role !== "child";
  const d = useHostDetail(h.id).data;
  const [section, setSection] = useState<"guests" | "get" | "do">(grownUp ? "guests" : "do");
  const guests = d?.guests ?? [];
  const items = d?.items ?? [];
  const coming = guests.filter((g) => g.status === "yes").reduce((n, g) => n + g.people, 0);
  const mine = items.filter((i) => i.kind === "do" && i.who === me.id && !i.done_at).length;

  return (
    <div className="space-y-3" data-testid="host-detail">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-bold">🎉 {h.event.title}</h3>
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><CalendarDays className="size-4" /> {whenWords(h.event.starts_at, family.timezone, h.event.all_day)}</span>
            {h.event.location ? <span className="inline-flex items-center gap-1"><MapPin className="size-4" /> {h.event.location}</span> : null}
          </p>
          <p className="text-base font-semibold">{coming} {coming === 1 ? "person" : "people"} coming</p>
        </div>
        {canChangeEvent(h.event, role, me.id) ? <Button variant="outline" data-testid="host-change" className="h-10 rounded-full" onClick={onEdit}>Change</Button> : null}
      </div>
      {!grownUp && mine ? <p className="rounded-2xl bg-[var(--status-amber-soft)] p-3 text-base">You have {mine} {mine === 1 ? "job" : "jobs"} to do</p> : null}
      <div className="flex gap-1.5">
        <Chip on={section === "guests"} onClick={() => setSection("guests")} className="min-h-11 text-base">👥 Guests</Chip>
        <Chip on={section === "get"} onClick={() => setSection("get")} className="min-h-11 text-base">🛒 To get</Chip>
        <Chip on={section === "do"} onClick={() => setSection("do")} className="min-h-11 text-base">✅ To do</Chip>
      </div>
      {section === "guests" ? <Guests h={h} guests={guests} grownUp={grownUp} /> : null}
      {section === "get" ? <Items h={h} kind="get" items={items.filter((i) => i.kind === "get")} grownUp={grownUp} /> : null}
      {section === "do" ? <Items h={h} kind="do" items={items.filter((i) => i.kind === "do")} grownUp={grownUp} /> : null}
    </div>
  );
}

function Guests({ h, guests, grownUp }: { h: Hosting; guests: Guest[]; grownUp: boolean }) {
  const [edit, setEdit] = useState<Guest | "new" | null>(null);
  const order = (g: Guest) => STATUS.findIndex((s) => s.key === g.status);
  const sorted = [...guests].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
  const diets = guests.filter((g) => g.dietary && g.status !== "no");
  return (
    <div className="space-y-2">
      {sorted.length ? (
        <ul className="space-y-1.5">
          {sorted.map((g) => {
            const s = STATUS.find((x) => x.key === g.status)!;
            return (
              <li key={g.id}>
                <button type="button" disabled={!grownUp} data-testid="guest-row" onClick={() => setEdit(g)}
                  className={cn("glass-tile flex w-full items-center gap-3 p-3 text-left disabled:cursor-default", g.status === "no" && "opacity-60")}>
                  <span className="text-xl" aria-hidden>{s.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{g.name}{g.people > 1 ? ` (${g.people})` : ""}</span>
                    <span className="block truncate text-sm text-muted-foreground">{[s.label, g.dietary].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-muted-foreground">{grownUp ? "Add who you've asked. Change them to coming or can't come as they reply." : "Nobody added yet."}</p>}
      {diets.length ? (
        <div className="rounded-2xl bg-[var(--surface)] p-3 text-sm" data-testid="diet-summary">
          <p className="font-semibold">Food to think about</p>
          {diets.map((g) => <p key={g.id}>{g.name}: {g.dietary}</p>)}
        </div>
      ) : null}
      {grownUp ? <Button variant="outline" data-testid="guest-add" className="h-11 rounded-full" onClick={() => setEdit("new")}><Plus className="size-4" /> Add a guest</Button> : null}
      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} title={edit === "new" ? "Add a guest" : "Change the guest"}>
        {edit !== null ? <GuestForm key={edit === "new" ? "new" : edit.id} h={h} existing={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
      </Sheet>
    </div>
  );
}

function GuestForm({ h, existing, onClose }: { h: Hosting; existing: Guest | null; onClose: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [name, setName] = useState(existing?.name ?? "");
  const [people, setPeople] = useState(existing?.people ?? 1);
  const [status, setStatus] = useState<Guest["status"]>(existing?.status ?? "invited");
  const [dietary, setDietary] = useState(existing?.dietary ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const row = { name: name.trim(), people, status, dietary: dietary.trim() || null };
      const { error } = existing
        ? await supabase.from("host_guests").update(row).eq("id", existing.id)
        : await supabase.from("host_guests").insert({ ...row, family_id: family.id, host_id: h.id });
      if (error) throw error;
      await refreshHosting(qc, family.id);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!existing) return;
    const { error } = await supabase.from("host_guests").update({ deleted_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) return void toast.error(errMsg(error));
    await refreshHosting(qc, family.id);
    onClose();
  }

  return (
    <div className="space-y-4">
      <Field label="Name"><Input data-testid="guest-name" data-autofocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="The Joneses" className="h-12 text-base" /></Field>
      <Field label="How many people?">
        <div className="flex items-center gap-3">
          <Button variant="outline" aria-label="One fewer" className="size-12 rounded-full text-xl" disabled={people <= 1} onClick={() => setPeople(people - 1)}>−</Button>
          <span className="w-8 text-center text-xl font-bold" data-testid="guest-people">{people}</span>
          <Button variant="outline" aria-label="One more" className="size-12 rounded-full text-xl" disabled={people >= 50} onClick={() => setPeople(people + 1)}>+</Button>
        </div>
      </Field>
      <Field label="Are they coming?">
        <div className="flex flex-wrap gap-2">{STATUS.map((s) => <Chip key={s.key} on={status === s.key} onClick={() => setStatus(s.key)} className="min-h-11 text-base">{s.emoji} {s.label}</Chip>)}</div>
      </Field>
      <Field label="Anything they can't eat?" hint="Optional"><Input data-testid="guest-diet" value={dietary} maxLength={120} onChange={(e) => setDietary(e.target.value)} placeholder="Vegetarian, no nuts" className="h-12 text-base" /></Field>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-testid="guest-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
        {existing ? <Button variant="ghost" className="h-12 rounded-full text-[var(--status-red)]" onClick={() => void remove()}><Trash2 className="size-4" /> Remove</Button> : null}
      </div>
    </div>
  );
}

function Items({ h, kind, items, grownUp }: { h: Hosting; kind: "get" | "do"; items: HostItem[]; grownUp: boolean }) {
  const { family, me, members } = useFamilyState();
  const qc = useQueryClient();
  const [v, setV] = useState("");
  const [who, setWho] = useState<string | null>(null);
  const people = useMemo(() => members.filter((m) => !m.archived_at), [members]);
  const sorted = [...items].sort((a, b) => Number(!!a.done_at) - Number(!!b.done_at) || a.created_at.localeCompare(b.created_at));

  async function add() {
    const title = v.trim().slice(0, 120);
    if (!title) return;
    const { error } = await supabase.from("host_items").insert({ family_id: family.id, host_id: h.id, kind, title, who: kind === "do" ? who : null });
    if (error) return void toast.error(errMsg(error));
    setV("");
    await refreshHosting(qc, family.id);
  }
  async function change(i: HostItem, fields: Partial<Pick<HostItem, "done_at" | "deleted_at" | "who">>) {
    const { error } = await supabase.from("host_items").update(fields).eq("id", i.id);
    if (error) return void toast.error(errMsg(error));
    await refreshHosting(qc, family.id);
  }

  return (
    <div className="space-y-2">
      {sorted.length ? (
        <ul>
          {sorted.map((i) => {
            const m = people.find((x) => x.id === i.who);
            const canTick = grownUp || i.who === me.id;
            return (
              <li key={i.id} className="flex min-h-12 items-center gap-2" data-testid="host-item">
                <button type="button" disabled={!canTick} aria-pressed={!!i.done_at} aria-label={i.done_at ? `Not done: ${i.title}` : `Done: ${i.title}`}
                  onClick={() => void change(i, { done_at: i.done_at ? null : new Date().toISOString() })}
                  className={cn("grid size-10 shrink-0 place-items-center rounded-full border-2 transition disabled:opacity-50",
                    i.done_at ? "border-transparent bg-[var(--status-green)] text-white" : "border-[var(--surface-border)] bg-[var(--surface)]")}>
                  <Check className="size-5" />
                </button>
                <span className={cn("min-w-0 flex-1 text-base", i.done_at && "text-muted-foreground line-through")}>{i.title}</span>
                {m ? <MemberAvatar member={m} size="sm" className="size-7 ring-0 ring-offset-0" /> : null}
                {grownUp ? <button type="button" aria-label={`Take off ${i.title}`} onClick={() => void change(i, { deleted_at: new Date().toISOString() })} className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-4" /></button> : null}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-muted-foreground">{kind === "get" ? "Food, drinks, balloons, anything to buy." : grownUp ? "Jobs to share out. Whoever you pick gets told." : "No jobs yet."}</p>}
      {grownUp ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input data-testid={`host-new-${kind}`} value={v} maxLength={120} onChange={(e) => setV(e.target.value)} placeholder={kind === "get" ? "Add something to get" : "Add a job"} className="h-11 text-base" onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
            <Button variant="outline" className="h-11 rounded-full" disabled={!v.trim()} onClick={() => void add()}><Plus className="size-4" /> Add</Button>
          </div>
          {kind === "do" ? (
            <div className="flex flex-wrap items-center gap-1.5" data-testid="host-who">
              <span className="text-sm text-muted-foreground">For</span>
              <Chip on={who === null} onClick={() => setWho(null)} className="min-h-10">Anyone</Chip>
              {people.map((m) => <Chip key={m.id} on={who === m.id} onClick={() => setWho(m.id)} className="min-h-10"><MemberAvatar member={m} size="sm" className="size-5 ring-0 ring-offset-0" /> {m.display_name}</Chip>)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- planning or changing (the Calendar event)

function HostForm({ existing, onClose, onSaved }: { existing: Hosting | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { family, me, members } = useFamilyState();
  const qc = useQueryClient();
  const tz = family.timezone;
  const today = todayIn(tz);
  const local = (iso: string) => {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
    const g = (k: string) => p.find((x) => x.type === k)?.value ?? "";
    return { day: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
  };
  const was = existing ? local(existing.event.starts_at) : null;
  const wasEnd = existing ? local(existing.event.ends_at) : null;
  const [title, setTitle] = useState(existing?.event.title ?? "");
  const [day, setDay] = useState(was?.day ?? "");
  const [from, setFrom] = useState(was?.time ?? "14:00");
  const [to, setTo] = useState(wasEnd?.time ?? "17:00");
  const [where, setWhere] = useState(existing?.event.location ?? "");
  const [hosts, setHosts] = useState<string[]>(existing?.event.people ?? [me.id]);
  const [busy, setBusy] = useState(false);
  const grownUps = useMemo(() => members.filter((m) => !m.archived_at && m.role !== "child"), [members]);

  async function save() {
    if (!day) return void toast.error("Pick the day");
    setBusy(true);
    try {
      const at = (hm: string) => { const [h, m] = hm.split(":").map(Number); return new Date(dayStart(day, tz).getTime() + (h * 60 + m) * 60000); };
      const starts = at(from || "00:00");
      let ends = at(to || from || "00:00");
      if (ends <= starts) ends = new Date(starts.getTime() + 3 * 3600_000);
      const fields = { title: title.trim(), type: "social", all_day: false, starts_at: starts.toISOString(), ends_at: ends.toISOString(), people: hosts, location: where.trim() || null };
      let id = existing?.id;
      if (existing) {
        await saveEventChanges(existing.event, fields);
      } else {
        const ev = await insertEvent({ ...fields, family_id: family.id });
        const { data, error } = await supabase.from("host_events").insert({ family_id: family.id, event_id: ev.id }).select("id").single();
        if (error) {
          await saveEventChanges(ev, { deleted_at: new Date().toISOString() }, true).catch(() => undefined);
          throw error;
        }
        id = data.id;
      }
      await refreshHosting(qc, family.id);
      toast.success(existing ? "Saved" : "On the Calendar");
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
      await refreshHosting(qc, family.id);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <div className="space-y-4">
      <Field label="What is it?"><Input data-testid="host-title" data-autofocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Mia's birthday party" className="h-12 text-base" /></Field>
      <div className="flex flex-wrap gap-3">
        <Field label="Day"><Input data-testid="host-day" type="date" value={day} min={existing ? undefined : today} onChange={(e) => setDay(e.target.value)} className="h-12 w-44 text-base" /></Field>
        <Field label="From"><Input data-testid="host-from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} className="h-12 w-32 text-base" /></Field>
        <Field label="Until"><Input data-testid="host-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} className="h-12 w-32 text-base" /></Field>
      </div>
      <Field label="Where" hint="Optional. Leave empty for at home"><Input value={where} maxLength={200} onChange={(e) => setWhere(e.target.value)} placeholder="The village hall" className="h-12 text-base" /></Field>
      <Field label="Who's hosting?" hint="They get the reminder the evening before">
        <div className="flex flex-wrap gap-2" data-testid="host-people">
          {grownUps.map((m) => {
            const on = hosts.includes(m.id);
            return <Chip key={m.id} on={on} onClick={() => setHosts(on ? hosts.filter((x) => x !== m.id) : [...hosts, m.id])} className="min-h-11 text-base"><MemberAvatar member={m} size="sm" className="size-6 ring-0 ring-offset-0" /> {m.display_name}</Chip>;
          })}
        </div>
      </Field>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-testid="host-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !title.trim() || !day} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
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
