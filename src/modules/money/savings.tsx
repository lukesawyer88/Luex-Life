// Savings goals, pots (Christmas, holidays), the cash envelope, and gift budgets per person for the year.
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Archive, ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Gift, Pencil, PiggyBank, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { Chip, Empty, Field, PeoplePicker, Sheet } from "@/modules/calendar/ui";

import { JustMine, MineLock, parseAmount } from "./bill-parts";
import {
  daysBetween, errMsg, money, refreshMoney, shortDate, todayIn, useGiftBudgets, usePayments, usePots, type GiftBudget, type Pot, type PotMove,
} from "./data";
import type { TabProps } from "./money-page";

const KIND_LABEL: Record<Pot["kind"], string> = { goal: "Savings goal", pot: "Pot", cash: "Cash envelope" };
const OCCASION_LABEL: Record<GiftBudget["occasion"], string> = { birthday: "Birthday", christmas: "Christmas", other: "Other" };

/** "£X a month to get there" (null when there's no target date or it's already reached) */
function perMonthToGoal(pot: Pot, balance: number, today: string): number | null {
  if (!pot.target || !pot.target_date) return null;
  const left = Number(pot.target) - balance;
  if (left <= 0) return null;
  const months = Math.max(1, Math.ceil(daysBetween(today, pot.target_date) / 30.44));
  return left / months;
}

export function SavingsTab({ target }: TabProps) {
  const [view, setView] = useState<"pots" | "gifts">("pots");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex gap-1.5">
        <Chip on={view === "pots"} onClick={() => setView("pots")}><PiggyBank className="size-4" /> Savings and pots</Chip>
        <Chip on={view === "gifts"} onClick={() => setView("gifts")}><Gift className="size-4" /> Gift budgets</Chip>
      </div>
      {view === "pots" ? <Pots potId={target.potId} /> : <Gifts />}
    </div>
  );
}

// ---------------------------------------------------------------- pots

