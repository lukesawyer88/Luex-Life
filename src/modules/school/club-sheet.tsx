// Add or change a club: a weekly Calendar event for the child, plus the kit and cost kept here.
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { insertEvent, saveEventChanges, type CalEvent } from "@/modules/calendar/data";
import { atTime } from "@/modules/calendar/time";
import { Chip, Field, PeoplePicker, Sheet } from "@/modules/calendar/ui";

import {
  COST_EVERY_LABEL, DAY_CODE, DAY_SHORT, WEEKDAYS, addDaysKey, dateKeyIn, errMsg, refreshSchool, timeIn, todayIn, useSchoolSetup, weekdayOf,
  type Activity, type CalEventRow,
} from "./data";

type Value = { activity: Activity | null; event: CalEventRow | null } | null;
const EVERY = ["session", "week", "month", "term", "year"] as const;

/** the weekdays (1 = Monday) in a weekly repeat rule */
export function daysOfRule(rrule: string | null): number[] {
  const by = /BYDAY=([A-Z,]+)/.exec(rrule ?? "")?.[1]?.split(",") ?? [];
  return by.map((c) => DAY_CODE.indexOf(c)).filter((n) => n > 0).sort((a, b) => a - b);
}

export function ClubSheet({ value, onClose }: { value: Value; onClose: () => void }) {
  const open = value !== null;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={value?.event ? `Change ${value.event.title}` : "Add a club"}>
      {value ? <ClubForm key={value.activity?.id ?? "new"} activity={value.activity} event={value.event} onClose={onClose} /> : null}
    </Sheet>
  );
}

/** the first day on or after `from` that falls on one of the chosen weekdays */
function firstDay(from: string, days: number[]): string {
  for (let i = 0; i < 7; i++) {
    const k = addDaysKey(from, i);
    if (days.includes(weekdayOf(k))) return k;
  }
  return from;
}

