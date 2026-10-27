// A small Home screen card: the next party or visit within a week, how many are coming and what's left.
// Nothing when nothing is coming up.
import { Link } from "@tanstack/react-router";
import { PartyPopper } from "lucide-react";

import { useFamilyState } from "@/lib/family-context";

import { todayIn, useHostSummaries, useHostings, whenWords } from "./data";

export function NextHostingCard() {
  const { family } = useFamilyState();
  const today = todayIn(family.timezone);
  const weekOut = new Date(Date.parse(`${today}T12:00:00Z`) + 7 * 86400_000).toISOString().slice(0, 10);
  const next = (useHostings().data ?? []).find((h) => h.day >= today && h.day <= weekOut);
  const s = useHostSummaries(next ? [next.id] : []).data?.[next?.id ?? ""];
  if (!next) return null;
  return (
    <Link to="/m/$key" params={{ key: "bookings" }} search={{ host: next.id } as never} data-testid="home-hosting" className="glass-tile flex items-center gap-3 p-4 hover:bg-muted/40">
      <span className="text-3xl" aria-hidden>🎉</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold"><PartyPopper className="size-4" /> {next.event.title}</span>
        <span className="block text-sm text-muted-foreground">{whenWords(next.event.starts_at, family.timezone, next.event.all_day)}</span>
      </span>
      {s ? <span className="shrink-0 text-right text-sm"><span className="block font-bold">{s.coming} coming</span>{s.left ? <span className="block text-muted-foreground">{s.left} to do</span> : null}</span> : null}
    </Link>
  );
}

/** The Home card, only when Bookings and Hosting is switched on for the household */
export function NextHosting() {
  const { switchedOff } = useFamilyState();
  if (switchedOff.has("bookings")) return null;
  return <div className="mb-4 empty:hidden"><NextHostingCard /></div>;
}
