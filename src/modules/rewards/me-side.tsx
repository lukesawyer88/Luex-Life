// The right-hand side of "Me": my own rewards (treats I'm saving stars for), my treat jar, and where my stars came from.
import { useQueryClient } from "@tanstack/react-query";
import { Archive, Gift, Minus, Pencil, PiggyBank, Plus, Settings2, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Field, Sheet } from "@/modules/calendar/ui";

import {
  errMsg, MONEY_KIND_LABEL, money, refreshRewards, shortDate, STAR_KIND_LABEL, todayIn, usePeopleSettings, usePocketEntries, useStarHistory,
  type Reward,
} from "./data";
import { addPocket } from "./outbox";

function parseMoney(s: string): number | null {
  const v = Number(s.replace(/[£,\s]/g, ""));
  return s.trim() && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

// ---------------------------------------------------------------- my rewards

export function MyRewards({ rewards, stars }: { rewards: Reward[]; stars: number }) {
  const { family, me } = useFamilyState();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Reward | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const claim = async (r: Reward) => {
    setBusy(r.id);
    const { error } = await supabase.from("reward_claims").insert({ family_id: family.id, reward_id: r.id, member_id: me.id });
    setBusy(null);
    if (error) { toast.error(errMsg(error)); return; }
    void refreshRewards(qc, family.id);
    toast.success(`Enjoy it! ${r.stars} stars spent`);
  };

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex flex-1 items-center gap-2 text-lg font-bold"><Gift className="size-5" /> My rewards</h2>
        <Button data-testid="myreward-add" variant="outline" className="h-10 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-4" /> Add</Button>
      </div>
      {!rewards.length ? (
        <p className="rounded-2xl bg-[var(--surface)] p-3 text-sm text-muted-foreground">Pick a treat to save your stars for, like new trainers or a night out.</p>
      ) : (
        <ul className="space-y-2">
          {rewards.map((r) => {
            const pct = Math.min(100, (stars / r.stars) * 100);
            const can = stars >= r.stars;
            return (
              <li key={r.id} className="glass-tile flex flex-col gap-2 p-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-xl">{r.emoji || "🎁"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.title}</span>
                    <span className="block text-xs text-muted-foreground">{can ? "You can have this now" : `${r.stars - stars} more stars to go`} · {r.stars} ★</span>
                  </span>
                  <Button variant="ghost" size="icon" className="size-10 rounded-full" aria-label="Change" onClick={() => setEdit(r)}><Pencil className="size-4" /></Button>
                </div>
                <span className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface)]"><span className="block h-full rounded-full bg-[var(--status-amber)]" style={{ width: `${pct}%` }} /></span>
                {can ? (
                  <Button data-testid="myreward-claim" className="h-11 rounded-full font-semibold" disabled={busy === r.id} onClick={() => void claim(r)}>
                    <Star className="size-4" /> Treat myself
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {edit ? <RewardForm key={edit === "new" ? "new" : edit.id} reward={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
    </section>
  );
}

function RewardForm({ reward, onClose }: { reward: Reward | null; onClose: () => void }) {
  const { family, me } = useFamilyState();
  const qc = useQueryClient();
  const [title, setTitle] = useState(reward?.title ?? "");
  const [emoji, setEmoji] = useState(reward?.emoji ?? "");
  const [stars, setStars] = useState(String(reward?.stars ?? 20));
  const [busy, setBusy] = useState(false);
  const st = Math.round(Number(stars));
  const ok = title.trim().length > 0 && Number.isFinite(st) && st >= 1 && st <= 100000;

  const save = async () => {
    setBusy(true);
    const row = { title: title.trim(), emoji: emoji.trim() || null, stars: st };
    const { error } = reward
      ? await supabase.from("rewards").update(row).eq("id", reward.id)
      : await supabase.from("rewards").insert({ ...row, family_id: family.id, kind: "me", owner: me.id });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    void refreshRewards(qc, family.id);
    onClose();
  };
  const archive = async () => {
    if (!reward) return;
    setBusy(true);
    const { error } = await supabase.from("rewards").update({ archived_at: new Date().toISOString() }).eq("id", reward.id);
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    void refreshRewards(qc, family.id);
    toast("Put away", {
      action: { label: "Undo", onClick: () => void supabase.from("rewards").update({ archived_at: null }).eq("id", reward.id).then(() => refreshRewards(qc, family.id)) },
    });
    onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={reward ? "Change reward" : "New reward"}
      footer={
        <>
          {reward ? <Button variant="ghost" className="h-11 rounded-full" disabled={busy} onClick={() => void archive()}><Archive className="size-4" /> Put away</Button> : null}
          <span className="flex-1" />
          <Button variant="outline" className="h-11 rounded-full" onClick={onClose}>Cancel</Button>
          <Button data-testid="myreward-save" className="h-11 rounded-full px-6 font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        </>
      }>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Field label="Picture"><Input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} placeholder="👟" className="h-11 w-16 text-center text-xl" aria-label="Emoji" /></Field>
          <div className="flex-1"><Field label="What's the treat?"><Input data-autofocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="New trainers" className="h-11" /></Field></div>
        </div>
        <Field label="How many stars?"><Input inputMode="numeric" value={stars} onChange={(e) => setStars(e.target.value.replace(/\D/g, ""))} className="h-11 w-32" /></Field>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- treat jar

export function TreatJar({ balance }: { balance: number }) {
  const { family, me } = useFamilyState();
  const people = usePeopleSettings();
  const mine = people.data?.get(me.id) ?? null;
  const entries = usePocketEntries(me.id);
  const [add, setAdd] = useState<"in" | "out" | null>(null);
  const [regular, setRegular] = useState(false);
  const recent = (entries.data ?? []).slice(0, 6);

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><PiggyBank className="size-5" /> Treat jar</h2>
      <div className="glass-tile flex flex-col gap-3 p-3">
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">Set aside for treats</span>
            <span data-testid="treat-balance" className="block text-3xl font-bold tabular-nums">{money(balance)}</span>
            <span className="block text-xs text-muted-foreground">
              {mine && Number(mine.pocket_amount) > 0
                ? `${money(mine.pocket_amount)} every ${mine.pocket_every}${mine.next_pay ? ` · next ${shortDate(mine.next_pay)}` : ""}`
                : "A record of money you put aside for yourself"}
            </span>
          </span>
          <Button variant="ghost" size="icon" className="size-10 rounded-full" aria-label="Regular amount" onClick={() => setRegular(true)}><Settings2 className="size-5" /></Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button data-testid="treat-add" className="h-11 rounded-full font-semibold" onClick={() => setAdd("in")}><Plus className="size-4" /> Put money in</Button>
          <Button data-testid="treat-spend" variant="outline" className="h-11 rounded-full font-semibold" onClick={() => setAdd("out")}><Minus className="size-4" /> Spent some</Button>
        </div>
        {recent.length ? (
          <ul className="divide-y text-sm">
            {recent.map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate">{e.note || MONEY_KIND_LABEL[e.kind]}<span className="text-muted-foreground"> · {shortDate(e.on_date)}</span></span>
                <span className={cn("font-semibold tabular-nums", Number(e.amount) > 0 && "text-[var(--status-green)]")}>{Number(e.amount) > 0 ? "+" : ""}{money(e.amount)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {add ? <TreatMove key={add} way={add} onClose={() => setAdd(null)} /> : null}
      {regular ? <TreatRegular familyId={family.id} onClose={() => setRegular(false)} /> : null}
    </section>
  );
}

function TreatMove({ way, onClose }: { way: "in" | "out"; onClose: () => void }) {
  const { family, me } = useFamilyState();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const a = parseMoney(amount);
  const ok = a != null && a > 0 && a < 1000000;

  const save = async () => {
    if (a == null) return;
    setBusy(true);
    try {
      const r = await addPocket({
        family_id: family.id, member_id: me.id, pot: "spend", amount: way === "in" ? a : -a, kind: way === "in" ? "gift" : "spend",
        note: note.trim(), on_date: todayIn(family.timezone),
      });
      toast(r === "waiting" ? "Saved, it will send when you have a signal" : "Saved");
      void refreshRewards(qc, family.id);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={way === "in" ? "Put money in" : "Spent some"}
      footer={
        <>
          <span className="flex-1" />
          <Button variant="outline" className="h-11 rounded-full" onClick={onClose}>Cancel</Button>
          <Button data-testid="treat-save" className="h-11 rounded-full px-6 font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        </>
      }>
      <div className="space-y-4">
        <Field label="How much"><Input data-testid="treat-amount" data-autofocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-12 text-lg" /></Field>
        <Field label={way === "in" ? "Note (optional)" : "What on (optional)"}>
          <Input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder={way === "in" ? "Birthday money" : "Cinema"} className="h-11" />
        </Field>
      </div>
    </Sheet>
  );
}

function TreatRegular({ familyId, onClose }: { familyId: string; onClose: () => void }) {
  const { family, me } = useFamilyState();
  const qc = useQueryClient();
  const people = usePeopleSettings();
  const mine = people.data?.get(me.id) ?? null;
  const today = todayIn(family.timezone);
  const [amount, setAmount] = useState(mine ? String(Number(mine.pocket_amount) || "") : "");
  const [every, setEvery] = useState<"week" | "fortnight" | "month">((mine?.pocket_every as "week" | "fortnight" | "month") ?? "month");
  const [next, setNext] = useState(mine?.next_pay && mine.next_pay >= today ? mine.next_pay : today);
  const [busy, setBusy] = useState(false);
  const a = amount.trim() ? parseMoney(amount) : 0;
  const ok = a != null && a >= 0 && a < 10000 && next >= today;

  const save = async () => {
    setBusy(true);
    const row = { pocket_amount: a ?? 0, pocket_every: every, next_pay: (a ?? 0) > 0 ? next : null };
    const { error } = mine
      ? await supabase.from("reward_people").update(row).eq("member_id", me.id)
      : await supabase.from("reward_people").insert({ ...row, member_id: me.id, family_id: familyId });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    void refreshRewards(qc, family.id);
    onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Regular treat money"
      description="Adds itself to your treat jar on the day. It's a record only: no money moves."
      footer={
        <>
          <span className="flex-1" />
          <Button variant="outline" className="h-11 rounded-full" onClick={onClose}>Cancel</Button>
          <Button className="h-11 rounded-full px-6 font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        </>
      }>
      <div className="space-y-4">
        <Field label="How much" hint="Leave empty or 0 to stop it"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-12 w-40 text-lg" /></Field>
        <Field label="How often">
          <div className="flex flex-wrap gap-2">
            {(["week", "fortnight", "month"] as const).map((e) => <Chip key={e} on={every === e} onClick={() => setEvery(e)}>Every {e}</Chip>)}
          </div>
        </Field>
        <Field label="Next time"><Input type="date" value={next} min={today} onChange={(e) => setNext(e.target.value)} className="h-11 w-48" /></Field>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- where my stars came from

export function StarHistory() {
  const { me } = useFamilyState();
  const q = useStarHistory(me.id, 20);
  const list = q.data ?? [];
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><Star className="size-5" /> Where my stars came from</h2>
      {!list.length ? (
        <p className="rounded-2xl bg-[var(--surface)] p-3 text-sm text-muted-foreground">Stars arrive from habits, chores, routines and goals.</p>
      ) : (
        <ul className="divide-y rounded-2xl bg-[var(--surface)] px-3 text-sm">
          {list.slice(0, 8).map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate">{s.note || STAR_KIND_LABEL[s.kind]}<span className="text-muted-foreground"> · {STAR_KIND_LABEL[s.kind]}</span></span>
              <span className={cn("font-semibold tabular-nums", s.delta > 0 ? "text-[var(--status-green)]" : "text-muted-foreground")}>{s.delta > 0 ? "+" : ""}{s.delta} ★</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