function ClubForm({ activity, event, onClose }: { activity: Activity | null; event: CalEventRow | null; onClose: () => void }) {
  const { family, members } = useFamilyState();
  const qc = useQueryClient();
  const tz = family.timezone;
  const setup = useSchoolSetup().data;
  const clubs = (setup?.places ?? []).filter((p) => p.kind === "club");
  const children = members.filter((m) => m.role === "child" && !m.archived_at);
  const grownUps = members.filter((m) => m.role !== "child" && !m.archived_at);

  const [child, setChild] = useState<string | null>(activity?.member_id ?? (children.length === 1 ? children[0].id : null));
  const [name, setName] = useState(event?.title ?? "");
  const [placeId, setPlaceId] = useState<string | null>(activity?.place_id ?? null);
  const [days, setDays] = useState<number[]>(event ? daysOfRule(event.rrule) : []);
  const [start, setStart] = useState(event ? timeIn(event.starts_at, tz) : "16:00");
  const [end, setEnd] = useState(event ? timeIn(event.ends_at, tz) : "17:00");
  const [where, setWhere] = useState(event?.location ?? "");
  const [driver, setDriver] = useState<string[]>(event?.driver ? [event.driver] : []);
  const [kit, setKit] = useState<string[]>(activity?.kit ?? []);
  const [kitText, setKitText] = useState("");
  const [cost, setCost] = useState(activity?.cost != null ? Number(activity.cost).toFixed(2) : "");
  const [every, setEvery] = useState<(typeof EVERY)[number] | null>((activity?.cost_every as (typeof EVERY)[number] | null) ?? null);
  const [busy, setBusy] = useState(false);

  const toggleDay = (d: number) => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort((a, b) => a - b)));
  const addKit = () => {
    const t = kitText.trim().slice(0, 40);
    if (t && !kit.includes(t) && kit.length < 10) setKit([...kit, t]);
    setKitText("");
  };
  const ok = !!child && !!name.trim() && days.length > 0 && !!start && !!end && end > start;

  async function save() {
    const amt = cost.trim() ? Math.round(Number(cost.replace(/[£,\s]/g, "")) * 100) / 100 : null;
    if (amt != null && (!Number.isFinite(amt) || amt < 0 || amt >= 10000)) return void toast.error("Type a cost like 6.00");
    setBusy(true);
    try {
      // the club itself (picked, or a new one typed in)
      let pid = placeId && clubs.find((c) => c.id === placeId && c.name === name.trim()) ? placeId : null;
      if (!pid) {
        const same = clubs.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
        if (same) pid = same.id;
        else {
          const { data, error } = await supabase.from("school_places").insert({ family_id: family.id, name: name.trim(), kind: "club" }).select("id").single();
          if (error) throw error;
          pid = (data as { id: string }).id;
        }
      }
      // the Calendar event: weekly on the chosen days, starting from the first of them (from today, or from when it began)
      const fromKey = event ? dateKeyIn(event.starts_at, tz) : todayIn(tz);
      const day = firstDay(fromKey, days);
      const fields = {
        title: name.trim(), type: "activity", rrule: `FREQ=WEEKLY;BYDAY=${days.map((d) => DAY_CODE[d]).join(",")}`,
        starts_at: atTime(day, start, tz).toISOString(), ends_at: atTime(day, end, tz).toISOString(),
        people: [child!], driver: driver[0] ?? null, location: where.trim() || null,
      };
      const kitRow = { place_id: pid, kit, cost: amt, cost_every: amt != null ? every : null };
      if (event && activity) {
        await saveEventChanges(event as CalEvent, fields, true);
        const { error } = await supabase.from("school_activities").update(kitRow).eq("id", activity.id);
        if (error) throw error;
      } else {
        const ev = await insertEvent({ ...fields, family_id: family.id, all_day: false });
        const { error } = await supabase.from("school_activities").insert({ ...kitRow, family_id: family.id, member_id: child!, event_id: ev.id });
        if (error) {
          await saveEventChanges(ev, { deleted_at: new Date().toISOString() }, true).catch(() => undefined);
          throw error;
        }
      }
      await refreshSchool(qc, family.id);
      toast.success("On the calendar");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!activity ? (
        <Field label="Who's it for?">
          <div className="flex flex-wrap gap-2" data-testid="club-child">
            {children.map((c) => (
              <Chip key={c.id} on={child === c.id} onClick={() => setChild(c.id)} className="min-h-12 px-4 text-base">
                <MemberAvatar member={c} size="sm" className="size-6 ring-0 ring-offset-0" /> {c.display_name}
              </Chip>
            ))}
          </div>
        </Field>
      ) : null}
      <Field label="Which club">
        {clubs.length ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {clubs.map((c) => (
              <Chip key={c.id} on={placeId === c.id && name === c.name} onClick={() => { setPlaceId(c.id); setName(c.name); }}>{c.name}</Chip>
            ))}
          </div>
        ) : null}
        <Input data-testid="club-name" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setPlaceId(null); }} placeholder="Swimming" className="h-12 text-base" />
      </Field>
      <Field label="Which days">
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => (
            <Chip key={d} on={days.includes(d)} onClick={() => toggleDay(d)} className="min-h-12 min-w-14 justify-center text-base">
              <span data-testid={`club-day-${d}`}>{DAY_SHORT[d]}</span>
            </Chip>
          ))}
        </div>
      </Field>
      <div className="flex flex-wrap gap-3">
        <Field label="Starts"><Input data-testid="club-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-12 w-32 text-base" /></Field>
        <Field label="Ends"><Input data-testid="club-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-12 w-32 text-base" /></Field>
      </div>
      {start && end && end <= start ? <p className="text-sm text-[var(--status-red)]">The end needs to be after the start.</p> : null}
      <Field label="Where" hint="Optional">
        <Input data-testid="club-where" value={where} maxLength={200} onChange={(e) => setWhere(e.target.value)} placeholder="Leisure centre" className="h-12 text-base" />
      </Field>
      <Field label="Who takes them" hint="Optional">
        <PeoplePicker members={grownUps} value={driver} onChange={setDriver} single />
      </Field>
      <Field label="What to bring" hint="Optional. Shows on the day.">
        {kit.length ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {kit.map((k) => (
              <span key={k} className="inline-flex min-h-10 items-center gap-1 rounded-full bg-[var(--surface)] pl-3 pr-1 text-sm font-medium">
                {k}
                <button type="button" className="grid size-8 place-items-center rounded-full hover:bg-muted" aria-label={`Remove ${k}`} onClick={() => setKit(kit.filter((x) => x !== k))}><X className="size-4" /></button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2">
          <Input data-testid="club-kit-input" value={kitText} maxLength={40} onChange={(e) => setKitText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKit(); } }} placeholder="Towel" className="h-12 flex-1 text-base" />
          <Button variant="outline" className="h-12 rounded-full" disabled={!kitText.trim()} onClick={addKit}>Add</Button>
        </div>
      </Field>
      <Field label="Cost" hint="Optional. A reminder only.">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold">£</span>
          <Input data-testid="club-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" className="h-12 w-28 text-base" />
          {cost.trim() ? EVERY.map((e) => <Chip key={e} on={every === e} onClick={() => setEvery(every === e ? null : e)}>{COST_EVERY_LABEL[e]}</Chip>) : null}
        </div>
      </Field>
      <div className="flex gap-2 pt-1">
        <Button data-testid="club-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !ok} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
