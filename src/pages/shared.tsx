// A read-only calendar for a babysitter or relatives, opened from a link a parent made. No sign-in.
// Nothing here is saved on the device.
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Cake, Car, Loader2, MapPin, NotebookPen, Sun } from "lucide-react";
import { useMemo } from "react";

import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { expand, onDay, type EventLike } from "@/modules/calendar/recurrence";
import { addDays, dayKey, dayStart, longDate, shortDate, timeOf, todayKey, weekdayOf } from "@/modules/calendar/time";
import { typeInfo } from "@/modules/calendar/types";

type SharedEvent = EventLike & { title: string; type: string; people: string[]; location: string | null; driver: string | null };
type Shared = {
  family: string;
  timezone: string;
  kind: "babysitter" | "outside";
  name: string;
  expires_at: string;
  people: { id: string; name: string; colour: string }[];
  events: SharedEvent[];
  birthdays: { name: string; birthday: string }[];
  notes: { day: string; body: string }[];
  routines: { name: string; member: string; start_time: string | null; days: number[]; steps: string[] }[];
};

const DAYS = 14;

export function SharedCalendarPage() {
  // the route is /s/$token
  const token = (useParams({ strict: false }) as { token?: string }).token ?? "";
  const tzGuess = "Europe/London";
  const q = useQuery({
    queryKey: ["shared", token],
    retry: 0,
    staleTime: 60_000,
    gcTime: 0,
    queryFn: async () => {
      const today = todayKey(tzGuess);
      const from = dayStart(addDays(today, -1), tzGuess);
      const to = dayStart(addDays(today, 31), tzGuess);
      const { data, error } = await supabase.rpc("shared_calendar", { p_token: token, p_from: from.toISOString(), p_to: to.toISOString() });
      if (error) throw error;
      return (data ?? null) as Shared | null;
    },
  });

  const d = q.data;
  const tz = d?.timezone ?? tzGuess;
  const today = todayKey(tz);
  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(today, i)), [today]);
  const occs = useMemo(() => (d ? expand(d.events.map((e) => ({ ...e, exdates: e.exdates ?? [] })), dayStart(today, tz), dayStart(addDays(today, DAYS), tz), tz) : []), [d, today, tz]);
  const name = (id: string | null) => d?.people.find((p) => p.id === id)?.name;

  return (
    <div className="flex h-dvh flex-col p-3 sm:p-5" style={{ background: "var(--backdrop-base)" }}>
      <div className="glass-panel mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col p-4 sm:p-6">
        <header className="mb-3 shrink-0 text-center">
          <div className="text-base font-extrabold tracking-[0.32em]">LUEX</div>
          <div className="mx-auto mt-1 h-px w-16" style={{ background: "linear-gradient(90deg, transparent, var(--gold), transparent)" }} />
          {d ? (
            <>
              <h1 className="mt-3 text-2xl font-bold">{d.family} calendar</h1>
              <p className="text-sm text-muted-foreground">
                Shared by the family with Luex Life · works until {shortDate(dayKey(new Date(d.expires_at), tz))} {timeOf(new Date(d.expires_at), tz)}
              </p>
            </>
          ) : null}
        </header>

        {q.isLoading ? <div className="grid flex-1 place-items-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div> : null}
        {q.error ? <Message title="Couldn't open the calendar" text="Check your connection and try again." /> : null}
        {!q.isLoading && !q.error && !d ? <Message title="This link has ended or isn't right" text="Ask the family for a new link." /> : null}

        {d ? (
          <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {d.kind === "babysitter" && d.routines.some((r) => r.days.includes(weekdayOf(today))) ? (
              <section className="glass-tile p-4">
                <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><Sun className="size-5" /> Routines today</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {d.routines.filter((r) => r.days.includes(weekdayOf(today))).map((r, i) => (
                    <div key={i}>
                      <p className="font-semibold">{name(r.member) ? `${name(r.member)}: ` : ""}{r.name}{r.start_time ? ` at ${r.start_time.slice(0, 5)}` : ""}</p>
                      <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-base">{r.steps.map((s, j) => <li key={j}>{s}</li>)}</ol>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {days.map((k) => {
              const list = occs.filter((o) => onDay(o, k));
              const note = d.notes.find((n) => n.day === k);
              const bdays = d.birthdays.filter((b) => b.birthday === k.slice(5));
              if (!list.length && !note && !bdays.length && k !== today) return null;
              return (
                <section key={k}>
                  <h2 className={cn("mb-1.5 font-bold", k === today ? "text-xl" : "text-base text-muted-foreground")}>
                    {k === today ? `Today, ${longDate(k)}` : k === addDays(today, 1) ? `Tomorrow, ${longDate(k)}` : longDate(k)}
                  </h2>
                  <div className="space-y-1.5">
                    {note ? (
                      <div className="rounded-2xl bg-[var(--status-amber-soft)] p-3 text-base">
                        <span className="mb-0.5 flex items-center gap-1.5 text-sm font-bold"><NotebookPen className="size-4" /> Note for the day</span>
                        <span className="whitespace-pre-wrap">{note.body}</span>
                      </div>
                    ) : null}
                    {bdays.map((b) => (
                      <div key={b.name} className="glass-tile flex min-h-14 items-center gap-3 px-4 py-2 text-base font-semibold">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full text-white" style={{ background: "var(--ev-birthday)" }}><Cake className="size-5" /></span>
                        {b.name}'s birthday
                      </div>
                    ))}
                    {list.map((o) => {
                      const info = typeInfo(o.event.type);
                      const Icon = info.icon;
                      const who = o.event.people.map(name).filter(Boolean).join(", ");
                      return (
                        <div key={o.key} className="glass-tile flex min-h-14 items-center gap-3 px-4 py-2">
                          <span className="grid size-10 shrink-0 place-items-center rounded-full text-white" style={{ background: info.colour }}><Icon className="size-5" /></span>
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-semibold">{o.event.title}</p>
                            <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                              <span>{o.allDay ? "All day" : `${timeOf(o.start, tz)}–${timeOf(o.end, tz)}`}</span>
                              {who ? <span>· {who}</span> : null}
                              {o.event.location ? <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {o.event.location}</span> : null}
                              {o.event.driver && name(o.event.driver) ? <span className="inline-flex items-center gap-1"><Car className="size-3.5" /> {name(o.event.driver)} taking</span> : null}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {!list.length && !note && !bdays.length ? <p className="text-sm text-muted-foreground">Nothing on.</p> : null}
                  </div>
                </section>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="grid flex-1 place-items-center text-center">
      <div>
        <p className="text-lg font-bold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
