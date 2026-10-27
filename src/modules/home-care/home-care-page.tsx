// Home Care: bins, the yearly jobs, things to fix and meter readings. Cleaning stays in the Calendar's Chores.
import { Link } from "@tanstack/react-router";
import { CalendarClock, Gauge, Sparkles, Trash2, Wrench } from "lucide-react";
import { useMemo, useState } from "react";

import { takeLinkParams } from "@/lib/link-params";
import { Tabs } from "@/modules/calendar/ui";

import { BinsTab } from "./bins";
import { useHomeLive } from "./data";
import { FixTab } from "./fix";
import { JobsTab } from "./jobs";
import { MetersTab } from "./meters";

export type HcTab = "bins" | "jobs" | "fix" | "meters";

function fromUrl(): HcTab | null {
  const p = takeLinkParams();
  const t = p.get("tab");
  return t === "jobs" || t === "fix" || t === "meters" || t === "bins" ? t : null;
}

export function HomeCarePage() {
  useHomeLive();
  const first = useMemo(fromUrl, []);
  const [tab, setTab] = useState<HcTab>(first ?? "bins");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <Tabs<HcTab>
            value={tab}
            onChange={setTab}
            items={[
              { key: "bins", label: "Bins", icon: Trash2 },
              { key: "jobs", label: "Yearly jobs", icon: CalendarClock },
              { key: "fix", label: "To fix", icon: Wrench },
              { key: "meters", label: "Meters", icon: Gauge },
            ]}
          />
        </div>
        <Link to="/m/$key" params={{ key: "calendar" }} search={{ tab: "chores" } as never} data-testid="hc-cleaning"
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-muted" aria-label="Cleaning rota (Chores in the Calendar)">
          <Sparkles className="size-4" /> <span className="hidden sm:inline">Cleaning</span>
        </Link>
      </div>
      {tab === "bins" ? <BinsTab /> : null}
      {tab === "jobs" ? <JobsTab /> : null}
      {tab === "fix" ? <FixTab /> : null}
      {tab === "meters" ? <MetersTab /> : null}
    </div>
  );
}
