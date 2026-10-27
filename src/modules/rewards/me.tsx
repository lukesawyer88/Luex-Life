// "Me": a grown-up's own stars, habits, rewards and treat jar, plus habits they're cheering someone on with.
import { Star } from "lucide-react";
import { useMemo } from "react";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { useFamilyState } from "@/lib/family-context";
import { useDesktop } from "@/lib/use-desktop";

import { addDaysKey, todayIn, useBalances, useHabits, useRewards, useRewardSettings } from "./data";
import { CheeringOn, MyHabits } from "./habit-list";
import { MyRewards, StarHistory, TreatJar } from "./me-side";
import type { TabProps } from "./rewards-page";

export function MeTab(_props: TabProps) {
  const { family, me } = useFamilyState();
  const desktop = useDesktop();
  const today = todayIn(family.timezone);
  // enough history for runs, best runs and this week
  const since = useMemo(() => addDaysKey(today, -120), [today]);
  const balances = useBalances();
  const habitsQ = useHabits(since);
  const rewardsQ = useRewards();
  const settings = useRewardSettings();

  const mine = balances.data?.get(me.id);
  const stars = mine?.stars ?? 0;
  const habits = (habitsQ.data?.habits ?? []).filter((h) => h.member_id === me.id);
  const buddyOf = (habitsQ.data?.habits ?? []).filter((h) => h.buddy === me.id && h.member_id !== me.id);
  const logs = habitsQ.data?.logs ?? [];
  const myRewards = (rewardsQ.data?.rewards ?? []).filter((r) => r.kind === "me" && r.owner === me.id);
  const treatJar = settings.data?.for_me !== false;

  const side = (
    <div className="space-y-5">
      <MyRewards rewards={myRewards} stars={stars} />
      {treatJar ? <TreatJar balance={mine?.spend ?? 0} /> : null}
      <StarHistory />
    </div>
  );

  return (
    <Windows>
      <RecordsWindow className="space-y-5">
        <div className="glass-tile flex items-center gap-4 p-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[var(--status-amber-soft)] text-[var(--status-amber)]"><Star className="size-8 fill-current" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-muted-foreground">My stars</span>
            <span data-testid="me-stars" className="block text-4xl font-bold tabular-nums">{stars}</span>
          </span>
        </div>
        <MyHabits habits={habits} logs={logs} today={today} since={since} />
        <CheeringOn habits={buddyOf} logs={logs} today={today} />
        {!desktop ? side : null}
      </RecordsWindow>
      {desktop ? <DetailWindow>{side}</DetailWindow> : null}
    </Windows>
  );
}
