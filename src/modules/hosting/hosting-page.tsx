// Bookings and Hosting: parties and visits you're hosting (guests, what to get and do), and everything booked.
import { PartyPopper, Ticket } from "lucide-react";
import { useMemo, useState } from "react";

import { takeLinkParams } from "@/lib/link-params";
import { Tabs } from "@/modules/calendar/ui";

import { BookingsTab } from "./bookings";
import { useHostingLive } from "./data";
import { HostingTab } from "./hosting";

type Tab = "hosting" | "bookings";

function fromUrl(): { tab?: Tab; host?: string } {
  const p = takeLinkParams();
  const host = p.get("host") ?? undefined;
  return { tab: p.get("tab") === "bookings" ? "bookings" : host ? "hosting" : undefined, host };
}

export function HostingPage() {
  useHostingLive();
  const first = useMemo(fromUrl, []);
  const [tab, setTab] = useState<Tab>(first.tab ?? "hosting");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ key: "hosting", label: "Hosting", icon: PartyPopper }, { key: "bookings", label: "Bookings", icon: Ticket }]} />
      {tab === "hosting" ? <HostingTab firstHost={first.host ?? null} /> : null}
      {tab === "bookings" ? <BookingsTab /> : null}
    </div>
  );
}
