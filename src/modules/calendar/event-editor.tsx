import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Loader2, Lock, MapPin, Users } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

import {
  EditClash, FIELD_NAMES, insertEvent, prefsOf, refreshCalendar, saveEventChanges, usePlaces,
  type CalEvent, type EventDraft,
} from "./data";
import { findClashes, useOccurrences, type Occ } from "./occurrences";
import { defaultSpec, describeRule, ruleToSpec, specToRule, untilBefore, type RepeatPreset, type RepeatSpec } from "./recurrence";
import { addDays, atTime, dayKey, daysBetween, dayStart, minutesOf, pad, parts, shortDay, timeOf, todayKey } from "./time";
import { allTypes, REMINDER_CHOICES, type EventType } from "./types";
import { Chip, Field, PeoplePicker, Sheet } from "./ui";

export type EditorMode =
  | { kind: "new"; dayK?: string; time?: string; type?: EventType; title?: string; people?: string[] }
  | { kind: "edit"; occ: Occ; series: CalEvent };

/** Guess the type from the name, so most events need no extra tap */
export function guessType(title: string): EventType | null {
  const t = title.toLowerCase();
  if (/birthday|bday/.test(t)) return "birthday";
  if (/dentist|doctor|\bgp\b|hospital|clinic|optician|vet|appointment|jab|vaccin|haircut|hair cut/.test(t)) return "appointment";
  if (/school|inset|parents.? evening|homework|exam|nursery|college|uni\b|pe kit|trip form/.test(t)) return "school";
  if (/football|swim|club|practice|training|match|dance|lesson|rugby|cricket|gym|karate|scouts|brownies|cubs|beavers|guides|ballet|piano|music/.test(t)) return "activity";
  if (/party|visit|dinner|lunch with|sleepover|play ?date|wedding|bbq|barbecue|drinks/.test(t)) return "social";
  if (/holiday|flight|trip|hotel|airport|ferry|camping|half term away/.test(t)) return "trip";
  if (/work|shift|meeting|office|on call/.test(t)) return "work";
  if (/remind|remember|bin|bins|pay|renew|order|book /.test(t)) return "reminder";
  return null;
}

type Scope = "one" | "after" | "all";

const PRESETS: { key: RepeatPreset; label: (k: string) => string }[] = [
  { key: "none", label: () => "Does not repeat" },
  { key: "daily", label: () => "Every day" },
  { key: "weekdays", label: () => "Every weekday (Mon to Fri)" },
  { key: "weekly", label: (k) => `Every week on ${shortDay(dayOfWeek(k))}` },
  { key: "fortnightly", label: (k) => `Every other week on ${shortDay(dayOfWeek(k))}` },
  { key: "monthly", label: (k) => `Every month on the ${Number(k.slice(8))}${ordSuffix(Number(k.slice(8)))}` },
  { key: "monthly-weekday", label: (k) => describeRule(specToRule({ ...defaultSpec(k), preset: "monthly-weekday" }, k), k) },
  { key: "quarterly", label: () => "Every 3 months" },
  { key: "yearly", label: () => "Every year" },
  { key: "custom", label: () => "Something else…" },
];
function dayOfWeek(k: string) {
  const [y, m, d] = k.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}
