// A child's own screen: big stars and pots, goals, habits to tick, the reward shop, and a money tip.
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Lightbulb, ShoppingBag, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { Sheet } from "@/modules/calendar/ui";

import {
  addDaysKey, ageFrom, errMsg, MONEY_KIND_LABEL, money, refreshRewards, todayIn, useBalances, useGoals, useHabits, usePeopleSettings, usePocketEntries,
  useRewards, useRewardSettings, type Reward,
} from "./data";
import { EntryRow, EntrySheet, GoalBar, HabitTickRow, MoveSheet, POT_EMOJI, ShopCard } from "./kid-parts";
import { SwapSheet } from "./kid-sheets";
import type { TabProps } from "./rewards-page";
import { tipFor } from "./tips";

const STATUS_LABEL = { waiting: "Asked — waiting", approved: "Yes! 🎉", declined: "Not this time" } as const;

export function MineTab(_props: TabProps) {
  const { family, me } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const settings = useRewardSettings().data;
  const balances = useBalances();
  const b = balances.data?.get(me.id) ?? { member_id: me.id, stars: 0, spend: 0, save: 0, give: 0, waiting: 0 };
  const person = usePeopleSettings().data?.get(me.id);
  const goals = (useGoals().data ?? []).filter((g) => g.member_id === me.id);
  const habitsQ = useHabits(addDaysKey(today, -7));
  const myHabits = (habitsQ.data?.habits ?? []).filter((h) => h.member_id === me.id);
  const rewardsQ = useRewards();
  const shop = useMemo(() => (rewardsQ.data?.rewards ?? []).filter((r) => r.kind === "shop"), [rewardsQ.data]);
  const myClaims = (rewardsQ.data?.claims ?? []).filter((c) => c.member_id === me.id);
  const entries = usePocketEntries(me.id);
  const [spent, setSpent] = useState(false);
  const [move, setMove] = useState(false);
  const [swap, setSwap] = useState(false);
  const [ask, setAsk] = useState<Reward | null>(null);
  const [busy, setBusy] = useState(false);
  const tip = tipFor(ageFrom(me.birthday, today), today);

  async function askFor(r: Reward) {
    setBusy(true);
    const { error } = await supabase.from("reward_claims").insert({ family_id: family.id, reward_id: r.id, member_id: me.id });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(person?.teen_mode ? "Done!" : "Asked! A grown-up will say yes or no");
    setAsk(null);
    await refreshRewards(qc, family.id);
  }

  const lastClaim = (rid: string) => myClaims.find((c) => c.reward_id === rid && c.created_at.slice(0, 10) >= addDaysKey(today, -7));
  const tipBox = (
    <div className="flex gap-3 rounded-2xl bg-[var(--status-blue-soft)] p-3" data-testid="mine-tip">
      <Lightbulb className="mt-0.5 size-5 shrink-0 text-[var(--status-blue)]" />
      <p className="text-sm">{tip}</p>
    </div>
  );

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-4">
        <div className="flex items-center justify-center gap-3 rounded-3xl bg-[var(--surface)] p-4" data-testid="mine-stars">
          <Star className="size-14 fill-[var(--gold)] text-[var(--gold)]" />
          <span className="text-6xl font-extrabold tabular-nums">{b.stars}</span>
          <span className="text-lg font-semibold text-muted-foreground">stars</span>
        </div>

        {settings?.children !== false ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {([["spend", b.spend, "Spend"], ["save", b.save, "Save"], ["give", b.give, "Give"]] as const).map(([p, v, label]) => (
                <div key={p} className="glass-tile p-3 text-center" data-testid={`mine-${p}`}>
                  <div className="text-4xl" aria-hidden>{POT_EMOJI[p]}</div>
                  <div className="text-xl font-extrabold tabular-nums">{money(v)}</div>
                  <div className="text-sm text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button data-testid="mine-move" variant="outline" className="h-14 rounded-2xl text-base font-semibold" onClick={() => setMove(true)} disabled={b.spend <= 0 && !person?.teen_mode}>
                <ArrowLeftRight className="size-5" /> Save or give
              </Button>
              <Button data-testid="mine-spent" variant="outline" className="h-14 rounded-2xl text-base font-semibold" onClick={() => setSpent(true)}>
                <ShoppingBag className="size-5" /> I spent some
              </Button>
            </div>
            {settings?.stars_per_pound && b.stars > 0 ? (
              <Button variant="outline" className="h-12 rounded-2xl" onClick={() => setSwap(true)}>⭐ Swap stars for money ({settings.stars_per_pound} stars = £1)</Button>
            ) : null}
            {goals.length ? (
              <section className="space-y-2">
                <h3 className="text-lg font-bold">Saving for</h3>
                {goals.map((g) => <GoalBar key={g.id} goal={g} saved={b.save} />)}
              </section>
            ) : null}
          </>
        ) : null}

        <div className="lg:hidden">{tipBox}</div>

        {myHabits.length ? (
          <section className="space-y-2">
            <h3 className="text-lg font-bold">Today</h3>
            {myHabits.map((h) => <HabitTickRow key={h.id} habit={h} logs={habitsQ.data?.logs ?? []} today={today} />)}
          </section>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-lg font-bold">Reward shop</h3>
          {shop.length ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {shop.map((r) => {
                const c = lastClaim(r.id);
                return (
                  <li key={r.id}>
                    <ShopCard reward={r} stars={b.stars} onClick={() => setAsk(r)}>
                      {c ? <span className="text-xs font-semibold">{STATUS_LABEL[c.status as keyof typeof STATUS_LABEL]}</span>
                        : b.stars >= r.stars ? <span className="text-xs font-semibold text-[var(--status-green)]">You can get this!</span>
                        : <span className="text-xs text-muted-foreground">{r.stars - b.stars} more stars</span>}
                    </ShopCard>
                  </li>
                );
              })}
            </ul>
          ) : <p className="rounded-2xl bg-[var(--surface)] p-3 text-sm text-muted-foreground">Nothing in the shop yet. Ask a grown-up to add some rewards.</p>}
        </section>
      </RecordsWindow>

      <DetailWindow className="space-y-4">
        {tipBox}
        <section className="space-y-2">
          <h3 className="font-bold">My money in and out</h3>
          {entries.data?.length ? (
            <ul className="space-y-1.5">{entries.data.slice(0, 30).map((e) => <EntryRow key={e.id} e={e} kindLabel={MONEY_KIND_LABEL[e.kind as keyof typeof MONEY_KIND_LABEL]} />)}</ul>
          ) : <p className="text-sm text-muted-foreground">Nothing yet.</p>}
        </section>
      </DetailWindow>

      <Sheet open={!!ask} onOpenChange={(o) => !o && setAsk(null)} title={ask ? `${ask.emoji ?? "🎁"} ${ask.title}` : ""}
        footer={ask ? <>
          <Button data-testid="mine-ask" className="h-14 flex-1 rounded-full text-lg font-bold" disabled={busy || b.stars < ask.stars} onClick={() => void askFor(ask)}>
            {b.stars >= ask.stars ? `Ask for it · ${ask.stars} ⭐` : `${ask.stars - b.stars} more stars needed`}
          </Button>
          <Button variant="outline" className="h-14 rounded-full" onClick={() => setAsk(null)}>Not now</Button>
        </> : null}>
        {ask ? (
          <div className="space-y-3 text-center">
            <div className="text-7xl" aria-hidden>{ask.emoji || "🎁"}</div>
            <p className="text-lg">You have <b>{b.stars}</b> stars. This costs <b>{ask.stars}</b>.</p>
            {!person?.teen_mode ? <p className="text-sm text-muted-foreground">A grown-up will say yes or no.</p> : null}
          </div>
        ) : null}
      </Sheet>
      <EntrySheet value={spent ? "spend" : null} onClose={() => setSpent(false)} memberId={me.id} name={person?.teen_mode ? "Taken off straight away" : "A grown-up will check it"} />
      <MoveSheet open={move} onClose={() => setMove(false)} memberId={me.id} balances={{ spend: b.spend, save: b.save, give: b.give }} fromOnly={person?.teen_mode ? undefined : "spend"} />
      {settings ? <SwapSheet open={swap} onClose={() => setSwap(false)} memberId={me.id} stars={b.stars} settings={settings} /> : null}
    </Windows>
  );
}
