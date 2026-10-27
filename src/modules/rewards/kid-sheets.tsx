// The forms a parent uses for a child: pocket money, advances, stars, habits and the reward shop.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { Chip, Field, Sheet } from "@/modules/calendar/ui";

import { errMsg, money, refreshRewards, todayIn, type Habit, type Reward, type RewardPerson, type RewardSettings } from "./data";
import { parseAmount } from "./kid-parts";

const EVERY_LABEL: Record<RewardPerson["pocket_every"], string> = { week: "Every week", fortnight: "Every 2 weeks", month: "Every month" };

function SwitchRow({ label, hint, on, onChange, testId }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label className="flex items-start gap-3 rounded-2xl bg-[var(--surface)] p-3">
      <Switch checked={on} onCheckedChange={onChange} data-testid={testId} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

/** Pocket money settings for one child */
export function PocketSettingsSheet({ open, onClose, childId, name, person }: {
  open: boolean; onClose: () => void; childId: string; name: string; person: RewardPerson | undefined;
}) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const [amount, setAmount] = useState("");
  const [every, setEvery] = useState<RewardPerson["pocket_every"]>("week");
  const [nextPay, setNextPay] = useState(today);
  const [save, setSave] = useState("0");
  const [give, setGive] = useState("0");
  const [pause, setPause] = useState("");
  const [teen, setTeen] = useState(false);
  const [interest, setInterest] = useState("0");
  const [match, setMatch] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(person && Number(person.pocket_amount) > 0 ? String(Number(person.pocket_amount)) : "");
    setEvery(person?.pocket_every ?? "week");
    setNextPay(person?.next_pay && person.next_pay >= today ? person.next_pay : today);
    setSave(String(person?.save_pct ?? 0)); setGive(String(person?.give_pct ?? 0));
    setPause(person?.paused_until ?? ""); setTeen(!!person?.teen_mode);
    setInterest(String(Number(person?.interest_pct ?? 0))); setMatch(String(person?.match_pct ?? 0));
  }, [open, person, today]);

  const amt = amount.trim() ? parseAmount(amount) : 0;
  const sp = Number(save) || 0;
  const gp = Number(give) || 0;
  const ip = Number(interest) || 0;
  const mp = Number(match) || 0;
  const ok = amt != null && amt >= 0 && sp >= 0 && gp >= 0 && sp + gp <= 100 && ip >= 0 && ip <= 20 && mp >= 0 && mp <= 200;

  async function saveIt() {
    if (!ok || amt == null) return;
    setBusy(true);
    const row = {
      pocket_amount: amt, pocket_every: every, next_pay: amt > 0 ? nextPay : null, save_pct: Math.round(sp), give_pct: Math.round(gp),
      paused_until: pause || null, teen_mode: teen, interest_pct: ip, match_pct: Math.round(mp),
    };
    const { error } = person
      ? await supabase.from("reward_people").update(row).eq("member_id", childId)
      : await supabase.from("reward_people").insert({ ...row, member_id: childId, family_id: family.id });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("Saved");
    await refreshRewards(qc, family.id);
    onClose();
  }

  const each = amt ?? 0;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={`Pocket money for ${name}`}
      footer={<>
        <Button data-testid="kid-pocket-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={!ok || busy} onClick={() => void saveIt()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
      </>}>
      <div className="space-y-4">
        <Field label="How much" hint="It pays itself on the day. Leave empty for none.">
          <Input data-testid="kid-pocket-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-12 text-xl font-bold" />
        </Field>
        <Field label="How often">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(EVERY_LABEL) as RewardPerson["pocket_every"][]).map((k) => <Chip key={k} on={every === k} onClick={() => setEvery(k)}>{EVERY_LABEL[k]}</Chip>)}
          </div>
        </Field>
        <Field label="Next pay day"><Input type="date" min={today} value={nextPay} onChange={(e) => setNextPay(e.target.value)} className="h-11" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="% into save"><Input inputMode="numeric" value={save} onChange={(e) => setSave(e.target.value)} className="h-11" /></Field>
          <Field label="% into give"><Input inputMode="numeric" value={give} onChange={(e) => setGive(e.target.value)} className="h-11" /></Field>
        </div>
        {each > 0 && sp + gp <= 100 ? (
          <p className="rounded-2xl bg-[var(--surface)] p-3 text-sm">
            Each pay day: {money(each - Math.round(each * sp) / 100 - Math.round(each * gp) / 100)} to spend, {money(Math.round(each * sp) / 100)} to save, {money(Math.round(each * gp) / 100)} to give.
          </p>
        ) : null}
        {sp + gp > 100 ? <p className="text-sm text-[var(--status-red)]">Save and give can't add up to more than 100%.</p> : null}
        <Field label="Pause until (holidays)" hint="No pocket money until after this day."><Input type="date" value={pause} onChange={(e) => setPause(e.target.value)} className="h-11" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Interest on savings" hint="% a month, paid by you on the 1st"><Input inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} className="h-11" /></Field>
          <Field label="Match savings" hint="% you add to what they save each month"><Input inputMode="numeric" value={match} onChange={(e) => setMatch(e.target.value)} className="h-11" /></Field>
        </div>
        <SwitchRow label="Teen mode" hint="Their own spending and rewards don't wait for an OK, and they can move money out of savings." on={teen} onChange={setTeen} />
      </div>
    </Sheet>
  );
}

