// Pieces shared by the Children, My stars and money, and Waiting screens.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Minus, Plus } from "lucide-react";
import { useEffect, useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useExtra } from "@/lib/extras";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Field, Sheet } from "@/modules/calendar/ui";

import {
  errMsg, money, POT_LABEL, refreshRewards, rewardKey, rows, type Habit, type HabitLog, type PocketEntry, type PocketGoal, type Pot, type Reward,
} from "./data";
import { addPocket, tickHabit } from "./outbox";

export const POT_EMOJI: Record<Pot, string> = { spend: "👛", save: "🐷", give: "💝" };

/** The pots shown: spend and save, plus give when that extra is on (or it still holds money) */
export function useShownPots(give = 0): Pot[] {
  const giveOn = useExtra("rewards.give");
  return giveOn || give !== 0 ? ["spend", "save", "give"] : ["spend", "save"];
}

/** Parse a typed amount ("£1.50", "12") into a number; null when it isn't one */
export function parseAmount(s: string): number | null {
  const v = Number(s.replace(/[£,\s]/g, ""));
  return s.trim() && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/** A plain, big drop-down list */
export function NativeSelect({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...rest}
      className={cn("h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60", className)}
    >
      {children}
    </select>
  );
}

/** Three pots side by side */
export function PotTiles({ spend, save, give, big, testPrefix }: { spend: number; save: number; give: number; big?: boolean; testPrefix?: string }) {
  const shown = useShownPots(give);
  const vals: [Pot, number][] = ([["spend", spend], ["save", save], ["give", give]] as [Pot, number][]).filter(([p]) => shown.includes(p));
  return (
    <div className={cn("grid gap-2", vals.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {vals.map(([p, v]) => (
        <div key={p} className="glass-tile min-w-0 p-2 text-center" data-testid={testPrefix ? `${testPrefix}-${p}` : undefined}>
          <div className={big ? "text-3xl" : "text-xl"} aria-hidden>{POT_EMOJI[p]}</div>
          <div className={cn("truncate font-bold tabular-nums", big ? "text-xl" : "text-base")}>{money(v)}</div>
          <div className="text-xs text-muted-foreground">{POT_LABEL[p]}</div>
        </div>
      ))}
    </div>
  );
}

/** A goal with its progress bar ("£3 more to go") */
export function GoalBar({ goal, saved }: { goal: PocketGoal; saved: number }) {
  const target = Number(goal.target);
  const pct = Math.min(100, Math.max(0, (saved / target) * 100));
  const left = Math.max(0, target - saved);
  return (
    <div className="glass-tile p-3">
      <div className="flex items-center gap-2">
        <span className="text-2xl" aria-hidden>{goal.emoji || "🎯"}</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{goal.title}</span>
        <span className="font-bold tabular-nums">{money(target)}</span>
      </div>
      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-[var(--surface)]">
        <div className="h-full rounded-full bg-[var(--status-green)]" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{goal.reached_at || left === 0 ? "Reached! 🎉" : `${money(left)} more to go`}</p>
    </div>
  );
}

// ---------------------------------------------------------------- recording money

export type EntryKind = "bonus" | "deduction" | "spend" | "cash" | "gift" | "tooth_fairy" | "birthday" | "other";
export const ENTRY_LABEL: Record<EntryKind, { title: string; button: string; emoji: string; hint?: string }> = {
  bonus: { title: "Give a bonus", button: "Bonus", emoji: "⭐" },
  deduction: { title: "Take some off", button: "Take off", emoji: "➖" },
  spend: { title: "Money spent", button: "Spent", emoji: "🛍️" },
  cash: { title: "Cash handed over", button: "Cash handed over", emoji: "💷", hint: "When you give them real money from their balance." },
  gift: { title: "Gift money", button: "Gift", emoji: "🎁" },
  tooth_fairy: { title: "Tooth fairy", button: "Tooth fairy", emoji: "🦷" },
  birthday: { title: "Birthday money", button: "Birthday", emoji: "🎂" },
  other: { title: "Something else", button: "Other", emoji: "✏️", hint: "Use a minus sign to take money off." },
};

/** Record money for someone (now, or later with no signal) */
export function EntrySheet({
  value, onClose, memberId, name, allowPot = true,
}: { value: EntryKind | null; onClose: () => void; memberId: string; name: string; allowPot?: boolean }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const pots = useShownPots();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pot, setPot] = useState<Pot>("spend");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (value) { setAmount(""); setNote(""); setPot("spend"); } }, [value]);
  const kind = value ?? "other";
  const label = ENTRY_LABEL[kind];
  const amt = parseAmount(amount);
  const ok = amt != null && amt !== 0 && (kind === "other" || amt > 0);

  async function save() {
    if (!ok || amt == null) return;
    setBusy(true);
    try {
      const res = await addPocket({ family_id: family.id, member_id: memberId, pot, amount: amt, kind, note: note.trim() });
      toast(res === "waiting" ? "Saved — it will send when you have a signal" : "Saved");
      await refreshRewards(qc, family.id);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={`${label.emoji} ${label.title}`}
      description={name}
      footer={<>
        <Button data-testid="entry-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
      </>}
    >
      <div className="space-y-4">
        <Field label="How much" hint={label.hint}>
          <Input data-testid="entry-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-14 text-2xl font-bold" data-autofocus />
        </Field>
        {allowPot ? (
          <Field label={["spend", "cash", "deduction"].includes(kind) ? "From which pot" : "Into which pot"}>
            <div className="flex flex-wrap gap-2">
              {pots.map((p) => <Chip key={p} on={pot === p} onClick={() => setPot(p)}>{POT_EMOJI[p]} {POT_LABEL[p]}</Chip>)}
            </div>
          </Field>
        ) : null}
        <Field label="What for (optional)">
          <Input data-testid="entry-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} className="h-11" placeholder={kind === "spend" ? "Sweets" : kind === "bonus" ? "Helping with the shopping" : ""} />
        </Field>
      </div>
    </Sheet>
  );
}

