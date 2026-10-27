// Add or change one payment: amount, in or out, category, who paid. Everything else is under "More".
import { useQueryClient } from "@tanstack/react-query";
import { Camera, ChevronDown, ChevronUp, Loader2, Lock, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { fitJpeg } from "@/lib/image";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Field, PeoplePicker, Sheet } from "@/modules/calendar/ui";

import {
  BUCKET, CURRENCIES, money, rateToGbp, refreshMoney, todayIn, uploadReceipt, useAccounts, useBills, useCategories, useGiftBudgets,
  usePayeeRules, usePots, useReceiptUrls, type Payment,
} from "./data";
import { addPayment, type PaymentDraft } from "./outbox";

const SELECT = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
const OCCASION: Record<string, string> = { birthday: "Birthday", christmas: "Christmas", other: "Other" };

/** "12.50" from what was typed ("£12.50", "1,200") or NaN */
export function readAmount(s: string): number {
  const t = s.replace(/[£,\s]/g, "");
  if (!/^\d*\.?\d{0,2}$/.test(t) || !t || t === ".") return NaN;
  return Math.round(Number(t) * 100) / 100;
}

/** Remember "this payee goes in this category" (only for new payees, or when the category changes) */
export async function rememberPayee(familyId: string, payee: string, categoryId: string | null, rules: { id: string; match: string; category_id: string }[]) {
  const match = payee.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 60);
  if (!categoryId || match.length < 2) return;
  const found = rules.find((r) => r.match === match);
  if (found) {
    if (found.category_id !== categoryId) await supabase.from("money_payee_rules").update({ category_id: categoryId }).eq("id", found.id);
    return;
  }
  await supabase.from("money_payee_rules").insert({ family_id: familyId, match, category_id: categoryId });
}

