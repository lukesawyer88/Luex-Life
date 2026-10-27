import { Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";

import { prefsOf, useSearchEvents } from "./data";
import { describeRule } from "./recurrence";
import { dayKey, shortDate, timeOf } from "./time";
import { typeInfo } from "./types";
import { Sheet } from "./ui";

/** Free search across every event the person can see */
export function SearchDialog({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (dayK: string) => void }) {
  const { family } = useFamilyState();
  const tz = family.timezone;
  const prefs = prefsOf(family);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(text), 250);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => {
    if (!open) { setText(""); setQ(""); }
  }, [open]);
  const res = useSearchEvents(q);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Search the calendar">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input data-autofocus autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Football, dentist, Gran…" className="h-12 pl-9 text-base" aria-label="Search" />
      </div>
      <div className="mt-3 space-y-1.5">
        {res.isFetching ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Searching</p> : null}
        {q.trim().length >= 2 && res.data && !res.data.length ? <p className="text-sm text-muted-foreground">Nothing found.</p> : null}
        {res.data?.map((ev) => {
          const info = typeInfo(ev.type, prefs);
          const Icon = info.icon;
          const start = new Date(ev.starts_at);
          const k = dayKey(start, tz);
          return (
            <button key={ev.id} type="button" onClick={() => onPick(k)} className="glass-tile flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left">
              <span className="grid size-8 shrink-0 place-items-center rounded-full text-white" style={{ background: info.colour }}><Icon className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{ev.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {ev.rrule ? describeRule(ev.rrule, k) : `${shortDate(k)}${ev.all_day ? "" : `, ${timeOf(start, tz)}`}`}
                  {ev.location ? ` · ${ev.location}` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