/** Move money between pots */
export function MoveSheet({ open, onClose, memberId, balances, fromOnly }: {
  open: boolean; onClose: () => void; memberId: string; balances: Record<Pot, number>; fromOnly?: Pot;
}) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const pots = useShownPots(balances.give);
  const [from, setFrom] = useState<Pot>("spend");
  const [to, setTo] = useState<Pot>("save");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setFrom(fromOnly ?? "spend"); setTo("save"); setAmount(""); } }, [open, fromOnly]);
  const amt = parseAmount(amount);
  const ok = amt != null && amt > 0 && amt <= balances[from] && from !== to;

  async function save() {
    if (!ok || amt == null) return;
    setBusy(true);
    const { error } = await supabase.rpc("reward_move", { p_member: memberId, p_from: from, p_to: to, p_amount: amt });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(`${money(amt)} moved to ${POT_LABEL[to].toLowerCase()}`);
    await refreshRewards(qc, family.id);
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Move money between pots"
      footer={<>
        <Button data-testid="move-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Moving…" : "Move it"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
      </>}>
      <div className="space-y-4">
        {!fromOnly ? (
          <Field label="From">
            <div className="flex flex-wrap gap-2">
              {pots.map((p) => <Chip key={p} on={from === p} onClick={() => setFrom(p)}>{POT_EMOJI[p]} {POT_LABEL[p]} · {money(balances[p])}</Chip>)}
            </div>
          </Field>
        ) : <p className="text-sm">From <b>{POT_LABEL[fromOnly]}</b> ({money(balances[fromOnly])})</p>}
        <Field label="To">
          <div className="flex flex-wrap gap-2">
            {pots.filter((p) => p !== from).map((p) => <Chip key={p} on={to === p} onClick={() => setTo(p)}>{POT_EMOJI[p]} {POT_LABEL[p]}</Chip>)}
          </div>
        </Field>
        <Field label="How much">
          <Input data-testid="move-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-14 text-2xl font-bold" />
        </Field>
        {amt != null && amt > balances[from] ? <p className="text-sm text-[var(--status-red)]">There's only {money(balances[from])} in that pot.</p> : null}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- habits with big ticks

export function habitCount(logs: HabitLog[], habitId: string, day: string): HabitLog | undefined {
  return logs.find((l) => l.habit_id === habitId && l.day === day);
}

/** One habit with a big tick (or + and − for counted ones) for today */
export function HabitTickRow({ habit, logs, today, testId = "mine-habit-tick" }: { habit: Habit; logs: HabitLog[]; today: string; testId?: string }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const log = habitCount(logs, habit.id, today);
  const count = log?.count ?? 0;
  const done = !log?.skipped && count >= habit.target;
  const [busy, setBusy] = useState(false);

  async function set(n: number) {
    setBusy(true);
    try {
      const res = await tickHabit({ family_id: family.id, habit_id: habit.id, member_id: habit.member_id, day: today, count: Math.max(0, n), skipped: false });
      if (res === "waiting") toast("Ticked — it will send when you have a signal");
      await refreshRewards(qc, family.id);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("glass-tile flex min-h-16 items-center gap-3 p-3", done && "ring-2 ring-[var(--status-green)]")}>
      <span className="text-3xl" aria-hidden>{habit.emoji || "✅"}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">{habit.title}</span>
        <span className="block text-xs text-muted-foreground">
          {habit.target > 1 ? `${count} of ${habit.target}${habit.unit ? ` ${habit.unit}` : ""} today` : done ? "Done today" : "Not yet today"}
          {habit.stars ? ` · ${habit.stars} ⭐` : ""}
        </span>
      </span>
      {habit.target > 1 ? (
        <span className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-11 rounded-full" disabled={busy || count === 0} onClick={() => void set(count - 1)} aria-label="One less"><Minus className="size-5" /></Button>
          <Button data-testid={testId} size="icon" className="size-11 rounded-full" disabled={busy} onClick={() => void set(count + 1)} aria-label="One more"><Plus className="size-5" /></Button>
        </span>
      ) : (
        <button
          type="button" data-testid={testId} disabled={busy} aria-pressed={done} aria-label={done ? "Untick" : "Tick"}
          onClick={() => void set(done ? 0 : 1)}
          className={cn("grid size-14 shrink-0 place-items-center rounded-full border-2 transition",
            done ? "border-transparent bg-[var(--status-green)] text-white" : "border-[var(--surface-border)] bg-[var(--surface)]")}
        >
          <Check className="size-7" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the children's wish lists (for goals)

export type WishItem = { id: string; title: string; price: number | null };

export function useWishItems(memberId: string | null) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: rewardKey(family.id, "wish-items", memberId),
    enabled: !!memberId,
    queryFn: async () => {
      const lists = await rows<{ id: string }>(supabase.from("wish_lists").select("id").eq("owner_member", memberId!));
      if (!lists.length) return [] as WishItem[];
      const items = await rows<{ id: string; title: string; price: number | null }>(
        supabase.from("wish_items").select("id, title, price").in("list_id", lists.map((l) => l.id)).is("removed_at", null).order("priority").order("position"),
      );
      return items;
    },
  });
}

/** Add or change a savings goal (with an optional wish-list item) */
export function GoalSheet({ value, onClose, memberId }: { value: PocketGoal | "new" | null; onClose: () => void; memberId: string }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const wish = useWishItems(value ? memberId : null);
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("🎯");
  const [target, setTarget] = useState("");
  const [wishId, setWishId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const existing = value && value !== "new" ? value : null;
  useEffect(() => {
    if (!value) return;
    setTitle(existing?.title ?? ""); setEmoji(existing?.emoji ?? "🎯"); setTarget(existing ? String(Number(existing.target)) : ""); setWishId(null);
  }, [value, existing]);
  const amt = parseAmount(target);
  const ok = title.trim().length > 0 && amt != null && amt > 0;

  async function save() {
    if (!ok || amt == null) return;
    setBusy(true);
    const row = { title: title.trim(), emoji: emoji.trim() || null, target: amt };
    const { error } = existing
      ? await supabase.from("pocket_goals").update(row).eq("id", existing.id)
      : await supabase.from("pocket_goals").insert({ ...row, family_id: family.id, member_id: memberId, wish_item_id: wishId });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshRewards(qc, family.id);
    onClose();
  }
  async function remove() {
    if (!existing) return;
    const { error } = await supabase.from("pocket_goals").update({ archived_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshRewards(qc, family.id);
    onClose();
  }

  return (
    <Sheet open={!!value} onOpenChange={(o) => !o && onClose()} title={existing ? "Change goal" : "New savings goal"}
      footer={<>
        <Button data-testid="goal-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        {existing ? <Button variant="outline" className="h-12 rounded-full" onClick={() => void remove()}>Remove</Button> : null}
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
      </>}>
      <div className="space-y-4">
        {!existing && wish.data?.length ? (
          <Field label="From their wish list" hint="Tap one to fill it in.">
            <div className="flex flex-wrap gap-2" data-testid="goal-wish">
              {wish.data.map((w) => (
                <Chip key={w.id} on={wishId === w.id} onClick={() => {
                  setWishId(w.id); setTitle(w.title.slice(0, 80)); if (w.price != null) setTarget(String(Number(w.price))); setEmoji("🎁");
                }}>🎁 {w.title}{w.price != null ? ` · ${money(w.price)}` : ""}</Chip>
              ))}
            </div>
          </Field>
        ) : null}
        <div className="grid grid-cols-[5rem_1fr] gap-2">
          <Field label="Picture"><Input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} className="h-11 text-center text-xl" /></Field>
          <Field label="Saving for"><Input data-testid="goal-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className="h-11" placeholder="Lego set" /></Field>
        </div>
        <Field label="How much it costs">
          <Input data-testid="goal-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0.00" className="h-12 text-xl font-bold" />
        </Field>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- a shop item card

export function ShopCard({ reward, stars, children, onClick, testId = "shop-item" }: {
  reward: Reward; stars: number; children?: ReactNode; onClick?: () => void; testId?: string;
}) {
  const can = stars >= reward.stars;
  const inner = (
    <>
      <span className="text-4xl" aria-hidden>{reward.emoji || "🎁"}</span>
      <span className="line-clamp-2 text-sm font-semibold">{reward.title}</span>
      <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-bold", can ? "bg-[var(--status-green-soft)] text-[var(--status-green)]" : "bg-[var(--surface)] text-muted-foreground")}>
        {reward.stars} ⭐
      </span>
      {children}
    </>
  );
  const cls = cn("glass-tile flex min-h-36 w-full flex-col items-center justify-center gap-1.5 p-3 text-center", can && "ring-2 ring-[var(--status-green)]");
  return onClick
    ? <button type="button" data-testid={testId} onClick={onClick} className={cls}>{inner}</button>
    : <div data-testid={testId} className={cls}>{inner}</div>;
}

/** A money record in a list */
export function EntryRow({ e, kindLabel }: { e: PocketEntry; kindLabel: string }) {
  const amt = Number(e.amount);
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] px-3 py-2">
      <span className="text-lg" aria-hidden>{POT_EMOJI[e.pot as Pot]}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{e.note || kindLabel}</span>
        <span className="block text-xs text-muted-foreground">
          {kindLabel} · {new Date(e.on_date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
          {e.status === "waiting" ? " · waiting for an OK" : e.status === "declined" ? " · not allowed" : ""}
        </span>
      </span>
      <span className={cn("font-bold tabular-nums", e.status !== "ok" && "opacity-50 line-through", amt > 0 && e.status === "ok" && "text-[var(--status-green)]")}>
        {amt > 0 ? "+" : "−"}{money(Math.abs(amt))}
      </span>
    </li>
  );
}