/** Add or change one payment (owned by the Payments screen; also opened from This month and Bills). */
export function PaymentSheet({ open, onOpenChange, payment, preset }: { open: boolean; onOpenChange: (o: boolean) => void; payment?: Payment | null; preset?: Partial<PaymentDraft> }) {
  const { family, me, members } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const cats = useCategories().data ?? [];
  const accounts = useAccounts().data ?? [];
  const bills = useBills().data ?? [];
  const pots = usePots().data?.pots ?? [];
  const rules = usePayeeRules().data ?? [];
  const parents = members.filter((m) => m.role === "parent" && !m.archived_at);
  const children = members.filter((m) => m.role === "child" && !m.archived_at);

  const existing = payment ?? null;
  const fromFood = existing?.source === "food";
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [day, setDay] = useState(today);
  const [payee, setPayee] = useState("");
  const [note, setNote] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [rate, setRate] = useState<number | null | "loading">(1);
  const [gbpTyped, setGbpTyped] = useState("");
  const [inBudget, setInBudget] = useState(true);
  const [childId, setChildId] = useState<string | null>(null);
  const [giftId, setGiftId] = useState<string | null>(null);
  const [potId, setPotId] = useState<string | null>(null);
  const [billId, setBillId] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  const [receipt, setReceipt] = useState<Blob | null>(null);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const year = Number(day.slice(0, 4)) || Number(today.slice(0, 4));
  const gifts = useGiftBudgets(year).data ?? [];
  const receiptUrl = useReceiptUrls([receiptPath]).data?.get(receiptPath ?? "");
  const localUrl = useMemo(() => (receipt ? URL.createObjectURL(receipt) : null), [receipt]);
  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);

  // fill the form each time it opens
  useEffect(() => {
    if (!open) return;
    const p = existing ?? preset ?? {};
    setDirection((p.direction as "out" | "in" | undefined) ?? "out");
    setAmount(p.amount != null ? String(Number(p.amount)) : "");
    setCategoryId(p.category_id ?? null);
    setPaidBy(existing ? existing.paid_by : (p.paid_by ?? me.id));
    setAccountId(p.account_id ?? null);
    setDay(p.on_date ?? today);
    setPayee(p.payee ?? "");
    setNote(p.note ?? "");
    setCurrency(p.currency ?? "GBP");
    setRate(1);
    setGbpTyped(p.currency && p.currency !== "GBP" && p.amount_gbp != null ? String(Number(p.amount_gbp)) : "");
    setInBudget(p.in_budget ?? true);
    setChildId(p.child_id ?? null);
    setGiftId(p.gift_budget_id ?? null);
    setPotId(p.pot_id ?? null);
    setBillId(p.bill_id ?? null);
    setMine(!!p.private_to);
    setReceipt(null);
    setReceiptPath(existing?.receipt_path ?? null);
    setMore(!!(existing && (existing.currency !== "GBP" || !existing.in_budget || existing.child_id || existing.gift_budget_id || existing.pot_id || existing.bill_id || existing.receipt_path)));
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.id]);

  // today's rate for a foreign amount
  useEffect(() => {
    if (currency === "GBP") { setRate(1); return; }
    let live = true;
    setRate("loading");
    void rateToGbp(currency).then((r) => { if (live) setRate(r); });
    return () => { live = false; };
  }, [currency]);

  const account = accounts.find((a) => a.id === accountId) ?? null;
  const bill = bills.find((b) => b.id === billId) ?? null;
  const pot = pots.find((p) => p.id === potId) ?? null;
  // anything on a private account, bill or pot is private to its owner
  const forcedPrivate = account?.private_to ?? bill?.private_to ?? pot?.private_to ?? null;
  const privateTo = forcedPrivate ?? (mine ? me.id : null);
  // Food's shop totals are always shared
  const canChangePrivacy = !fromFood && (!existing || existing.created_by === me.id);
  const visibleCats = cats.filter((c) => c.direction === direction && (!c.archived_at || c.id === categoryId));

  const n = readAmount(amount);
  const typedGbp = readAmount(gbpTyped);
  const gbp = currency === "GBP" ? n : typeof rate === "number" ? Math.round(n * rate * 100) / 100 : typedGbp;
  const ok = Number.isFinite(n) && n > 0 && n < 1e9 && !!day && Number.isFinite(gbp) && gbp >= 0;

  function pickAccount(id: string | null) {
    setAccountId(id);
    const a = accounts.find((x) => x.id === id);
    if (a && a.currency !== currency && !existing) setCurrency(a.currency);
  }

  /** a private payment's receipt lives in the owner's own folder: move it when the payment changes sides */
  async function placeReceipt(): Promise<string | null> {
    const folder = `${family.id}/money/${privateTo ? `p/${privateTo}` : "s"}/`;
    if (receipt) return uploadReceipt(family.id, receipt, privateTo);
    if (receiptPath && !receiptPath.startsWith(folder)) {
      const { data, error } = await supabase.storage.from(BUCKET).download(receiptPath);
      if (error || !data) throw new Error("Couldn't move the receipt. Try again");
      return uploadReceipt(family.id, data, privateTo);
    }
    return receiptPath;
  }

  async function save() {
    if (!ok || busy) return;
    setBusy(true);
    try {
      let path = receiptPath;
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      if (offline && receipt) toast("The receipt photo needs a signal. Add it again later");
      else path = await placeReceipt();
      const row = {
        direction,
        amount: n,
        currency,
        amount_gbp: gbp,
        on_date: day,
        payee: payee.trim().slice(0, 120),
        note: note.trim().slice(0, 300),
        category_id: categoryId,
        paid_by: paidBy,
        account_id: accountId,
        in_budget: inBudget,
        child_id: childId,
        gift_budget_id: giftId,
        pot_id: potId,
        bill_id: billId,
        receipt_path: offline && receipt ? receiptPath : path,
        private_to: privateTo,
      };
      if (existing) {
        const upd = fromFood ? { ...row, amount: undefined, amount_gbp: undefined, on_date: undefined, currency: undefined } : row;
        const { error } = await supabase.from("money_payments").update(upd).eq("id", existing.id);
        if (error) throw error;
        if (path !== existing.receipt_path && existing.receipt_path) void supabase.storage.from(BUCKET).remove([existing.receipt_path]);
        toast.success("Saved");
      } else {
        const res = await addPayment({ ...row, family_id: family.id });
        if (res === "waiting") toast("Saved — it will send when you have a signal");
        else toast.success(direction === "out" ? `${money(gbp)} out saved` : `${money(gbp)} in saved`);
      }
      if (row.payee && categoryId) void rememberPayee(family.id, row.payee, categoryId, rules).catch(() => undefined);
      await refreshMoney(qc, family.id);
      onOpenChange(false);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    const { error } = await supabase.from("money_payments").update({ deleted_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) { toast.error(friendlyError(error)); return; }
    await refreshMoney(qc, family.id);
    onOpenChange(false);
    toast("Payment removed", {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: async () => {
          const r = await supabase.from("money_payments").update({ deleted_at: null }).eq("id", existing.id);
          if (r.error) toast.error(friendlyError(r.error));
          await refreshMoney(qc, family.id);
        },
      },
    });
  }

  const giftLabel = (g: (typeof gifts)[number]) =>
    `${g.person ? members.find((m) => m.id === g.person)?.display_name ?? "Someone" : g.person_name} · ${OCCASION[g.occasion]} ${g.year} (${money(g.budget, true)})`;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={existing ? "Change payment" : "Add a payment"}
      footer={
        <>
          <Button data-testid="payment-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={!ok || busy} onClick={() => void save()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Save
          </Button>
          {existing && !fromFood ? (
            <Button data-testid="payment-delete" variant="ghost" size="icon" className="size-12 rounded-full" onClick={() => void remove()} aria-label="Remove this payment"><Trash2 className="size-5" /></Button>
          ) : null}
          <Button variant="outline" className="h-12 rounded-full px-5" onClick={() => onOpenChange(false)}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Money out or in">
          {(["out", "in"] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={direction === d}
              data-testid={`payment-${d}`}
              disabled={fromFood}
              onClick={() => { setDirection(d); setCategoryId(null); }}
              className={cn(
                "h-11 rounded-full border text-base font-semibold transition disabled:opacity-60",
                direction === d ? (d === "out" ? "border-transparent bg-[var(--status-red-soft)] text-[var(--status-red)]" : "border-transparent bg-[var(--status-green-soft)] text-[var(--status-green)]") : "border-[var(--surface-border)] bg-[var(--surface)]",
              )}
            >
              {d === "out" ? "Money out" : "Money in"}
            </button>
          ))}
        </div>

        <div>
          <label className="flex items-center gap-2 rounded-2xl border border-input bg-background px-4">
            <span className="text-3xl font-bold text-muted-foreground">{currency === "GBP" ? "£" : currency}</span>
            <input
              data-testid="payment-amount"
              data-autofocus={existing ? undefined : true}
              inputMode="decimal"
              aria-label="How much"
              placeholder="0.00"
              value={amount}
              disabled={fromFood}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
              className="h-16 w-full min-w-0 bg-transparent text-4xl font-bold tabular-nums outline-none disabled:opacity-60"
            />
          </label>
          {fromFood ? <p className="mt-1 text-xs text-muted-foreground">This came from Food. Change the amount and date in Food's budget.</p> : null}
          {currency !== "GBP" && Number.isFinite(n) && n > 0 ? (
            rate === "loading" ? <p className="mt-1 text-xs text-muted-foreground">Finding today's rate…</p>
              : typeof rate === "number" ? <p className="mt-1 text-sm font-semibold" data-testid="payment-gbp">About {money(gbp)}</p>
                : (
                  <Field label="No rate without a signal. How much in pounds?">
                    <Input data-testid="payment-gbp-typed" inputMode="decimal" className="h-11 w-40" value={gbpTyped} onChange={(e) => setGbpTyped(e.target.value)} placeholder="0.00" />
                  </Field>
                )
          ) : null}
        </div>

        <Field label="What for">
          <div className="flex flex-wrap gap-1.5">
            {visibleCats.map((c) => (
              <Chip key={c.id} on={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)} className="min-h-10">
                <span data-testid={`payment-cat-${c.name}`} className="contents">{c.emoji ? <span aria-hidden>{c.emoji}</span> : null}{c.name}</span>
              </Chip>
            ))}
          </div>
        </Field>

        {parents.length > 1 ? (
          <Field label={direction === "out" ? "Who paid" : "Whose money"}>
            <PeoplePicker members={parents} value={paidBy ? [paidBy] : []} onChange={(ids) => setPaidBy(ids[0] ?? null)} single />
          </Field>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={direction === "out" ? "Paid to (optional)" : "From (optional)"}>
            <Input data-testid="payment-payee" className="h-11" value={payee} maxLength={120} onChange={(e) => setPayee(e.target.value)} placeholder={direction === "out" ? "Tesco" : "Work"} />
          </Field>
          <Field label="Date">
            <Input data-testid="payment-date" type="date" className="h-11" value={day} disabled={fromFood} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label="Account">
            <select data-testid="payment-account" className={SELECT} value={accountId ?? ""} onChange={(e) => pickAccount(e.target.value || null)}>
              <option value="">Not set</option>
              {accounts.filter((a) => !fromFood || !a.private_to).map((a) => <option key={a.id} value={a.id}>{a.private_to ? "🔒 " : ""}{a.name}</option>)}
            </select>
          </Field>
          <Field label="Note (optional)">
            <Input data-testid="payment-note" className="h-11" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>

        {canChangePrivacy ? (
          <label className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] p-3">
            <Lock className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-semibold">Just mine</span>
              <span className="text-xs text-muted-foreground">{forcedPrivate ? "Private because of its account, bill or pot" : "Only you will see this payment"}</span>
            </span>
            <Switch data-testid="payment-mine" checked={!!privateTo} disabled={!!forcedPrivate} onCheckedChange={setMine} />
          </label>
        ) : privateTo ? (
          <p className="flex items-center gap-2 text-sm"><Lock className="size-4" /> Just yours</p>
        ) : null}

        <button type="button" data-testid="payment-more" onClick={() => setMore(!more)} className="flex min-h-11 w-full items-center justify-between rounded-2xl px-1 text-sm font-semibold">
          More {more ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        {more ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency">
                <select data-testid="payment-currency" className={SELECT} value={currency} disabled={fromFood} onChange={(e) => setCurrency(e.target.value)}>
                  {(CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              {children.length ? (
                <Field label="For a child (optional)">
                  <select data-testid="payment-child" className={SELECT} value={childId ?? ""} onChange={(e) => setChildId(e.target.value || null)}>
                    <option value="">No</option>
                    {children.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                  </select>
                </Field>
              ) : null}
              {direction === "out" && gifts.length ? (
                <Field label="Gift budget (optional)">
                  <select data-testid="payment-gift" className={SELECT} value={giftId ?? ""} onChange={(e) => setGiftId(e.target.value || null)}>
                    <option value="">No</option>
                    {gifts.map((g) => <option key={g.id} value={g.id}>{giftLabel(g)}</option>)}
                  </select>
                </Field>
              ) : null}
              {pots.length ? (
                <Field label="Pot (optional)">
                  <select data-testid="payment-pot" className={SELECT} value={potId ?? ""} onChange={(e) => setPotId(e.target.value || null)}>
                    <option value="">No</option>
                    {pots.filter((p) => !fromFood || !p.private_to).map((p) => <option key={p.id} value={p.id}>{p.private_to ? "🔒 " : ""}{p.emoji ? `${p.emoji} ` : ""}{p.name}</option>)}
                  </select>
                </Field>
              ) : null}
              {direction === "out" && bills.length ? (
                <Field label="Pays a bill (optional)" hint={billId && !existing?.bill_id ? "The bill moves on to its next date" : undefined}>
                  <select data-testid="payment-bill" className={SELECT} value={billId ?? ""} onChange={(e) => setBillId(e.target.value || null)}>
                    <option value="">No</option>
                    {bills.filter((b) => !fromFood || !b.private_to).map((b) => <option key={b.id} value={b.id}>{b.private_to ? "🔒 " : ""}{b.name} ({money(b.amount)})</option>)}
                  </select>
                </Field>
              ) : null}
            </div>

            <label className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] p-3">
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-semibold">Not in the budget</span>
                <span className="text-xs text-muted-foreground">For moving money between accounts, refunds and one-offs</span>
              </span>
              <Switch data-testid="payment-not-in-budget" checked={!inBudget} onCheckedChange={(v) => setInBudget(!v)} />
            </label>

            <Field label="Receipt (optional)">
              <input ref={fileRef} data-testid="payment-receipt" type="file" accept="image/*" capture="environment" className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try { setReceipt(await fitJpeg(f, 1600)); } catch (err) { toast.error(friendlyError(err)); }
                }} />
              {localUrl || receiptUrl ? (
                <div className="relative inline-block">
                  <img src={localUrl ?? receiptUrl} alt="Receipt" className="max-h-40 rounded-xl border object-contain" />
                  <Button variant="secondary" size="icon" className="absolute right-1 top-1 size-9 rounded-full" aria-label="Remove the receipt"
                    onClick={() => { setReceipt(null); setReceiptPath(null); }}><X className="size-4" /></Button>
                </div>
              ) : (
                <Button variant="outline" className="h-11 rounded-full" onClick={() => fileRef.current?.click()}><Camera className="size-4" /> Add a photo</Button>
              )}
            </Field>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