/** Lend a child money now, paid back from pocket money */
export function AdvanceSheet({ open, onClose, childId, name }: { open: boolean; onClose: () => void; childId: string; name: string }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [repay, setRepay] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setAmount(""); setRepay(""); } }, [open]);
  const a = parseAmount(amount);
  const r = parseAmount(repay);
  const ok = a != null && a > 0 && r != null && r > 0;

  async function save() {
    if (!ok || a == null || r == null) return;
    setBusy(true);
    const { error } = await supabase.rpc("reward_advance", { p_child: childId, p_amount: a, p_repay: r });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(`${money(a)} lent to ${name}`);
    await refreshRewards(qc, family.id);
    onClose();
  }
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={`Advance for ${name}`} description="Paid back from their pocket money automatically."
      footer={<>
        <Button data-testid="advance-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Saving…" : "Lend it"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
      </>}>
      <div className="space-y-4">
        <Field label="How much now"><Input data-testid="advance-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-12 text-xl font-bold" /></Field>
        <Field label="Paid back each pay day"><Input data-testid="advance-repay" inputMode="decimal" value={repay} onChange={(e) => setRepay(e.target.value)} placeholder="0.00" className="h-11" /></Field>
        {a && r ? <p className="text-sm text-muted-foreground">About {Math.ceil(a / r)} pay days to pay it back.</p> : null}
      </div>
    </Sheet>
  );
}

/** Give (or take) stars by hand */
export function StarsSheet({ open, onClose, childId, name, deductions }: { open: boolean; onClose: () => void; childId: string; name: string; deductions: boolean }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [n, setN] = useState("");
  const [note, setNote] = useState("");
  const [take, setTake] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setN(""); setNote(""); setTake(false); } }, [open]);
  const v = Math.round(Number(n));
  const ok = Number.isFinite(v) && v > 0 && v < 1000;

  async function save() {
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.from("star_entries").insert({
      family_id: family.id, member_id: childId, delta: take ? -v : v, kind: take ? "deduction" : "bonus", note: note.trim(),
    });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(take ? `${v} stars taken off` : `${v} stars given`);
    await refreshRewards(qc, family.id);
    onClose();
  }
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={`Stars for ${name}`}
      footer={<>
        <Button data-testid="stars-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Saving…" : take ? "Take off" : "Give stars"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
      </>}>
      <div className="space-y-4">
        {deductions ? (
          <div className="flex gap-2">
            <Chip on={!take} onClick={() => setTake(false)}>⭐ Give</Chip>
            <Chip on={take} onClick={() => setTake(true)}>➖ Take off</Chip>
          </div>
        ) : null}
        <Field label="How many stars"><Input data-testid="stars-amount" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} placeholder="5" className="h-12 text-xl font-bold" /></Field>
        <Field label="What for (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} className="h-11" placeholder="Kind to her brother" /></Field>
      </div>
    </Sheet>
  );
}

/** Swap stars for money at the household's rate */
export function SwapSheet({ open, onClose, memberId, stars, settings }: { open: boolean; onClose: () => void; memberId: string; stars: number; settings: RewardSettings }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [n, setN] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setN(""); }, [open]);
  const rate = settings.stars_per_pound ?? 0;
  const v = Math.round(Number(n));
  const ok = rate > 0 && Number.isFinite(v) && v > 0 && v <= stars && v / rate >= 0.01;

  async function save() {
    if (!ok) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("reward_swap", { p_member: memberId, p_stars: v });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(`${v} stars swapped for ${money(Number(data))}`);
    await refreshRewards(qc, family.id);
    onClose();
  }
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Swap stars for money" description={`${rate} stars make £1. You have ${stars} stars.`}
      footer={<>
        <Button data-testid="swap-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Swapping…" : "Swap"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
      </>}>
      <div className="space-y-4">
        <Field label="How many stars"><Input data-testid="swap-amount" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} className="h-12 text-xl font-bold" /></Field>
        {ok ? <p className="text-lg font-semibold">= {money(Math.round((v / rate) * 100) / 100)}</p> : null}
        {v > stars ? <p className="text-sm text-[var(--status-red)]">That's more stars than there are.</p> : null}
      </div>
    </Sheet>
  );
}

