// A small Home screen card: the next trip, its countdown and what's still to pack. Nothing when no trip is coming up.
import { Link } from "@tanstack/react-router";
import { Plane } from "lucide-react";

import { useFamilyState } from "@/lib/family-context";

import { countdownWords, todayIn, useTripProgress, useTrips } from "./data";

export function NextTripCard() {
  const { family } = useFamilyState();
  const today = todayIn(family.timezone);
  const next = (useTrips().data ?? []).find((t) => t.endDay >= today);
  const p = useTripProgress(next ? [next.id] : []).data?.[next?.id ?? ""];
  if (!next) return null;
  return (
    <Link to="/m/$key" params={{ key: "trips" }} search={{ trip: next.id } as never} data-testid="home-trip" className="glass-tile flex items-center gap-3 p-4 hover:bg-muted/40">
      <span className="text-3xl" aria-hidden>{next.emoji ?? "✈️"}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold"><Plane className="size-4" /> {next.event.title}</span>
        <span className="block text-sm text-muted-foreground">{p?.left ? `${p.left} things still to pack or do` : p ? "All packed" : "Tap to start packing"}</span>
      </span>
      <span className="shrink-0 text-lg font-bold">{countdownWords(next, today)}</span>
    </Link>
  );
}

/** The Home card, only when Trips is switched on for the household */
export function NextTrip() {
  const { switchedOff } = useFamilyState();
  if (switchedOff.has("trips")) return null;
  return <div className="mb-4 empty:hidden"><NextTripCard /></div>;
}