function Pots({ potId }: { potId?: string }) {
  const { family } = useFamilyState();
  const desktop = useDesktop();
  const today = todayIn(family.timezone);
  const q = usePots();
  const pots = useMemo(() => q.data?.pots ?? [], [q.data]);
  const moves = useMemo(() => q.data?.moves ?? [], [q.data]);
  const [openId, setOpenId] = useState<string | null>(potId ?? null);
  const [edit, setEdit] = useState<Pot | "new" | null>(null);
  const [move, setMove] = useState<{ pot: Pot; out: boolean } | null>(null);
  const open = pots.find((p) => p.id === openId) ?? null;
  const balance = (id: string) => moves.filter((m) => m.pot_id === id).reduce((n, m) => n + Number(m.amount), 0);

  useEffect(() => { if (desktop && !openId && pots.length) setOpenId(pots[0].id); }, [desktop, openId, pots]);

  const groups: { kind: Pot["kind"]; title: string }[] = [
    { kind: "goal", title: "Savings goals" }, { kind: "pot", title: "Pots" }, { kind: "cash", title: "Cash" },
  ];
  const detail = open ? (
    <PotDetail pot={open} moves={moves.filter((m) => m.pot_id === open.id)} balance={balance(open.id)} today={today}
      onEdit={() => setEdit(open)} onMove={(out) => setMove({ pot: open, out })} onClosed={() => setOpenId(null)} />
  ) : <Empty icon={PiggyBank} title="Pick a pot">How much is in it, and its history, show here.</Empty>;

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Savings and pots</h2>
          <Button data-testid="pot-add" className="h-10 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-4" /> Add</Button>
        </div>
        {q.isLoading ? null : !pots.length ? (
          <Empty icon={PiggyBank} title="No pots yet">Add a savings goal (a new car), a pot (Christmas, holidays) or a cash envelope.</Empty>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => {
              const list = pots.filter((p) => p.kind === g.kind);
              if (!list.length) return null;
              return (
                <section key={g.kind}>
                  <h3 className="mb-2 text-sm font-bold">{g.title}</h3>
                  <ul className="space-y-2">
                    {list.map((p) => {
                      const bal = balance(p.id);
                      const pct = p.target ? Math.min(100, Math.max(0, (bal / Number(p.target)) * 100)) : null;
                      return (
                        <li key={p.id}>
                          <button type="button" data-testid="pot-row" onClick={() => setOpenId(p.id)}
                            className={cn("glass-tile flex min-h-14 w-full flex-col gap-2 p-3 text-left", openId === p.id && "ring-2 ring-[var(--status-blue)]")}>
                            <span className="flex w-full items-center gap-3">
                              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-xl">{p.emoji || (p.kind === "cash" ? "💷" : "🐷")}</span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5 font-semibold"><span className="truncate">{p.name}</span>{p.private_to ? <MineLock /> : null}</span>
                                {p.target ? <span className="block text-xs text-muted-foreground">of {money(p.target, true)}{p.target_date ? ` by ${shortDate(p.target_date)}` : ""}</span> : null}
                              </span>
                              <span className="font-bold tabular-nums">{money(bal)}</span>
                            </span>
                            {pct != null ? <span className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface)]"><span className="block h-full rounded-full bg-[var(--status-green)]" style={{ width: `${pct}%` }} /></span> : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </RecordsWindow>
      <DetailWindow>{detail}</DetailWindow>
      {!desktop ? (
        <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)} title={open?.name ?? ""}>
          {open ? <PotDetail pot={open} moves={moves.filter((m) => m.pot_id === open.id)} balance={balance(open.id)} today={today}
            onEdit={() => setEdit(open)} onMove={(out) => setMove({ pot: open, out })} onClosed={() => setOpenId(null)} hideTitle /> : null}
        </Sheet>
      ) : null}
      <EditPot value={edit} onClose={() => setEdit(null)} onSaved={(id) => { setEdit(null); setOpenId(id); }} />
      <MoveSheet value={move} onClose={() => setMove(null)} />
    </Windows>
  );
}

function PotDetail({ pot, moves, balance, today, onEdit, onMove, onClosed, hideTitle }: {
  pot: Pot; moves: PotMove[]; balance: number; today: string; onEdit: () => void; onMove: (out: boolean) => void; onClosed: () => void; hideTitle?: boolean;
}) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const monthly = perMonthToGoal(pot, balance, today);
  const reached = pot.target != null && balance >= Number(pot.target);

  async function archive() {
    const { error } = await supabase.from("money_pots").update({ archived_at: new Date().toISOString() }).eq("id", pot.id);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshMoney(qc, family.id);
    onClosed();
    toast(`${pot.name} put away`, { action: { label: "Undo", onClick: async () => { await supabase.from("money_pots").update({ archived_at: null }).eq("id", pot.id); await refreshMoney(qc, family.id); } } });
  }
  async function removeMove(m: PotMove) {
    const { error } = await supabase.from("money_pot_moves").delete().eq("id", m.id);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshMoney(qc, family.id);
    toast("Removed", {
      action: { label: "Undo", onClick: async () => { await supabase.from("money_pot_moves").insert({ pot_id: m.pot_id, family_id: m.family_id, amount: m.amount, on_date: m.on_date, note: m.note }); await refreshMoney(qc, family.id); } },
    });
  }

  return (
    <div className="space-y-4" data-testid="pot-detail">
      {!hideTitle ? <h2 className="flex items-center gap-2 text-lg font-bold">{pot.emoji ? `${pot.emoji} ` : ""}{pot.name}{pot.private_to ? <MineLock className="size-4" /> : null}</h2> : null}
      <div className="glass-tile p-3">
        <p className="text-xs text-muted-foreground">{KIND_LABEL[pot.kind]}</p>
        <p className="text-3xl font-bold tabular-nums" data-testid="pot-balance">{money(balance)}</p>
        {pot.target ? (
          <>
            <p className="text-sm text-muted-foreground">of {money(pot.target)}{pot.target_date ? ` by ${shortDate(pot.target_date)}` : ""}</p>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-[var(--surface)]"><div className="h-full rounded-full bg-[var(--status-green)]" style={{ width: `${Math.min(100, Math.max(0, (balance / Number(pot.target)) * 100))}%` }} /></div>
            {reached ? <p className="mt-2 font-semibold text-[var(--status-green)]">You've reached it 🎉</p>
              : monthly != null ? <p className="mt-2 text-sm" data-testid="pot-monthly"><b>{money(monthly)} a month</b> to get there</p>
              : <p className="mt-2 text-sm text-muted-foreground">{money(Number(pot.target) - balance)} to go</p>}
          </>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button data-testid="pot-move" className="h-11 rounded-full font-semibold" onClick={() => onMove(false)}><ArrowDownLeft className="size-4" /> Put money in</Button>
        <Button data-testid="pot-take" variant="outline" className="h-11 rounded-full" onClick={() => onMove(true)}><ArrowUpRight className="size-4" /> Take money out</Button>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" className="h-10 flex-1 rounded-full" onClick={onEdit}><Pencil className="size-4" /> Change</Button>
        <Button variant="ghost" className="h-10 flex-1 rounded-full" onClick={() => void archive()}><Archive className="size-4" /> Put away</Button>
      </div>
      <section>
        <h3 className="mb-2 text-sm font-bold">History</h3>
        {moves.length ? (
          <ul className="space-y-1">
            {moves.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-xl bg-[var(--surface)] px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{shortDate(m.on_date)}{m.note ? ` · ${m.note}` : ""}</span>
                <span className={cn("font-semibold tabular-nums", Number(m.amount) < 0 && "text-[var(--status-red)]")}>{Number(m.amount) < 0 ? "−" : "+"}{money(Math.abs(Number(m.amount)))}</span>
                <Button variant="ghost" size="icon" className="size-9 rounded-full" onClick={() => void removeMove(m)} aria-label="Remove"><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Nothing in or out yet.</p>}
      </section>
    </div>
  );
}

function MoveSheet({ value, onClose }: { value: { pot: Pot; out: boolean } | null; onClose: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (value) { setAmount(""); setDate(today); setNote(""); } }, [value, today]);
  const a = parseAmount(amount);
  const ok = a != null && a > 0;

  async function save() {
    if (!value || !ok) return;
    setBusy(true);
    const { error } = await supabase.from("money_pot_moves").insert({
      pot_id: value.pot.id, family_id: family.id, amount: value.out ? -a! : a!, on_date: date || today, note: note.trim().slice(0, 200),
    });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshMoney(qc, family.id);
    toast.success(value.out ? `${money(a)} taken out` : `${money(a)} put in`);
    onClose();
  }

  return (
    <Sheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={value ? (value.out ? `Take money out of ${value.pot.name}` : `Put money into ${value.pot.name}`) : ""}
      footer={
        <>
          <Button data-testid="pot-move-save" className="h-11 flex-1 rounded-full text-base font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={onClose}><X className="size-4" /> Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="How much"><Input data-testid="pot-move-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-12 text-lg" data-autofocus /></Field>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" /></Field>
        <Field label="Note" hint="Optional"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="h-11" placeholder={value?.out ? "Paid for the flights" : "Birthday money"} /></Field>
      </div>
    </Sheet>
  );
}

function EditPot({ value, onClose, onSaved }: { value: Pot | "new" | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { family, me } = useFamilyState();
  const qc = useQueryClient();
  const existing = value && value !== "new" ? value : null;
  const [kind, setKind] = useState<Pot["kind"]>("goal");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [targetAmt, setTargetAmt] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [mine, setMine] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!value) return;
    setKind(existing?.kind ?? "goal"); setName(existing?.name ?? ""); setEmoji(existing?.emoji ?? "");
    setTargetAmt(existing?.target ? String(existing.target) : ""); setTargetDate(existing?.target_date ?? ""); setMine(!!existing?.private_to);
  }, [value, existing]);
  const t = parseAmount(targetAmt);
  const ok = !!name.trim() && (targetAmt.trim() === "" || (t != null && t > 0));
  const cantHide = !!existing && !existing.private_to && existing.created_by !== me.id;

  async function save() {
    if (!ok) return;
    setBusy(true);
    const row = { name: name.trim().slice(0, 60), emoji: emoji.trim().slice(0, 8) || null, target: t, target_date: targetDate || null, private_to: mine ? me.id : null };
    const res = existing
      ? await supabase.from("money_pots").update(row).eq("id", existing.id).select("id").single()
      : await supabase.from("money_pots").insert({ ...row, kind, family_id: family.id }).select("id").single();
    setBusy(false);
    if (res.error) { toast.error(errMsg(res.error)); return; }
    await refreshMoney(qc, family.id);
    onSaved(res.data.id as string);
  }

  return (
    <Sheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "Change pot" : "Add a goal or pot"}
      footer={
        <>
          <Button data-testid="pot-save" className="h-11 flex-1 rounded-full text-base font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={onClose}><X className="size-4" /> Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        {!existing ? (
          <div className="flex flex-wrap gap-2">
            {(["goal", "pot", "cash"] as const).map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</Chip>)}
          </div>
        ) : null}
        <div className="grid grid-cols-[4.5rem_1fr] gap-2">
          <Field label="Picture"><Input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder={kind === "cash" ? "💷" : "🎄"} className="h-11 text-center text-xl" maxLength={8} aria-label="Emoji" /></Field>
          <Field label="Name"><Input data-testid="pot-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "goal" ? "New car" : kind === "cash" ? "Cash in the tin" : "Christmas"} className="h-11" maxLength={60} data-autofocus /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Target" hint="Optional"><Input data-testid="pot-target" inputMode="decimal" value={targetAmt} onChange={(e) => setTargetAmt(e.target.value)} placeholder="0.00" className="h-11" /></Field>
          <Field label="By" hint="Optional"><Input data-testid="pot-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="h-11" /></Field>
        </div>
        <JustMine on={mine} onChange={setMine} disabled={cantHide && !mine} hint={cantHide ? "Only the parent who added this can make it private." : undefined} />
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- gift budgets

function Gifts() {
  const { family, members } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const budgets = useGiftBudgets(year).data ?? [];
  const pays = usePayments(`${year}-01-01`, `${year}-12-31`).data ?? [];
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<GiftBudget | null>(null);
  const spent = (id: string) => pays.filter((p) => p.gift_budget_id === id && p.direction === "out").reduce((n, p) => n + Number(p.amount_gbp), 0);
  const who = (g: GiftBudget) => members.find((m) => m.id === g.person)?.display_name ?? g.person_name ?? "Someone";
  const total = budgets.reduce((n, g) => n + Number(g.budget), 0);
  const totalSpent = budgets.reduce((n, g) => n + spent(g.id), 0);

  async function remove(g: GiftBudget) {
    const { error } = await supabase.from("money_gift_budgets").delete().eq("id", g.id);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshMoney(qc, family.id);
    toast("Gift budget removed", {
      action: { label: "Undo", onClick: async () => { await supabase.from("money_gift_budgets").insert({ family_id: family.id, person: g.person, person_name: g.person_name, occasion: g.occasion, year: g.year, budget: g.budget }); await refreshMoney(qc, family.id); } },
    });
  }

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setYear(year - 1)} aria-label="Last year"><ChevronLeft className="size-5" /></Button>
          <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setYear(year + 1)} aria-label="Next year"><ChevronRight className="size-5" /></Button>
          <h2 className="flex-1 text-lg font-bold">Gifts {year}</h2>
          <Button data-testid="gift-add" className="h-10 rounded-full px-4 font-semibold" onClick={() => setAdding(true)}><Plus className="size-4" /> Add</Button>
        </div>
        {budgets.length ? (
          <>
            <p className="text-sm"><b className="tabular-nums">{money(totalSpent)}</b> spent of <b className="tabular-nums">{money(total)}</b></p>
            <ul className="space-y-2">
              {budgets.map((g) => {
                const s = spent(g.id);
                const over = s > Number(g.budget);
                return (
                  <li key={g.id} className="glass-tile space-y-2 p-3" data-testid="gift-row">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{who(g)}</span>
                        <span className="text-xs text-muted-foreground">{OCCASION_LABEL[g.occasion]}</span>
                      </span>
                      <span className="text-right text-sm tabular-nums"><b className={cn(over && "text-[var(--status-red)]")}>{money(s)}</b> of {money(g.budget)}</span>
                      <Button variant="ghost" size="icon" className="size-9 rounded-full" onClick={() => setEditing(g)} aria-label="Change budget"><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" className="size-9 rounded-full" onClick={() => void remove(g)} aria-label="Remove"><Trash2 className="size-4" /></Button>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--surface)]"><div className={cn("h-full rounded-full", over ? "bg-[var(--status-red)]" : "bg-[var(--status-green)]")} style={{ width: `${Math.min(100, Number(g.budget) ? (s / Number(g.budget)) * 100 : 100)}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <Empty icon={Gift} title="No gift budgets yet">Set how much to spend on each person's birthday or Christmas. Link a payment to a budget when you add it.</Empty>
        )}
        <p className="px-1 text-xs text-muted-foreground">Gift ideas live in the <Link to="/m/$key" params={{ key: "calendar" }} className="font-semibold text-[var(--status-blue)] underline-offset-2 hover:underline">Calendar's wish lists</Link>.</p>
      </RecordsWindow>
      <AddGift open={adding} year={year} onClose={() => setAdding(false)} />
      <EditGift value={editing} onClose={() => setEditing(null)} name={editing ? who(editing) : ""} />
    </Windows>
  );
}

function AddGift({ open, year, onClose }: { open: boolean; year: number; onClose: () => void }) {
  const { family, members } = useFamilyState();
  const qc = useQueryClient();
  const [person, setPerson] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [occasion, setOccasion] = useState<GiftBudget["occasion"]>("christmas");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setPerson([]); setName(""); setOccasion("christmas"); setBudget(""); } }, [open]);
  const b = parseAmount(budget);
  const ok = (person.length === 1 || !!name.trim()) && b != null && b >= 0;

  async function save() {
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.from("money_gift_budgets").insert({
      family_id: family.id, year, occasion, budget: b!,
      person: person[0] ?? null, person_name: person[0] ? null : name.trim().slice(0, 60),
    });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshMoney(qc, family.id);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Gift budget for ${year}`}
      footer={
        <>
          <Button data-testid="gift-save" className="h-11 flex-1 rounded-full text-base font-semibold" disabled={!ok || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={onClose}><X className="size-4" /> Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Who for">
          <PeoplePicker members={members} value={person} onChange={(v) => { setPerson(v); if (v.length) setName(""); }} single />
        </Field>
        <Field label="Or type a name" hint="For friends, cousins, teachers…">
          <Input data-testid="gift-name" value={name} onChange={(e) => { setName(e.target.value); if (e.target.value) setPerson([]); }} maxLength={60} className="h-11" placeholder="Auntie Sue" />
        </Field>
        <Field label="Occasion">
          <div className="flex flex-wrap gap-2">
            {(["birthday", "christmas", "other"] as const).map((o) => <Chip key={o} on={occasion === o} onClick={() => setOccasion(o)}>{OCCASION_LABEL[o]}</Chip>)}
          </div>
        </Field>
        <Field label="Budget"><Input data-testid="gift-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0.00" className="h-11" /></Field>
      </div>
    </Sheet>
  );
}

function EditGift({ value, name, onClose }: { value: GiftBudget | null; name: string; onClose: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [budget, setBudget] = useState("");
  useEffect(() => { if (value) setBudget(String(value.budget)); }, [value]);
  const b = parseAmount(budget);
  async function save() {
    if (!value || b == null || b < 0) return;
    const { error } = await supabase.from("money_gift_budgets").update({ budget: b }).eq("id", value.id);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshMoney(qc, family.id);
    onClose();
  }
  return (
    <Sheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={`Budget for ${name}`}
      footer={
        <>
          <Button className="h-11 flex-1 rounded-full text-base font-semibold" disabled={b == null || b < 0} onClick={() => void save()}>Save</Button>
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={onClose}><X className="size-4" /> Cancel</Button>
        </>
      }
    >
      <Field label="Budget"><Input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className="h-11" data-autofocus /></Field>
    </Sheet>
  );
}
