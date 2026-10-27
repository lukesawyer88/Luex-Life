// Money settings: the budget period, the weekly summary, accounts, categories and remembered payees.
import { useQueryClient } from "@tanstack/react-query";
import { Archive, FileSpreadsheet, Lock, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useExtra } from "@/lib/extras";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Field, Sheet } from "@/modules/calendar/ui";

import {
  ACCOUNT_KIND_LABEL, CURRENCIES, errMsg, fetchPayments, refreshMoney, todayIn,
  useAccounts, useBills, useCategories, useMoneySettings, usePayeeRules,
  type Account, type Category,
} from "./data";
import { paymentsCsv } from "./report-export";

const select = "h-11 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm";

export function MoneySettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  // remembered payees are part of the detailed reports extra (Settings, More features)
  const payeesOn = useExtra("money.reports");
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Money settings" description="Only parents can see Money." wide>
      <div className="space-y-7">
        <PeriodSection />
        <AccountsSection />
        <CategoriesSection />
        {payeesOn ? <PayeesSection /> : null}
        <DownloadSection />
      </div>
    </Sheet>
  );
}

function useRun() {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function run(p: PromiseLike<{ error: unknown }>, done?: string): Promise<boolean> {
    setBusy(true);
    try {
      const { error } = await p;
      if (error) throw error;
      if (done) toast(done);
      void refreshMoney(qc, family.id);
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

// ---------------------------------------------------------------- period and summary

function PeriodSection() {
  const fourOn = useExtra("money.fourweekly");
  const { family } = useFamilyState();
  const s = useMoneySettings().data;
  const { busy, run } = useRun();
  const [kind, setKind] = useState<"month" | "payday" | "four">("month");
  const [day, setDay] = useState("25");
  const [anchor, setAnchor] = useState(todayIn(family.timezone));
  useEffect(() => {
    if (!s) return;
    setKind(s.period === "month" ? "month" : s.four_weekly_anchor ? "four" : "payday");
    if (s.payday_day) setDay(String(s.payday_day));
    if (s.four_weekly_anchor) setAnchor(s.four_weekly_anchor);
  }, [s]);
  if (!s) return null;
  const d = Number(day);
  const ok = kind !== "payday" || (Number.isInteger(d) && d >= 1 && d <= 31);
  const changed = kind === "month" ? s.period !== "month" : kind === "payday" ? s.period !== "payday" || s.payday_day !== d || !!s.four_weekly_anchor : s.period !== "payday" || s.four_weekly_anchor !== anchor;

  function save() {
    const patch = kind === "month" ? { period: "month" as const }
      : kind === "payday" ? { period: "payday" as const, payday_day: d, four_weekly_anchor: null }
      : { period: "payday" as const, four_weekly_anchor: anchor, payday_day: null };
    void run(supabase.from("money_settings").update(patch).eq("family_id", family.id), "Saved");
  }

  return (
    <section>
      <h3 className="text-base font-bold">When does your month start?</h3>
      <p className="mb-3 text-sm text-muted-foreground">Budgets run from this day to the day before the next one.</p>
      <div className="flex flex-wrap gap-1.5">
        <Chip on={kind === "month"} onClick={() => setKind("month")}>On the 1st</Chip>
        <Chip on={kind === "payday"} onClick={() => setKind("payday")}>On payday</Chip>
        {fourOn || kind === "four" ? <Chip on={kind === "four"} onClick={() => setKind("four")}>Paid every 4 weeks</Chip> : null}
      </div>
      {kind === "payday" ? (
        <div className="mt-3"><Field label="Payday (day of the month)" hint="If the month is shorter, the last day is used."><Input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} className="h-11 w-24" data-testid="settings-payday" /></Field></div>
      ) : null}
      {kind === "four" ? (
        <div className="mt-3"><Field label="A recent payday"><Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="h-11 w-48" /></Field></div>
      ) : null}
      {changed ? <Button className="mt-3 h-11 rounded-full px-5" disabled={!ok || busy} onClick={save} data-testid="settings-period-save">Save</Button> : null}

      <label className="mt-4 flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--surface)] px-3">
        <span className="flex-1">
          <span className="block font-medium">Monday money summary</span>
          <span className="block text-xs text-muted-foreground">What's left and the bills due that week, sent to each parent.</span>
        </span>
        <Switch checked={s.weekly_summary} disabled={busy} onCheckedChange={(v) => void run(supabase.from("money_settings").update({ weekly_summary: v }).eq("family_id", family.id))} data-testid="settings-summary" />
      </label>
    </section>
  );
}

// ---------------------------------------------------------------- accounts

function AccountsSection() {
  const accounts = useAccounts().data ?? [];
  const [open, setOpen] = useState<string | "new" | null>(null);
  return (
    <section>
      <div className="mb-1 flex items-center gap-2">
        <h3 className="flex-1 text-base font-bold">Accounts</h3>
        <Button variant="ghost" className="h-10 rounded-full" onClick={() => setOpen(open === "new" ? null : "new")} data-testid="settings-account-add"><Plus className="size-4" /> Add an account</Button>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">Bank accounts, cards and cash. These are only labels: Luex never connects to your bank.</p>
      {open === "new" ? <AccountEditor onDone={() => setOpen(null)} /> : null}
      <ul className="space-y-2">
        {accounts.map((a) => (
          <li key={a.id} className="rounded-2xl bg-[var(--surface)]">
            <button type="button" className="flex min-h-12 w-full items-center gap-2 px-3 text-left" onClick={() => setOpen(open === a.id ? null : a.id)} data-testid={`settings-account-${a.name}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{a.name}</span>
                <span className="block text-xs text-muted-foreground">{ACCOUNT_KIND_LABEL[a.kind]}{a.currency !== "GBP" ? ` · ${a.currency}` : ""}</span>
              </span>
              {a.private_to ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="size-3.5" /> Only you can see this</span> : null}
            </button>
            {open === a.id ? <div className="px-3 pb-3"><AccountEditor a={a} onDone={() => setOpen(null)} /></div> : null}
          </li>
        ))}
        {!accounts.length && open !== "new" ? <li className="text-sm text-muted-foreground">No accounts yet. You can add payments without one.</li> : null}
      </ul>
    </section>
  );
}

function AccountEditor({ a, onDone }: { a?: Account; onDone: () => void }) {
  const { family, members, me } = useFamilyState();
  const { busy, run } = useRun();
  const [name, setName] = useState(a?.name ?? "");
  const [kind, setKind] = useState<Account["kind"]>(a?.kind ?? "current");
  const currencyOn = useExtra("money.currency");
  const [currency, setCurrency] = useState(a?.currency ?? "GBP");
  const [opening, setOpening] = useState(a ? String(Number(a.opening_balance)) : "");
  const [owner, setOwner] = useState<string>(a?.owner ?? "");
  const [mine, setMine] = useState(!!a?.private_to);
  const parents = members.filter((m) => m.role === "parent" && !m.archived_at);
  const bal = opening.trim() === "" ? 0 : Number(opening.replace(/[£,\s]/g, ""));
  const ok = name.trim().length > 0 && Number.isFinite(bal);
  const priv = kind !== "joint" && mine ? me.id : null;

  async function save() {
    const row = { name: name.trim().slice(0, 60), kind, currency, opening_balance: Math.round(bal * 100) / 100, owner: kind === "joint" ? null : owner || null, private_to: priv };
    const okay = await run(a ? supabase.from("money_accounts").update(row).eq("id", a.id) : supabase.from("money_accounts").insert({ ...row, family_id: family.id }), "Saved");
    if (okay) onDone();
  }
  async function archive() {
    if (!a) return;
    if (await run(supabase.from("money_accounts").update({ archived_at: new Date().toISOString() }).eq("id", a.id), `${a.name} put away. Its payments stay.`)) onDone();
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--surface-border)] bg-background p-3">
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Joint account" maxLength={60} className="h-11" data-testid="settings-account-name" /></Field>
      <Field label="Kind">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(ACCOUNT_KIND_LABEL) as Account["kind"][]).map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{ACCOUNT_KIND_LABEL[k]}</Chip>)}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {currencyOn || currency !== "GBP" ? (
          <Field label="Currency">
            <select className={select} value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
        ) : null}
        <Field label="Starting balance"><Input inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" className="h-11" /></Field>
      </div>
      {kind !== "joint" ? (
        <Field label="Whose account">
          <select className={select} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Shared</option>
            {parents.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </select>
        </Field>
      ) : null}
      {kind !== "joint" ? (
        <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--surface)] px-3">
          <Lock className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">
            <span className="block font-medium">Just mine</span>
            <span className="block text-xs text-muted-foreground">Only you will see this account and everything on it.</span>
          </span>
          <Switch checked={mine} onCheckedChange={setMine} data-testid="settings-account-mine" />
        </label>
      ) : <p className="text-xs text-muted-foreground">A joint account is always shared by both parents.</p>}
      <div className="flex flex-wrap gap-2">
        <Button className="h-11 flex-1 rounded-full font-semibold" disabled={!ok || busy} onClick={() => void save()} data-testid="settings-account-save">Save</Button>
        {a ? <Button variant="outline" className="h-11 rounded-full" disabled={busy} onClick={() => void archive()}><Archive className="size-4" /> Put away</Button> : null}
        <Button variant="ghost" className="h-11 rounded-full" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- categories

function CategoriesSection() {
  const cats = useCategories().data ?? [];
  const [dir, setDir] = useState<"out" | "in">("out");
  const [showHidden, setShowHidden] = useState(false);
  const list = cats.filter((c) => c.direction === dir);
  const live = list.filter((c) => !c.archived_at);
  const hidden = list.filter((c) => c.archived_at);
  return (
    <section>
      <h3 className="text-base font-bold">Categories</h3>
      <p className="mb-3 text-sm text-muted-foreground">Rename, add or hide them. "Carry over" moves what's left unspent into next month.</p>
      <div className="mb-2 flex gap-1.5">
        <Chip on={dir === "out"} onClick={() => setDir("out")}>Money out</Chip>
        <Chip on={dir === "in"} onClick={() => setDir("in")}>Money in</Chip>
      </div>
      <ul className="space-y-1.5">
        {live.map((c) => <CategoryRow key={c.id} c={c} />)}
      </ul>
      <AddCategory dir={dir} />
      {hidden.length ? (
        <div className="mt-3">
          <button type="button" className="text-sm font-semibold underline-offset-2 hover:underline" onClick={() => setShowHidden(!showHidden)}>{showHidden ? "Hide" : "Show"} hidden categories ({hidden.length})</button>
          {showHidden ? <ul className="mt-2 space-y-1.5">{hidden.map((c) => <CategoryRow key={c.id} c={c} />)}</ul> : null}
        </div>
      ) : null}
    </section>
  );
}

function CategoryRow({ c }: { c: Category }) {
  const carryOn = useExtra("money.carry");
  const { busy, run } = useRun();
  const [name, setName] = useState(c.name);
  const [emoji, setEmoji] = useState(c.emoji ?? "");
  useEffect(() => { setName(c.name); setEmoji(c.emoji ?? ""); }, [c.name, c.emoji]);
  const saveText = () => {
    const n = name.trim().slice(0, 40);
    const e = emoji.trim().slice(0, 16) || null;
    if (!n) { setName(c.name); return; }
    if (n === c.name && e === (c.emoji ?? null)) return;
    void run(supabase.from("money_categories").update({ name: n, emoji: e }).eq("id", c.id));
  };
  return (
    <li className={cn("flex min-h-12 items-center gap-2 rounded-2xl bg-[var(--surface)] px-2", c.archived_at && "opacity-60")} data-testid={`settings-cat-${c.name}`}>
      <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} onBlur={saveText} className="h-10 w-12 px-1 text-center" aria-label={`Picture for ${c.name}`} />
      <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveText} maxLength={40} className="h-10 min-w-0 flex-1" aria-label="Category name" />
      {carryOn && c.direction === "out" && !c.archived_at ? (
        <label className="flex shrink-0 items-center gap-1.5 text-xs">
          <span className="hidden sm:inline">Carry over</span>
          <Switch checked={c.carry_over} disabled={busy} onCheckedChange={(v) => void run(supabase.from("money_categories").update({ carry_over: v }).eq("id", c.id))} aria-label={`Carry over ${c.name}`} />
        </label>
      ) : null}
      {c.archived_at ? (
        <Button variant="ghost" size="icon" className="size-10 rounded-full" disabled={busy} onClick={() => void run(supabase.from("money_categories").update({ archived_at: null }).eq("id", c.id), `${c.name} is back`)} aria-label={`Bring back ${c.name}`}><RotateCcw className="size-4" /></Button>
      ) : (
        <Button variant="ghost" size="icon" className="size-10 rounded-full" disabled={busy} onClick={() => void run(supabase.from("money_categories").update({ archived_at: new Date().toISOString() }).eq("id", c.id), `${c.name} hidden. Past payments keep it.`)} aria-label={`Hide ${c.name}`}><Archive className="size-4" /></Button>
      )}
    </li>
  );
}

function AddCategory({ dir }: { dir: "out" | "in" }) {
  const { family } = useFamilyState();
  const cats = useCategories().data ?? [];
  const { busy, run } = useRun();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  async function add() {
    const n = name.trim().slice(0, 40);
    if (!n) return;
    if (cats.some((c) => c.direction === dir && c.name.toLowerCase() === n.toLowerCase())) { toast.error("You already have that one"); return; }
    const pos = Math.max(0, ...cats.filter((c) => c.direction === dir).map((c) => c.position)) + 1;
    if (await run(supabase.from("money_categories").insert({ family_id: family.id, name: n, emoji: emoji.trim().slice(0, 16) || null, direction: dir, position: pos }))) { setName(""); setEmoji(""); }
  }
  return (
    <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
      <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🙂" className="h-11 w-12 px-1 text-center" aria-label="Picture" />
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={dir === "out" ? "New category, e.g. Swimming lessons" : "New category, e.g. Rent from lodger"} maxLength={40} className="h-11 min-w-0 flex-1" data-testid="settings-cat-new" />
      <Button type="submit" className="h-11 rounded-full" disabled={busy || !name.trim()} data-testid="settings-cat-add">Add</Button>
    </form>
  );
}

// ---------------------------------------------------------------- download everything

function DownloadSection() {
  const { family, members } = useFamilyState();
  const cats = useCategories().data ?? [];
  const accounts = useAccounts().data ?? [];
  const bills = useBills().data ?? [];
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const today = todayIn(family.timezone);
      const list = await fetchPayments(family.id, "2000-01-01", today);
      paymentsCsv(list, { cats, accounts, bills, members }, `Luex money to ${today}.csv`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3 className="text-base font-bold">Download</h3>
      <p className="mb-3 text-sm text-muted-foreground">Every payment you can see, as a spreadsheet.</p>
      <Button variant="outline" className="h-11 rounded-full" disabled={busy} onClick={() => void download()} data-testid="money-download-csv">
        <FileSpreadsheet className="size-4" /> {busy ? "Saving…" : "Download all payments (CSV)"}
      </Button>
    </section>
  );
}

// ---------------------------------------------------------------- remembered payees

function PayeesSection() {
  const rules = usePayeeRules().data ?? [];
  const cats = useCategories().data ?? [];
  const { busy, run } = useRun();
  const sorted = [...rules].sort((a, b) => a.match.localeCompare(b.match));
  return (
    <section>
      <h3 className="text-base font-bold">Remembered payees</h3>
      <p className="mb-3 text-sm text-muted-foreground">When you give a payee a category, Luex remembers it for next time.</p>
      {sorted.length ? (
        <ul className="space-y-1.5">
          {sorted.map((r) => (
            <li key={r.id} className="flex min-h-12 items-center gap-2 rounded-2xl bg-[var(--surface)] px-3" data-testid={`settings-payee-${r.match}`}>
              <span className="min-w-0 flex-1 truncate font-medium">{r.match}</span>
              <select className={cn(select, "w-auto max-w-[45%]")} value={r.category_id} disabled={busy} onChange={(e) => void run(supabase.from("money_payee_rules").update({ category_id: e.target.value }).eq("id", r.id))} aria-label={`Category for ${r.match}`}>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ""}{c.name}{c.archived_at ? " (hidden)" : ""}</option>)}
              </select>
              <Button variant="ghost" size="icon" className="size-10 rounded-full" disabled={busy} onClick={() => void run(supabase.from("money_payee_rules").delete().eq("id", r.id), `Forgot ${r.match}`)} aria-label={`Forget ${r.match}`}><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">Nothing remembered yet.</p>}
    </section>
  );
}
