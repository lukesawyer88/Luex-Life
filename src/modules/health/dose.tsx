// One dose of medicine with its "given" tick (Health and the Home card), and the doses due around now.
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { useFamilyState } from "@/lib/family-context";
import { cn } from "@/lib/utils";

import { errMsg, nowHm, slotsFor, tickDose, todayIn, useDoses, useMeds, type DoseSlot } from "./data";

export function DoseRow({ s, day }: { s: DoseSlot; day: string }) {
  const { family, members } = useFamilyState();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const who = members.find((m) => m.id === s.med.person_id);
  const by = members.find((m) => m.id === s.dose?.given_by);
  const given = !!s.dose?.given_at;
  async function tick() {
    if (given && !window.confirm(`Untick ${s.med.name} at ${s.at}? Only do this if it wasn't given.`)) return;
    setBusy(true);
    try { await tickDose(qc, family.id, s, day); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <li className="glass-tile flex min-h-14 items-center gap-3 px-3 py-2" data-testid="dose-row">
      <span className="w-14 shrink-0 text-lg font-bold tabular-nums">{s.at}</span>
      {who ? <MemberAvatar member={who} size="sm" className="ring-0 ring-offset-0" /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">{s.med.name}{s.med.amount ? `, ${s.med.amount}` : ""}</span>
        <span className="block truncate text-sm text-muted-foreground">
          {who?.display_name}{given ? ` · given ${new Date(s.dose!.given_at!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: family.timezone })}${by ? ` by ${by.display_name}` : ""}` : ""}
        </span>
      </span>
      <Button data-testid="dose-tick" disabled={busy} aria-pressed={given} onClick={() => void tick()}
        className={cn("h-11 rounded-full px-4 text-base", given ? "bg-[var(--status-green)] text-white hover:bg-[var(--status-green)]/90" : "")} variant={given ? "default" : "outline"}>
        <Check className="size-5" /> {given ? "Given" : "Give"}
      </Button>
    </li>
  );
}

/** For the Home card: the dose due now or the next one in the coming hour */
export function useDoseNow() {
  const { family, role, switchedOff } = useFamilyState();
  const on = role === "parent" && !switchedOff.has("health");
  // re-check every minute, so a dose appears when it's due on a phone left on Home
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60_000); return () => clearInterval(t); }, []);
  const today = todayIn(family.timezone);
  const meds = useMeds(on).data ?? [];
  const doses = useDoses(today, on).data ?? [];
  if (!on) return { slots: [] as DoseSlot[], today };
  const now = nowHm(family.timezone);
  const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  const n = toMin(now);
  const slots = slotsFor(meds, doses, today).filter((s) => !s.dose?.given_at && toMin(s.at) - n <= 60 && n - toMin(s.at) <= 120);
  return { slots, today };
}
