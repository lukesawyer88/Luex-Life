// Trips and Holidays: trips (on the Calendar), packing, before-we-go jobs, plans, and ideas for days out.
import { Lightbulb, Plane } from "lucide-react";
import { useMemo, useState } from "react";

import { takeLinkParams } from "@/lib/link-params";
import { Tabs } from "@/modules/calendar/ui";

import { useTripsLive } from "./data";
import { IdeasTab } from "./ideas";
import { TripsTab } from "./trips";

type TripsTabKey = "trips" | "ideas";

function fromUrl(): { tab?: TripsTabKey; trip?: string } {
  const p = takeLinkParams();
  const trip = p.get("trip") ?? undefined;
  return { tab: p.get("tab") === "ideas" ? "ideas" : trip ? "trips" : undefined, trip };
}

export function TripsPage() {
  useTripsLive();
  const first = useMemo(fromUrl, []);
  const [tab, setTab] = useState<TripsTabKey>(first.tab ?? "trips");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Tabs<TripsTabKey>
        value={tab}
        onChange={setTab}
        items={[
          { key: "trips", label: "Trips", icon: Plane },
          { key: "ideas", label: "Days out", icon: Lightbulb },
        ]}
      />
      {tab === "trips" ? <TripsTab firstTrip={first.trip ?? null} /> : null}
      {tab === "ideas" ? <IdeasTab /> : null}
    </div>
  );
}