/** Add or change a child's habit (the parent sets the stars) */
export function HabitSheet({ value, onClose, childId }: { value: Habit | "new" | null; onClose: () => void; childId: string }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const existing = value && value !== "new" ? value : null;
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("✅");
  const [per, setPer] = useState<"day" | "week">("day");
  const [target, setTarget] = useState("1");
  const [unit, setUnit] = useState("");
  const [stars, setStars] = useState("1");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!value) return;
    setTitle(existing?.title ?? ""); setEmoji(existing?.emoji ?? "✅"); setPer((existing?.per as "day" | "week") ?? "day");
    setTarget(String(existing?.target ?? 1)); setUnit(existing?.unit ?? ""); setStars(String(existing?.stars ?? 1));
  }, [value, existing]);
  const t = Math.round(Number(target));
  const s = Math.round(Number(stars));
  const ok = title.trim().length > 0 && t >= 1 && t <= (per === "week" ? 7 : 1000) && s >= 0 && s <= 100;

  async function save() {
    if (!ok) return;
    setBusy(true);
    const row = { title: title.trim(), emoji: emoji.trim() || null, per, target: t, unit: unit.trim() || null, stars: s };
    const { error } = existing
      ? await supabase.from("habits").update(row).eq("id", existing.id)
      : await supabase.from("habits").insert({ ...row, family_id: family.id, member_id: childId });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshRewards(qc, family.id);
    onClose();
  }
  async function remove() {
    if (!existing) return;
    const { error } = await supabase.from("habits").update({ archived_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshRewards(qc, family.id);
    onClose();
  }
  return (
    <Sheet open={!!value} onOpenChange={(o) => !o && onClose()} title={existing ? "Change habit" : "New habit"}
      footer={<>
        <Button data-testid="habit-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        {existing ? <Button variant="outline" className="h-12 rounded-full" onClick={() => void remove()}>Remove</Button> : null}
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-[5rem_1fr] gap-2">
          <Field label="Picture"><Input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} className="h-11 text-center text-xl" /></Field>
          <Field label="Habit"><Input data-testid="habit-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} className="h-11" placeholder="Brush teeth" /></Field>
        </div>
        <Field label="How often">
          <div className="flex gap-2">
            <Chip on={per === "day"} onClick={() => setPer("day")}>Every day</Chip>
            <Chip on={per === "week"} onClick={() => setPer("week")}>Days a week</Chip>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={per === "day" ? "Times a day" : "Days a week"}><Input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} className="h-11" /></Field>
          {per === "day" ? <Field label="Counted in (optional)"><Input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} className="h-11" placeholder="glasses" /></Field> : <div />}
        </div>
        <Field label="Stars each time it's reached"><Input data-testid="habit-stars" inputMode="numeric" value={stars} onChange={(e) => setStars(e.target.value)} className="h-11" /></Field>
      </div>
    </Sheet>
  );
}

/** Add or change something in the reward shop */
export function ShopSheet({ value, onClose }: { value: Reward | "new" | null; onClose: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const existing = value && value !== "new" ? value : null;
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("🎁");
  const [stars, setStars] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!value) return;
    setTitle(existing?.title ?? ""); setEmoji(existing?.emoji ?? "🎁"); setStars(existing ? String(existing.stars) : "");
  }, [value, existing]);
  const s = Math.round(Number(stars));
  const ok = title.trim().length > 0 && s >= 1 && s <= 100000;

  async function save() {
    if (!ok) return;
    setBusy(true);
    const row = { title: title.trim(), emoji: emoji.trim() || null, stars: s };
    const { error } = existing
      ? await supabase.from("rewards").update(row).eq("id", existing.id)
      : await supabase.from("rewards").insert({ ...row, family_id: family.id, kind: "shop" });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshRewards(qc, family.id);
    onClose();
  }
  async function remove() {
    if (!existing) return;
    const { error } = await supabase.from("rewards").update({ archived_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) { toast.error(errMsg(error)); return; }
    toast("Taken out of the shop");
    await refreshRewards(qc, family.id);
    onClose();
  }
  return (
    <Sheet open={!!value} onOpenChange={(o) => !o && onClose()} title={existing ? "Change reward" : "Add to the reward shop"}
      footer={<>
        <Button data-testid="shop-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        {existing ? <Button variant="outline" className="h-12 rounded-full" onClick={() => void remove()}>Take out</Button> : null}
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-[5rem_1fr] gap-2">
          <Field label="Picture"><Input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} className="h-11 text-center text-xl" /></Field>
          <Field label="Reward"><Input data-testid="shop-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className="h-11" placeholder="30 minutes of screen time" /></Field>
        </div>
        <Field label="Price in stars"><Input data-testid="shop-stars" inputMode="numeric" value={stars} onChange={(e) => setStars(e.target.value)} placeholder="10" className="h-12 text-xl font-bold" /></Field>
      </div>
    </Sheet>
  );
}
