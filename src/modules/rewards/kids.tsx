// Children (parents): each child's stars and pots, their pocket money, records, goals and habits, and the reward shop.
import { ArrowLeftRight, HandCoins, HandHeart, Pencil, Plus, Settings2, Store, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import type { Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { Empty, Sheet } from "@/modules/calendar/ui";

import {
  addDaysKey, MONEY_KIND_LABEL, money, todayIn, useBalances, useGoals, useHabits, usePeopleSettings, usePocketEntries, useRewards, useRewardSettings,
  type Balance, type Habit, type PocketGoal, type Reward, type RewardSettings,
} from "./data";
import {
  ENTRY_LABEL, EntryRow, EntrySheet, GoalBar, GoalSheet, HabitTickRow, MoveSheet, PotTiles, ShopCard, type EntryKind,
} from "./kid-parts";
import { AdvanceSheet, HabitSheet, PocketSettingsSheet, ShopSheet, StarsSheet, SwapSheet } from "./kid-sheets";
import type { TabProps } from "./rewards-page";

const EMPTY: Balance = { member_id: "", stars: 0, spend: 0, save: 0, give: 0, waiting: 0 };

export function KidsTab({ target }: TabProps) {
  const { members } = useFamilyState();
  const desktop = useDesktop();
  const children = useMemo(() => members.filter((m) => m.role === "child" && !m.archived_at), [members]);
  const balances = useBalances();
  const settings = useRewardSettings().data;
  const rewards = useRewards();
  const shop = useMemo(() => (rewards.data?.rewards ?? []).filter((r) => r.kind === "shop"), [rewards.data]);
  const [openId, setOpenId] = useState<string | null>(target.memberId ?? null);
  const [shopEdit, setShopEdit] = useState<Reward | "new" | null>(null);
  const open = children.find((c) => c.id === openId) ?? null;

  useEffect(() => { if (desktop && !openId && children.length) setOpenId(children[0].id); }, [desktop, openId, children]);

  if (!settings) return null;
  const bal = (id: string) => balances.data?.get(id) ?? EMPTY;
  const detail = open ? <ChildDetail child={open} balance={bal(open.id)} settings={settings} /> : <Empty icon={HandHeart} title="Pick a child">Their stars, pocket money and goals show here.</Empty>;

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-4">
        <section>
          <h2 className="mb-2 text-lg font-bold">Children</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {children.map((c) => {
              const b = bal(c.id);
              return (
                <li key={c.id}>
                  <button type="button" data-testid="kid-card" onClick={() => setOpenId(c.id)}
                    className={cn("glass-tile flex w-full flex-col gap-2 p-3 text-left", openId === c.id && "ring-2 ring-[var(--status-blue)]")}>
                    <span className="flex items-center gap-3">
                      <MemberAvatar member={c} size="md" />
                      <span className="min-w-0 flex-1 truncate text-base font-bold">{c.display_name}</span>
                      <span className="flex items-center gap-1 text-2xl font-extrabold tabular-nums"><Star className="size-6 fill-[var(--gold)] text-[var(--gold)]" />{b.stars}</span>
                    </span>
                    <span className="flex flex-wrap gap-x-3 text-sm tabular-nums">
                      <span>👛 {money(b.spend)}</span><span>🐷 {money(b.save)}</span><span>💝 {money(b.give)}</span>
                    </span>
                    {b.waiting ? <span className="w-fit rounded-full bg-[var(--status-amber-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--status-amber)]">{b.waiting} waiting for an OK</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex flex-1 items-center gap-2 text-lg font-bold"><Store className="size-5" /> Reward shop</h2>
            <Button data-testid="shop-add" className="h-10 rounded-full px-4 font-semibold" onClick={() => setShopEdit("new")}><Plus className="size-4" /> Add</Button>
          </div>
          {shop.length ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {shop.map((r) => <li key={r.id}><ShopCard reward={r} stars={Infinity} onClick={() => setShopEdit(r)} /></li>)}
            </ul>
          ) : (
            <p className="rounded-2xl bg-[var(--surface)] p-3 text-sm text-muted-foreground">Add rewards children can spend stars on: screen time, choosing dinner, a trip to the park.</p>
          )}
        </section>
      </RecordsWindow>
      <DetailWindow>{detail}</DetailWindow>
      {!desktop ? (
        <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)} title={open?.display_name ?? ""} wide>
          {open ? <ChildDetail child={open} balance={bal(open.id)} settings={settings} hideTitle /> : null}
        </Sheet>
      ) : null}
      <ShopSheet value={shopEdit} onClose={() => setShopEdit(null)} />
    </Windows>
  );
}

function ChildDetail({ child, balance, settings, hideTitle }: { child: Member; balance: Balance; settings: RewardSettings; hideTitle?: boolean }) {
  const { family } = useFamilyState();
  const today = todayIn(family.timezone);
  const people = usePeopleSettings();
  const person = people.data?.get(child.id);
  const entries = usePocketEntries(child.id);
  const goals = useGoals();
  const habits = useHabits(addDaysKey(today, -7));
  const myGoals = (goals.data ?? []).filter((g) => g.member_id === child.id);
  const myHabits = (habits.data?.habits ?? []).filter((h) => h.member_id === child.id);
  const [entry, setEntry] = useState<EntryKind | null>(null);
  const [sheet, setSheet] = useState<"pocket" | "move" | "advance" | "stars" | "swap" | null>(null);
  const [goal, setGoal] = useState<PocketGoal | "new" | null>(null);
  const [habit, setHabit] = useState<Habit | "new" | null>(null);

  const kinds: EntryKind[] = ["bonus", ...(settings.deductions_on ? ["deduction" as const] : []), "spend", "cash", "gift", "tooth_fairy", "birthday", "other"];
  const amount = Number(person?.pocket_amount ?? 0);

  return (
    <div className="space-y-5" data-testid="kid-detail">
      {!hideTitle ? (
        <div className="flex items-center gap-3">
          <MemberAvatar member={child} size="md" />
          <h3 className="flex-1 text-xl font-bold">{child.display_name}</h3>
        </div>
      ) : null}

      <div className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] p-3">
        <Star className="size-9 fill-[var(--gold)] text-[var(--gold)]" />
        <span className="flex-1 text-3xl font-extrabold tabular-nums">{balance.stars}<span className="ml-1 text-sm font-semibold text-muted-foreground">stars</span></span>
        <Button data-testid="kid-bonus-stars" variant="outline" className="h-10 rounded-full" onClick={() => setSheet("stars")}>Stars</Button>
        {settings.stars_per_pound ? <Button variant="outline" className="h-10 rounded-full" onClick={() => setSheet("swap")}>Swap</Button> : null}
      </div>

      <PotTiles spend={balance.spend} save={balance.save} give={balance.give} />

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h4 className="flex-1 font-bold">Pocket money</h4>
          <Button data-testid="kid-pocket" variant="outline" className="h-10 rounded-full" onClick={() => setSheet("pocket")}><Settings2 className="size-4" /> Set up</Button>
        </div>
        <p className="text-sm">
          {amount > 0
            ? `${money(amount)} ${person?.pocket_every === "month" ? "a month" : person?.pocket_every === "fortnight" ? "every 2 weeks" : "a week"} · next on ${person?.next_pay ? new Date(person.next_pay + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "—"}`
            : "No regular pocket money yet."}
          {person?.paused_until && person.paused_until >= today ? ` · paused until ${person.paused_until}` : ""}
          {person?.teen_mode ? " · teen mode" : ""}
        </p>
        {Number(person?.advance_owed ?? 0) > 0 ? <p className="text-sm font-semibold text-[var(--status-amber)]">Owes {money(person?.advance_owed)} (paying back {money(person?.advance_repay)} each pay day)</p> : null}
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => (
            <Button key={k} data-testid={`kid-add-${k}`} variant="outline" className="h-11 rounded-full" onClick={() => setEntry(k)}>
              {ENTRY_LABEL[k].emoji} {ENTRY_LABEL[k].button}
            </Button>
          ))}
          <Button data-testid="kid-move" variant="outline" className="h-11 rounded-full" onClick={() => setSheet("move")}><ArrowLeftRight className="size-4" /> Move</Button>
          <Button data-testid="kid-advance" variant="outline" className="h-11 rounded-full" onClick={() => setSheet("advance")}><HandCoins className="size-4" /> Advance</Button>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h4 className="flex-1 font-bold">Saving for</h4>
          <Button data-testid="goal-add" variant="outline" className="h-10 rounded-full" onClick={() => setGoal("new")}><Plus className="size-4" /> Goal</Button>
        </div>
        {myGoals.length ? myGoals.map((g) => (
          <button key={g.id} type="button" className="block w-full text-left" onClick={() => setGoal(g)}><GoalBar goal={g} saved={balance.save} /></button>
        )) : <p className="text-sm text-muted-foreground">No goals yet. Pick something from their wish list.</p>}
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h4 className="flex-1 font-bold">Habits</h4>
          <Button data-testid="kid-habit-add" variant="outline" className="h-10 rounded-full" onClick={() => setHabit("new")}><Plus className="size-4" /> Habit</Button>
        </div>
        {myHabits.length ? myHabits.map((h) => (
          <div key={h.id} className="flex items-center gap-1">
            <div className="min-w-0 flex-1"><HabitTickRow habit={h} logs={habits.data?.logs ?? []} today={today} testId="kid-habit-tick" /></div>
            <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setHabit(h)} aria-label="Change habit"><Pencil className="size-4" /></Button>
          </div>
        )) : <p className="text-sm text-muted-foreground">Habits earn stars each time they're reached (brushing teeth, reading).</p>}
      </section>

      <section className="space-y-2">
        <h4 className="font-bold">Money in and out</h4>
        {entries.data?.length ? (
          <ul className="space-y-1.5">{entries.data.slice(0, 50).map((e) => <EntryRow key={e.id} e={e} kindLabel={MONEY_KIND_LABEL[e.kind as keyof typeof MONEY_KIND_LABEL]} />)}</ul>
        ) : <p className="text-sm text-muted-foreground">Nothing yet.</p>}
      </section>

      <EntrySheet value={entry} onClose={() => setEntry(null)} memberId={child.id} name={child.display_name} />
      <PocketSettingsSheet open={sheet === "pocket"} onClose={() => setSheet(null)} childId={child.id} name={child.display_name} person={person} />
      <MoveSheet open={sheet === "move"} onClose={() => setSheet(null)} memberId={child.id} balances={{ spend: balance.spend, save: balance.save, give: balance.give }} />
      <AdvanceSheet open={sheet === "advance"} onClose={() => setSheet(null)} childId={child.id} name={child.display_name} />
      <StarsSheet open={sheet === "stars"} onClose={() => setSheet(null)} childId={child.id} name={child.display_name} deductions={settings.deductions_on} />
      <SwapSheet open={sheet === "swap"} onClose={() => setSheet(null)} memberId={child.id} stars={balance.stars} settings={settings} />
      <GoalSheet value={goal} onClose={() => setGoal(null)} memberId={child.id} />
      <HabitSheet value={habit} onClose={() => setHabit(null)} childId={child.id} />
    </div>
  );
}
