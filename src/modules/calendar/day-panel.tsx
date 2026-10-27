import { useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2, NotebookPen, Plus, Sparkles, Sun, Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";

import { countdownText } from "./event-detail";
import type { EditorMode } from "./event-editor";
import { useChores, useDayNotes, useRoutines, type Term } from "./data";
import { useOccurrences, type Occ } from "./occurrences";
import { datesBetween } from "./recurrence";
import { addDays, longDate, todayKey, weekdayOf } from "./time";
import { DayList, termFor } from "./views";
import { weatherLook, type DayWeather } from "./weather";

type Props = {
  dayK: string;
  occs: Occ[];
  terms: Term[];
  weather?: DayWeather;
  onOpen: (o: Occ) => void;
  onAdd: (m: EditorMode) => void;
  onTab: (t: "chores" | "routines") => void;
  compact?: boolean;
  hideTitle?: boolean;
};

/** One day: weather, school term, countdowns, the handover note, what's on and today's jobs */
export function DayPanel({ dayK, occs, terms, weather, onOpen, onAdd, onTab, compact, hideTitle }: Props) {
  const { family, me, role } = useFamilyState();
  const tz = family.timezone;
  const today = todayKey(tz);
  const term = termFor(terms, dayK);
  const chores = useChores();
  const routines = useRoutines();

  const jobs = useMemo(() => {
    const list = (chores.data ?? []).filter((c) => c.active && datesBetween(c.rrule, c.starts_on, dayK, dayK).length > 0);
    return role === "child" ? list.filter((c) => c.people.includes(me.id) || c.people.length === 0) : list;
  }, [chores.data, dayK, role, me.id]);
  const dayRoutines = useMemo(() => {
    const wd = weekdayOf(dayK);
    const list = (routines.data ?? []).filter((r) => r.active && r.days.includes(wd));
    return role === "child" ? list.filter((r) => r.member_id === me.id) : list;
  }, [routines.data, dayK, role, me.id]);

  return (
    <div className="space-y-4">
      {!hideTitle && !compact ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{dayK === today ? "Today" : dayK === addDays(today, 1) ? "Tomorrow" : ""}</p>
          <h2 className="text-lg font-bold">{longDate(dayK)}</h2>
        </div>
      ) : null}

      {weather || term ? (
        <div className="flex flex-wrap gap-1.5 text-sm">
          {weather ? (() => { const { icon: I, label } = weatherLook(weather.code); return <span className="inline-flex items-center gap-1.5 rounded-full bg-white/55 px-3 py-1.5 dark:bg-black/20"><I className="size-4" /> {label}, {weather.min}° to {weather.max}°</span>; })() : null}
          {term ? <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: term.kind === "term" ? "var(--ev-term)" : term.kind === "inset" ? "var(--ev-inset)" : "var(--ev-holiday)" }}>{term.name}{term.label ? ` · ${term.label}` : ""}</span> : null}
        </div>
      ) : null}

      {dayK === today && !compact ? <Countdowns /> : null}

      <HandoverNote dayK={dayK} />

      {!compact ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-sm font-bold">What's on</h3>
            <Button size="sm" className="h-9 rounded-full" onClick={() => onAdd({ kind: "new", dayK })}><Plus className="size-4" /> Add</Button>
          </div>
          <DayList dayK={dayK} occs={occs} onOpen={onOpen} />
        </div>
      ) : null}

      {jobs.length || dayRoutines.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {jobs.length ? (
            <button type="button" onClick={() => onTab("chores")} className="flex min-h-12 items-center gap-2 rounded-2xl bg-white/55 px-3 text-left text-sm font-semibold dark:bg-black/20">
              <Sparkles className="size-4" /> {jobs.length} {jobs.length === 1 ? "chore" : "chores"} {dayK === today ? "today" : "this day"}
            </button>
          ) : null}
          {dayRoutines.length ? (
            <button type="button" onClick={() => onTab("routines")} className="flex min-h-12 items-center gap-2 rounded-2xl bg-white/55 px-3 text-left text-sm font-semibold dark:bg-black/20">
              <Sun className="size-4" /> {dayRoutines.length} {dayRoutines.length === 1 ? "routine" : "routines"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** "12 sleeps to Christmas" and any events marked with a countdown */
export function Countdowns() {
  const { family } = useFamilyState();
  const today = todayKey(family.timezone);
  const { occs } = useOccurrences(today, addDays(today, 120), []);
  const list = occs
    .filter((o) => o.startDay > today && ((o.event.countdown && !o.virtual) || (o.virtual?.kind === "christmas" && today.slice(5, 7) === "12")))
    .slice(0, 3);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((o) => (
        <span key={o.key} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--tile-active)] px-3 py-1.5 text-sm font-semibold text-[var(--tile-active-fg)]">
          {o.virtual ? <Gift className="size-4" /> : <Timer className="size-4" />}
          {countdownText(today, o.startDay).replace(" to go", "")} to {o.virtual ? "Christmas" : o.event.title}
        </span>
      ))}
    </div>
  );
}

/** A note for whoever is looking after the children that day */
function HandoverNote({ dayK }: { dayK: string }) {
  const { family, role } = useFamilyState();
  const qc = useQueryClient();
  const q = useDayNotes(dayK, dayK);
  const note = q.data?.find((n) => n.day === dayK);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const canEdit = role !== "child";

  useEffect(() => {
    setEditing(false);
    setText(note?.body ?? "");
  }, [dayK, note?.body]);

  async function save() {
    setBusy(true);
    try {
      if (!text.trim()) {
        if (note) {
          const { error } = await supabase.from("cal_day_notes").delete().eq("id", note.id);
          if (error) throw error;
        }
      } else if (note) {
        const { error } = await supabase.from("cal_day_notes").update({ body: text.trim() }).eq("id", note.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cal_day_notes").insert({ family_id: family.id, day: dayK, body: text.trim() });
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["cal", family.id, "notes"] });
      setEditing(false);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!note && !canEdit) return null;
  if (editing) {
    return (
      <div className="space-y-2 rounded-2xl bg-white/55 p-3 dark:bg-black/20">
        <p className="text-sm font-bold">Note for the day</p>
        <Textarea autoFocus value={text} maxLength={1000} rows={3} placeholder="e.g. Tom has a cold, no swimming. Gran is picking up." onChange={(e) => setText(e.target.value)} />
        <div className="flex gap-2">
          <Button className="h-10 rounded-full" onClick={save} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}</Button>
          <Button variant="ghost" className="h-10 rounded-full" onClick={() => { setEditing(false); setText(note?.body ?? ""); }}>Cancel</Button>
        </div>
      </div>
    );
  }
  if (!note) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="flex min-h-11 w-full items-center gap-2 rounded-2xl border border-dashed border-current/20 px-3 text-left text-sm opacity-80">
        <NotebookPen className="size-4" /> Add a note for the day (for a babysitter or grandparent)
      </button>
    );
  }
  return (
    <button type="button" disabled={!canEdit} onClick={() => setEditing(true)} className="w-full rounded-2xl bg-[var(--status-amber-soft)] p-3 text-left text-sm">
      <span className="mb-0.5 flex items-center gap-1.5 font-bold"><NotebookPen className="size-4" /> Note for the day</span>
      <span className="whitespace-pre-wrap">{note.body}</span>
    </button>
  );
}
