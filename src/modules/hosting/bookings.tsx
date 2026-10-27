// Bookings: everything coming up that has a booking reference (a restaurant, an activity, a service), from the Calendar.
// Nothing new is stored: add the reference to a Calendar event and it shows here.
import { Link } from "@tanstack/react-router";
import { Copy, MapPin, Ticket } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { RecordsWindow, Windows } from "@/components/page-parts";
import { useFamilyState } from "@/lib/family-context";
import { typeInfo } from "@/modules/calendar/types";
import { Empty } from "@/modules/calendar/ui";

import { useBookings, whenWords } from "./data";

export function BookingsTab() {
  const { family } = useFamilyState();
  const [range] = useState(() => ({ from: new Date(Date.now() - 6 * 3600_000), to: new Date(Date.now() + 180 * 86400_000) }));
  const q = useBookings(range.from, range.to);
  const list = q.data ?? [];

  async function copy(ref: string) {
    try { await navigator.clipboard.writeText(ref); toast.success("Reference copied"); } catch { toast.error("Couldn't copy. Press and hold to copy it"); }
  }

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Booked</h2>
        {q.isLoading ? null : !list.length ? (
          <Empty icon={Ticket} title="Nothing booked">Add a booking reference to any Calendar event (a restaurant, swimming lessons, the car wash) and it shows here with the reference to hand.</Empty>
        ) : (
          <ul className="space-y-2">
            {list.map((o) => {
              const e = o.event;
              const info = typeInfo(e.type);
              const Icon = info.icon;
              return (
                <li key={o.key} className="glass-tile flex items-center gap-3 p-3" data-testid="booking-row">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full text-white" style={{ background: info.colour }}><Icon className="size-5" /></span>
                  <Link to="/m/$key" params={{ key: "calendar" }} search={{ event: o.seriesId } as never} className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{e.title}</span>
                    <span className="block truncate text-sm text-muted-foreground">{whenWords(o.start.toISOString(), family.timezone, e.all_day)}{o.repeats ? " · repeats" : ""}</span>
                    {e.location ? <span className="flex items-center gap-1 truncate text-sm text-muted-foreground"><MapPin className="size-3.5" /> {e.location}</span> : null}
                  </Link>
                  <button type="button" onClick={() => void copy(e.booking_ref!)} className="flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 font-mono text-sm font-semibold" aria-label={`Copy reference ${e.booking_ref}`}>
                    {e.booking_ref} <Copy className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </RecordsWindow>
    </Windows>
  );
}