function ordSuffix(n: number) {
  if (n >= 11 && n <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

function nextHour(tz: string): string {
  const p = parts(new Date(Date.now() + 60 * 60 * 1000), tz);
  return `${pad(p.h)}:00`;
}
function plusMinutes(hhmm: string, n: number): string {
  const t = (minutesOf(hhmm) + n + 24 * 60) % (24 * 60);
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

export function EventEditor({ open, onOpenChange, mode, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; mode: EditorMode; onSaved?: (ev: CalEvent) => void }) {
  const { family, me, members, isParent, role } = useFamilyState();
  const qc = useQueryClient();
  const tz = family.timezone;
  const prefs = prefsOf(family);
  const types = allTypes(prefs);
  const placesQ = usePlaces();
  const editing = mode.kind === "edit" ? mode : null;
  const series = editing?.series;
  const occ = editing?.occ;

  // ---------------------------------------------------------------- form state
  const init = useMemo(() => {
    if (occ && series) {
      const ev = occ.event;
      const sK = occ.startDay;
      return {
        title: ev.title, type: ev.type as EventType, allDay: ev.all_day, startDay: sK,
        startTime: ev.all_day ? "09:00" : timeOf(occ.start, tz), endDay: occ.allDay ? occ.endDay : dayKey(occ.end, tz),
        endTime: ev.all_day ? "10:00" : timeOf(occ.end, tz), spec: ruleToSpec(series.rrule, dayKey(new Date(series.starts_at), tz)),
        people: ev.people, reminders: ev.reminders, placeId: ev.place_id, location: ev.location ?? "", travel: ev.travel_minutes,
        driver: ev.driver, notes: ev.notes ?? "", bookingRef: ev.booking_ref ?? "", link: ev.link ?? "", countdown: ev.countdown,
        visibility: ev.visibility as "all" | "selected", viewers: ev.viewers,
      };
    }
    const m = mode.kind === "new" ? mode : { kind: "new" as const };
    const sK = m.dayK ?? todayKey(tz);
    const st = m.time ?? nextHour(tz);
    return {
      title: m.title ?? "", type: (m.type ?? "other") as EventType, allDay: m.type === "birthday" || m.type === "trip", startDay: sK,
      startTime: st, endDay: sK, endTime: plusMinutes(st, 60), spec: defaultSpec(sK),
      people: m.people ?? (role === "child" ? [me.id] : []), reminders: m.type === "reminder" ? [0] : ([] as number[]),
      placeId: null as string | null, location: "", travel: null as number | null, driver: null as string | null, notes: "",
      bookingRef: "", link: "", countdown: false, visibility: "all" as "all" | "selected", viewers: [] as string[],
    };
  }, [mode, occ, series, tz, role, me.id]);

  const [f, setF] = useState(init);
  const [typeTouched, setTypeTouched] = useState(false);
  const [more, setMore] = useState(false);
  const [multiDay, setMultiDay] = useState(false);
  const [savePlace, setSavePlace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [askScope, setAskScope] = useState<null | "save">(null);
  const [clash, setClash] = useState<EditClash | null>(null);

  useEffect(() => {
    if (open) {
      setF(init);
      setTypeTouched(mode.kind === "edit" || !!(mode.kind === "new" && mode.type));
      setMore(false);
      setMultiDay(init.endDay !== init.startDay);
      setSavePlace(false);
      setAskScope(null);
      setClash(null);
    }
  }, [open, init, mode]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  // ---------------------------------------------------------------- derived
  const start = f.allDay ? dayStart(f.startDay, tz) : atTime(f.startDay, f.startTime, tz);
  const endDayK = multiDay ? (f.endDay < f.startDay ? f.startDay : f.endDay) : f.startDay;
  let end = f.allDay ? dayStart(endDayK, tz) : atTime(endDayK, f.endTime, tz);
  if (!f.allDay && end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);
  const rule = specToRule(f.spec, f.startDay);
  const place = placesQ.data?.find((p) => p.id === f.placeId);
  const travel = f.travel ?? place?.travel_minutes ?? null;
  const leaveBy = !f.allDay && travel ? timeOf(new Date(start.getTime() - travel * 60000), tz) : null;
  const adults = members.filter((m) => m.role !== "child");

  const windowQ = useOccurrences(f.startDay, endDayK, []);
  const clashes = useMemo(
    () => findClashes({ start, end, allDay: f.allDay, people: f.people, driver: f.driver, ignoreSeries: series?.id }, windowQ.occs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [start.getTime(), end.getTime(), f.allDay, f.people, f.driver, series?.id, windowQ.occs],
  );

  function fields(): EventDraft {
    return {
      title: f.title.trim(),
      type: f.type,
      all_day: f.allDay,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      people: f.people,
      reminders: [...new Set(f.reminders)].slice(0, 5),
      place_id: f.placeId,
      location: (place?.name ?? f.location.trim()) || null,
      travel_minutes: f.allDay ? null : (f.travel ?? place?.travel_minutes ?? null),
      driver: f.driver,
      notes: f.notes.trim() || null,
      booking_ref: f.bookingRef.trim() || null,
      link: f.link.trim() ? (/^https?:\/\//i.test(f.link.trim()) ? f.link.trim() : `https://${f.link.trim()}`) : null,
      countdown: f.countdown,
      visibility: isParent ? f.visibility : "all",
      viewers: isParent && f.visibility === "selected" ? f.viewers.filter((v) => v !== me.id) : [],
    };
  }

  async function maybeSavePlace(): Promise<string | null> {
    if (!savePlace || f.placeId || !f.location.trim() || role === "child") return f.placeId;
    const { data, error } = await supabase
      .from("cal_places")
      .insert({ family_id: family.id, name: f.location.trim(), travel_minutes: f.travel })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  // ---------------------------------------------------------------- saving
  async function doSave(scope: Scope | null, force = false) {
    setBusy(true);
    try {
      const placeId = await maybeSavePlace();
      const base = { ...fields(), place_id: placeId };
      let saved: CalEvent;
      if (!series || !occ) {
        saved = await insertEvent({ ...base, family_id: family.id, title: base.title!, starts_at: base.starts_at!, ends_at: base.ends_at!, rrule: rule });
        toast.success(`${saved.title} added`);
      } else if (!series.rrule || scope === null) {
        saved = await saveEventChanges(occ.event, { ...base, rrule: series.recurrence_of ? null : rule }, force);
        toast.success("Saved");
      } else if (scope === "one") {
        if (occ.event.id !== series.id) {
          saved = await saveEventChanges(occ.event, base, force);
        } else {
          saved = await insertEvent({
            ...base, family_id: family.id, title: base.title!, starts_at: base.starts_at!, ends_at: base.ends_at!,
            recurrence_of: series.id, recurrence_date: occ.originalStart.toISOString(),
          });
        }
        toast.success("Saved for this date only");
      } else {
        const isFirst = occ.originalStart.getTime() === new Date(series.starts_at).getTime();
        const seriesStartK = dayKey(new Date(series.starts_at), tz);
        const shiftDays = daysBetween(occ.startDay, f.startDay);
        if (scope === "all" || isFirst) {
          // move the whole series by the same number of days, at the new time
          const newStartK = addDays(seriesStartK, shiftDays);
          const sStart = f.allDay ? dayStart(newStartK, tz) : atTime(newStartK, f.startTime, tz);
          const sEnd = new Date(sStart.getTime() + (end.getTime() - start.getTime()));
          const timeChanged = shiftDays !== 0 || (!f.allDay && f.startTime !== timeOf(occ.start, tz)) || f.allDay !== series.all_day;
          const exdates = timeChanged
            ? series.exdates.map((x) => {
                const k = addDays(dayKey(new Date(x), tz), shiftDays);
                return (f.allDay ? dayStart(k, tz) : atTime(k, f.startTime, tz)).toISOString();
              })
            : series.exdates;
          saved = await saveEventChanges(series, {
            ...base, starts_at: sStart.toISOString(), ends_at: sEnd.toISOString(), rrule: specToRule(f.spec, newStartK), exdates,
          }, force);
          if (timeChanged) {
            await supabase.from("cal_events").update({ deleted_at: new Date().toISOString() }).eq("recurrence_of", series.id).is("deleted_at", null);
          }
          toast.success("Saved for every date");
        } else {
          // end the old series the day before, and start a new one from here
          await saveEventChanges(series, { rrule: untilBefore(series.rrule, occ.originalStart, tz) }, true);
          await supabase.from("cal_events").update({ deleted_at: new Date().toISOString() })
            .eq("recurrence_of", series.id).gte("recurrence_date", occ.originalStart.toISOString()).is("deleted_at", null);
          saved = await insertEvent({ ...base, family_id: family.id, title: base.title!, starts_at: base.starts_at!, ends_at: base.ends_at!, rrule: rule });
          toast.success("Saved for this date and all after it");
        }
      }
      await refreshCalendar(qc, family.id);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof EditClash) setClash(err);
      else toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) return toastNeedName();
    if (series?.rrule && occ) setAskScope("save");
    else void doSave(null);
  }
  function toastNeedName() {
    toast.error("Give it a name first");
  }

  const canChooseViewers = isParent;
  const isRepeatEdit = !!(series?.rrule && occ);

  // ---------------------------------------------------------------- screen
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Change event" : "Add to the calendar"}
      footer={
        <>
          <Button type="submit" form="event-form" className="h-11 flex-1 rounded-full px-6 sm:flex-none" disabled={busy || !f.title.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : editing ? "Save changes" : "Add"}
          </Button>
          <Button type="button" variant="ghost" className="h-11 rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
        </>
      }
    >
      <form id="event-form" onSubmit={submit} className="space-y-5">
        <Input
          data-autofocus
          autoFocus={!editing}
          value={f.title}
          maxLength={120}
          placeholder="What is it? e.g. Football, Dentist, Gran's visit"
          aria-label="Name"
          className="h-12 text-base font-semibold"
          onChange={(e) => {
            const v = e.target.value;
            setF((x) => {
              const g = !typeTouched ? guessType(v) : null;
              const t = g ?? (typeTouched ? x.type : "other");
              return { ...x, title: v, type: t, allDay: !typeTouched && (t === "birthday" || t === "trip") ? true : x.allDay, reminders: !typeTouched && t === "reminder" && !x.reminders.length ? [0] : x.reminders };
            });
          }}
        />

        <Field label="Type">
          <div className="flex flex-wrap gap-1.5">
            {types.map((t) => {
              const Icon = t.icon;
              return (
                <Chip key={t.key} on={f.type === t.key} onClick={() => { setTypeTouched(true); set("type", t.key); }}>
                  <span className="grid size-6 place-items-center rounded-full text-white" style={{ background: t.colour }}><Icon className="size-3.5" /></span>
                  {t.label}
                </Chip>
              );
            })}
          </div>
        </Field>

        <Field label="When">
          <div className="space-y-2">
            <label className="flex min-h-10 items-center justify-between gap-3 text-sm">
              All day
              <Switch checked={f.allDay} onCheckedChange={(v) => set("allDay", v)} />
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Input type="date" aria-label="Date" value={f.startDay} onChange={(e) => e.target.value && setF((x) => ({ ...x, startDay: e.target.value, endDay: x.endDay < e.target.value ? e.target.value : x.endDay }))} className="h-11 col-span-2 sm:col-span-1" />
              {!f.allDay ? (
                <>
                  <Input type="time" aria-label="Starts" value={f.startTime} onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    setF((x) => ({ ...x, startTime: v, endTime: plusMinutes(v, Math.max(15, minutesOf(x.endTime) - minutesOf(x.startTime))) }));
                  }} className="h-11" />
                  <Input type="time" aria-label="Ends" value={f.endTime} onChange={(e) => e.target.value && set("endTime", e.target.value)} className="h-11" />
                </>
              ) : null}
            </div>
            <label className="flex min-h-10 items-center justify-between gap-3 text-sm">
              Goes over more than one day
              <Switch checked={multiDay} onCheckedChange={setMultiDay} />
            </label>
            {multiDay ? (
              <Input type="date" aria-label="Last day" min={f.startDay} value={f.endDay < f.startDay ? f.startDay : f.endDay} onChange={(e) => e.target.value && set("endDay", e.target.value)} className="h-11" />
            ) : null}
          </div>
        </Field>

        <Field label="Repeat" hint={isRepeatEdit ? "Changing the repeat applies to this date and the ones after it, or to all of them." : undefined}>
          <RepeatPicker spec={f.spec} startK={f.startDay} onChange={(s) => set("spec", s)} />
        </Field>

        <Field label="Who is it for?" hint="Leave empty if it's for the whole family.">
          <PeoplePicker members={members} value={f.people} onChange={(v) => set("people", v)} />
        </Field>

        <Field label="Remind me">
          <div className="flex flex-wrap gap-1.5">
            {REMINDER_CHOICES.filter((r) => !f.allDay || r.minutes >= 1440 || r.minutes === 0).map((r) => (
              <Chip
                key={r.minutes}
                on={f.reminders.includes(r.minutes)}
                onClick={() => set("reminders", f.reminders.includes(r.minutes) ? f.reminders.filter((x) => x !== r.minutes) : [...f.reminders, r.minutes].slice(-5))}
              >
                {f.allDay && r.minutes === 0 ? "On the morning" : r.label}
              </Chip>
            ))}
          </div>
        </Field>

        {clashes.length ? (
          <div className="rounded-2xl bg-[var(--status-amber-soft)] p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-[var(--status-amber)]"><AlertTriangle className="size-4" /> This clashes</p>
            <ul className="mt-1 space-y-0.5">
              {clashes.slice(0, 4).map((c) => {
                const who = members.find((m) => m.id === c.memberId)?.display_name ?? "Someone";
                return (
                  <li key={c.occ.key}>
                    {c.why === "driver" ? `${who} is already taking someone to ` : `${who} already has `}
                    <b>{c.occ.event.title}</b> {timeOf(c.occ.start, tz)}–{timeOf(c.occ.end, tz)}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <button type="button" onClick={() => setMore((x) => !x)} className="flex min-h-10 w-full items-center justify-between rounded-xl text-sm font-semibold">
          More: place, lift, notes, tickets{canChooseViewers ? ", who sees it" : ""}
          <ChevronDown className={cn("size-4 transition", more && "rotate-180")} />
        </button>

        {more ? (
          <div className="space-y-5">
            <Field label={<span className="inline-flex items-center gap-1.5"><MapPin className="size-4" /> Where</span>} hint={leaveBy ? `Leave by ${leaveBy}. You'll get a "leave now" alert if notifications are on.` : "Add how long it takes to get there and we'll tell you when to leave."}>
              <div className="space-y-2">
                {placesQ.data?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {placesQ.data.map((p) => (
                      <Chip key={p.id} on={f.placeId === p.id} onClick={() => setF((x) => ({ ...x, placeId: x.placeId === p.id ? null : p.id, travel: x.placeId === p.id ? x.travel : null }))}>
                        {p.name}{p.travel_minutes ? <span className="opacity-70">· {p.travel_minutes} min</span> : null}
                      </Chip>
                    ))}
                  </div>
                ) : null}
                {!f.placeId ? (
                  <div className="grid grid-cols-[1fr_7.5rem] gap-2">
                    <Input value={f.location} maxLength={200} placeholder="Place or address" aria-label="Place" onChange={(e) => set("location", e.target.value)} className="h-11" />
                    <Input type="number" inputMode="numeric" min={0} max={600} value={f.travel ?? ""} placeholder="Mins away" aria-label="Journey time in minutes" onChange={(e) => set("travel", e.target.value === "" ? null : Math.max(0, Math.min(600, Number(e.target.value))))} className="h-11" />
                  </div>
                ) : null}
                {!f.placeId && f.location.trim() && role !== "child" ? (
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={savePlace} onChange={(e) => setSavePlace(e.target.checked)} /> Save this place for next time</label>
                ) : null}
              </div>
            </Field>

            <Field label="Who's taking them?">
              <PeoplePicker members={adults} value={f.driver ? [f.driver] : []} onChange={(v) => set("driver", v[0] ?? null)} single />
            </Field>

            <Field label="Notes">
              <Textarea value={f.notes} maxLength={4000} rows={3} placeholder="Anything to remember: what to bring, who's going" onChange={(e) => set("notes", e.target.value)} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Booking or ticket reference">
                <Input value={f.bookingRef} maxLength={200} onChange={(e) => set("bookingRef", e.target.value)} className="h-11" />
              </Field>
              <Field label="Link">
                <Input value={f.link} maxLength={500} inputMode="url" placeholder="https://" onChange={(e) => set("link", e.target.value)} className="h-11" />
              </Field>
            </div>
            <p className="-mt-3 text-xs text-muted-foreground">You can add photos of letters and tickets once it's saved.</p>

            <label className="flex min-h-10 items-center justify-between gap-3 text-sm font-semibold">
              Show a countdown ("5 sleeps to go")
              <Switch checked={f.countdown} onCheckedChange={(v) => set("countdown", v)} />
            </label>

            {canChooseViewers ? (
              <Field label={<span className="inline-flex items-center gap-1.5"><Lock className="size-4" /> Who can see it?</span>} hint="Pick people to keep it a surprise. Only you and the people you pick will see it, even if it's about someone else.">
                <div className="flex flex-wrap gap-1.5">
                  <Chip on={f.visibility === "all"} onClick={() => set("visibility", "all")}><Users className="size-4" /> Everyone</Chip>
                  <Chip on={f.visibility === "selected"} onClick={() => set("visibility", "selected")}><Lock className="size-4" /> Only people I pick</Chip>
                </div>
                {f.visibility === "selected" ? (
                  <div className="pt-2">
                    <PeoplePicker members={members.filter((m) => m.id !== me.id && m.user_id)} value={f.viewers} onChange={(v) => set("viewers", v)} />
                    <p className="mt-1 text-xs text-muted-foreground">{f.viewers.length ? "" : "Only you will see it."} People without a login can't see the calendar anyway.</p>
                  </div>
                ) : null}
              </Field>
            ) : null}
          </div>
        ) : null}
      </form>

      {/* which dates does a change to a repeating event apply to? */}
      <Sheet open={askScope !== null} onOpenChange={(o) => !o && setAskScope(null)} title="This event repeats" description="Which dates should change?">
        <div className="grid gap-2">
          <Button className="h-12 rounded-full" disabled={busy} onClick={() => { setAskScope(null); void doSave("one"); }}>Just this date</Button>
          <Button variant="outline" className="h-12 rounded-full" disabled={busy} onClick={() => { setAskScope(null); void doSave("after"); }}>This date and all after it</Button>
          <Button variant="outline" className="h-12 rounded-full" disabled={busy} onClick={() => { setAskScope(null); void doSave("all"); }}>Every date</Button>
        </div>
      </Sheet>

      {/* someone else changed the same thing while this was open */}
      <Sheet open={!!clash} onOpenChange={(o) => !o && setClash(null)} title="Someone else just changed this">
        {clash ? (
          <div className="space-y-3 text-sm">
            <p>
              {members.find((m) => m.id === clash.latest.updated_by_member)?.display_name ?? "Someone"} changed the{" "}
              <b>{[...new Set(clash.fields.map((x) => FIELD_NAMES[x] ?? x))].join(", ")}</b> while you were editing.
            </p>
            <div className="grid gap-2">
              <Button className="h-12 rounded-full" disabled={busy} onClick={() => { setClash(null); void doSave(isRepeatEdit ? "one" : null, true); }}>Keep my changes</Button>
              <Button variant="outline" className="h-12 rounded-full" onClick={() => { setClash(null); onOpenChange(false); void refreshCalendar(qc, family.id); toast("Kept their changes"); }}>Keep theirs</Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </Sheet>
  );
}

// ---------------------------------------------------------------- repeat picker

function RepeatPicker({ spec, startK, onChange }: { spec: RepeatSpec; startK: string; onChange: (s: RepeatSpec) => void }) {
  const rule = specToRule(spec, startK);
  return (
    <div className="space-y-2">
      <select
        aria-label="Repeat"
        value={spec.preset}
        onChange={(e) => onChange({ ...spec, preset: e.target.value as RepeatPreset, days: spec.days.length ? spec.days : [dayOfWeek(startK)] })}
        className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label(startK)}</option>)}
      </select>
      {spec.preset === "custom" ? (
        <div className="space-y-2 rounded-2xl bg-muted/60 p-3">
          <div className="flex items-center gap-2 text-sm">
            Every
            <Input type="number" min={1} max={99} value={spec.interval} onChange={(e) => onChange({ ...spec, interval: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })} className="h-10 w-16" aria-label="How often" />
            <select value={spec.freq} onChange={(e) => onChange({ ...spec, freq: e.target.value as RepeatSpec["freq"] })} className="h-10 rounded-md border border-input bg-background px-2" aria-label="Unit">
              <option value="DAILY">{spec.interval > 1 ? "days" : "day"}</option>
              <option value="WEEKLY">{spec.interval > 1 ? "weeks" : "week"}</option>
              <option value="MONTHLY">{spec.interval > 1 ? "months" : "month"}</option>
              <option value="YEARLY">{spec.interval > 1 ? "years" : "year"}</option>
            </select>
          </div>
          {spec.freq === "WEEKLY" ? (
            <div className="flex flex-wrap gap-1">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <Chip key={d} className="min-w-11 justify-center px-2" on={spec.days.includes(d)} onClick={() => {
                  const next = spec.days.includes(d) ? spec.days.filter((x) => x !== d) : [...spec.days, d];
                  onChange({ ...spec, days: next.length ? next : [d] });
                }}>{shortDay(d)}</Chip>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {spec.preset !== "none" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select value={spec.ends} onChange={(e) => onChange({ ...spec, ends: e.target.value as RepeatSpec["ends"] })} className="h-10 rounded-md border border-input bg-background px-2" aria-label="Ends">
            <option value="never">Keeps going</option>
            <option value="on">Stops on a date</option>
            <option value="after">Stops after a number of times</option>
          </select>
          {spec.ends === "on" ? <Input type="date" min={startK} value={spec.until} onChange={(e) => e.target.value && onChange({ ...spec, until: e.target.value })} className="h-10 w-auto" aria-label="Last date" /> : null}
          {spec.ends === "after" ? <Input type="number" min={1} max={999} value={spec.count} onChange={(e) => onChange({ ...spec, count: Math.max(1, Math.min(999, Number(e.target.value) || 1)) })} className="h-10 w-20" aria-label="Times" /> : null}
        </div>
      ) : null}
      {spec.preset !== "none" ? <p className="text-xs text-muted-foreground">{describeRule(rule, startK)}</p> : null}
    </div>
  );
}
