// A small Home screen card: bins going out tonight or tomorrow, and whose turn it is. Nothing when there are none.
import { Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";

import { useFamilyState } from "@/lib/family-context";

import { addDays, binHex, collections, todayIn, useBins } from "./data";

export function BinsCard() {
  const { family, members } = useFamilyState();
  const data = useBins().data;
  const today = todayIn(family.timezone);
  if (!data?.bins.length) return null;
  // tonight's job is for tomorrow's collection; on the day, show today's too
  const list = collections(data, today, 2);
  if (!list.length) return null;
  const tomorrow = addDays(today, 1);
  const lines = [today, tomorrow].map((d) => ({ d, items: list.filter((c) => c.on === d) })).filter((x) => x.items.length);

  return (
    <Link to="/m/$key" params={{ key: "home-care" }} data-testid="home-bins" className="glass-tile block p-4 hover:bg-muted/40">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Trash2 className="size-4" /> Bins</h3>
      <ul className="space-y-1 text-sm">
        {lines.map(({ d, items }) => {
          const who = [...new Set(items.map((c) => c.who).filter(Boolean))].map((id) => members.find((m) => m.id === id)?.display_name).filter(Boolean);
          return (
            <li key={d} className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">{d === tomorrow ? "Out tonight:" : "Collected today:"}</span>
              {items.map((c) => <span key={c.bin.id} className="inline-flex items-center gap-1"><span className="size-3 rounded-sm" style={{ background: binHex(c.bin.colour) }} aria-hidden />{c.bin.name}</span>)}
              {d === tomorrow && who.length ? <span className="text-muted-foreground">· {who.join(" and ")}</span> : null}
            </li>
          );
        })}
      </ul>
    </Link>
  );
}

/** The Home card, only when Home Care is switched on for the household */
export function BinsToday() {
  const { switchedOff } = useFamilyState();
  if (switchedOff.has("home-care")) return null;
  return <div className="mb-4 empty:hidden"><BinsCard /></div>;
}
