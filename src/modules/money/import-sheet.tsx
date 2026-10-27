// Bring in a bank statement: pick the file, match the columns (once per bank), check every line, save.
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, FileUp, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Field, Sheet } from "@/modules/calendar/ui";

import {
  money, moneyIn, rateToGbp, refreshMoney, rows as fetchRows, shortDate, suggestCategory, useAccounts, useBills, useCategories, useImportProfiles,
  usePayeeRules, type ImportMapping, type ImportProfile, type Payment,
} from "./data";
import {
  applyMapping, csvSignature, findHeaderRow, guessMapping, importKeys, isOfx, looksSame, matchBill, normPayee, parseCsv, parseOfx,
  type StatementLine,
} from "./import-parse";

const SELECT = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
const MAX_LINES = 3000;
const NO_ACCOUNT = "none";

type Step = "file" | "columns" | "check";
type CheckLine = StatementLine & { key: string; keep: boolean; dup: "key" | "typed" | null; categoryId: string | null; suggested: string | null; inBudget: boolean; billId: string | null };

/** the words a payee rule should remember: no numbers or card details, first three words */
function ruleFor(payee: string): string {
  return normPayee(payee).replace(/\b\d+\b/g, "").replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join(" ").slice(0, 60);
}

export function ImportSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const accounts = useAccounts().data ?? [];
  const cats = useCategories().data ?? [];
  const bills = useBills().data ?? [];
  const rules = usePayeeRules().data ?? [];
  const profiles = useImportProfiles().data ?? [];
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("file");
  const [accountId, setAccountId] = useState<string>("");
  const [csv, setCsv] = useState<string[][] | null>(null);
  const [headerRow, setHeaderRow] = useState(-1);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [profile, setProfile] = useState<ImportProfile | null>(null);
  const [bankName, setBankName] = useState("");
  const [lines, setLines] = useState<CheckLine[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep("file"); setCsv(null); setMapping(null); setProfile(null); setLines([]); setSkipped(0); setBusy(false); setFileName("");
    setAccountId((a) => a || accounts[0]?.id || NO_ACCOUNT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const account = accounts.find((a) => a.id === accountId) ?? null;
  const signature = csv ? csvSignature(csv, headerRow) : "";
  const header = csv ? (headerRow >= 0 ? csv[headerRow] : (csv[0] ?? []).map((_, i) => `Column ${i + 1}`)) : [];
  const preview = useMemo(() => (csv && mapping ? applyMapping(csv, mapping) : null), [csv, mapping]);

  async function readFile(f: File) {
    if (f.size > 5_000_000) { toast.error("That file is too big. Try a shorter date range"); return; }
    setFileName(f.name);
    const text = await f.text();
    if (isOfx(text)) {
      const found = parseOfx(text);
      if (!found.length) { toast.error("Couldn't find any payments in that file"); return; }
      await toCheck(found, 0);
      return;
    }
    const r = parseCsv(text);
    if (r.length < 1) { toast.error("That file looks empty"); return; }
    const h = findHeaderRow(r);
    setCsv(r); setHeaderRow(h);
    const sig = csvSignature(r, h);
    const known = profiles.find((p) => p.signature === sig) ?? null;
    setProfile(known);
    setBankName(known?.name ?? "");
    const m = known ? { ...known.mapping, skipRows: h + 1 } : guessMapping(r, h);
    setMapping(m);
    if (known) {
      const res = applyMapping(r, m);
      if (res.lines.length) { await toCheck(res.lines, res.skipped); return; }
    }
    setStep("columns");
  }

  async function saveProfileAndCheck() {
    if (!csv || !mapping || !preview) return;
    if (!preview.lines.length) { toast.error("No payments found with those columns. Check the choices"); return; }
    setBusy(true);
    try {
      const name = (bankName.trim() || "Bank statement").slice(0, 60);
      const { skipRows: _skip, ...stored } = mapping;
      if (profile) await supabase.from("money_import_profiles").update({ name, mapping: stored }).eq("id", profile.id);
      else await supabase.from("money_import_profiles").insert({ family_id: family.id, name, signature, mapping: stored });
      void qc.invalidateQueries({ queryKey: ["money", family.id, "import-profiles"] });
      await toCheck(preview.lines, preview.skipped);
    } finally {
      setBusy(false);
    }
  }

  /** find what's already in Money and suggest categories and bills */
  async function toCheck(found: StatementLine[], skippedCount: number) {
    if (found.length > MAX_LINES) { toast.error(`That's more than ${MAX_LINES} lines. Try a shorter date range`); return; }
    setBusy(true);
    try {
      const keys = importKeys(found, accountId === NO_ACCOUNT ? "none" : accountId);
      const have = new Set<string>();
      for (let i = 0; i < keys.length; i += 100) {
        const got = await fetchRows<{ import_key: string }>(supabase.from("money_payments").select("import_key").eq("family_id", family.id).in("import_key", keys.slice(i, i + 100)));
        for (const g of got) have.add(g.import_key);
      }
      const dates = found.map((l) => l.date).sort();
      let typed: Payment[] = [];
      if (dates.length) {
        typed = await fetchRows<Payment>(
          supabase.from("money_payments").select("*").eq("family_id", family.id).is("deleted_at", null).neq("source", "import")
            .gte("on_date", dates[0]).lte("on_date", dates[dates.length - 1]).limit(5000),
        );
      }
      const usedTyped = new Set<string>();
      const usedBills = new Set<string>();
      const out: CheckLine[] = found.map((l, i) => {
        let dup: CheckLine["dup"] = have.has(keys[i]) ? "key" : null;
        if (!dup) {
          const t = typed.find((p) => !usedTyped.has(p.id) && (!accountId || accountId === NO_ACCOUNT || !p.account_id || p.account_id === accountId) && looksSame(l, p));
          if (t) { usedTyped.add(t.id); dup = "typed"; }
        }
        const b = dup ? null : matchBill(l, bills.filter((x) => !usedBills.has(x.id)));
        if (b) usedBills.add(b.id);
        const dirCats = cats.filter((c) => c.direction === (l.amount < 0 ? "out" : "in"));
        let suggested = suggestCategory(l.payee, rules);
        if (suggested && !dirCats.some((c) => c.id === suggested)) suggested = null;
        if (!suggested && b?.category_id) suggested = b.category_id;
        return { ...l, key: keys[i], keep: !dup, dup, categoryId: suggested, suggested, inBudget: true, billId: b?.id ?? null };
      });
      setLines(out);
      setSkipped(skippedCount);
      setStep("check");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const keep = lines.filter((l) => l.keep);
  const dupCount = lines.filter((l) => l.dup).length;
  const outTotal = keep.filter((l) => l.amount < 0).reduce((n, l) => n - l.amount, 0);
  const inTotal = keep.filter((l) => l.amount > 0).reduce((n, l) => n + l.amount, 0);
  const currency = account?.currency ?? "GBP";

  async function save() {
    if (!keep.length || busy) return;
    setBusy(true);
    try {
      let rate = 1;
      if (currency !== "GBP") {
        const r = await rateToGbp(currency);
        if (!r) { toast.error("Couldn't get today's exchange rate. Try again with a signal"); return; }
        rate = r;
      }
      const acc = accountId === NO_ACCOUNT ? null : accountId;
      const payload = keep.map((l) => {
        const amt = Math.abs(l.amount);
        return {
          family_id: family.id, account_id: acc, category_id: l.categoryId, direction: l.amount < 0 ? "out" : "in",
          amount: amt, currency, amount_gbp: currency === "GBP" ? amt : Math.round(amt * rate * 100) / 100,
          on_date: l.date, payee: l.payee, in_budget: l.inBudget, bill_id: l.billId, source: "import", import_key: l.key,
        };
      });
      let saved = 0;
      for (let i = 0; i < payload.length; i += 100) {
        const batch = payload.slice(i, i + 100);
        const { error } = await supabase.from("money_payments").insert(batch);
        if (!error) { saved += batch.length; continue; }
        if (error.code !== "23505") throw error;
        // something in this batch is already there: save the rest one by one
        for (const row of batch) {
          const r = await supabase.from("money_payments").insert(row);
          if (!r.error) saved++;
          else if (r.error.code !== "23505") throw r.error;
        }
      }
      // remember the categories chosen for payees the family hasn't seen before (or changed)
      const learnt = new Map<string, string>();
      for (const l of keep) if (l.categoryId && l.categoryId !== l.suggested) { const m = ruleFor(l.payee); if (m.length >= 2) learnt.set(m, l.categoryId); }
      for (const [match, cat] of learnt) {
        const found = rules.find((r) => r.match === match);
        if (found) await supabase.from("money_payee_rules").update({ category_id: cat }).eq("id", found.id);
        else await supabase.from("money_payee_rules").insert({ family_id: family.id, match, category_id: cat });
      }
      await refreshMoney(qc, family.id);
      const already = keep.length - saved;
      toast.success(`${saved} payment${saved === 1 ? "" : "s"} saved${already ? ` (${already} already there)` : ""}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const set = (i: number, patch: Partial<CheckLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const colSelect = (value: number | null | undefined, onChange: (v: number | null) => void, testid: string, allowNone = false) => (
    <select data-testid={testid} className={SELECT} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}>
      {allowNone ? <option value="">None</option> : null}
      {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
    </select>
  );

  const footer = step === "file" ? (
    <Button variant="outline" className="ml-auto h-11 rounded-full px-5" onClick={() => onOpenChange(false)}>Cancel</Button>
  ) : step === "columns" ? (
    <>
      <Button data-testid="import-columns-next" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !preview?.lines.length} onClick={() => void saveProfileAndCheck()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null} Next: check the payments
      </Button>
      <Button variant="outline" className="h-12 rounded-full px-5" onClick={() => setStep("file")}>Back</Button>
    </>
  ) : (
    <>
      <Button data-testid="import-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !keep.length} onClick={() => void save()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null} Save {keep.length} payment{keep.length === 1 ? "" : "s"}
      </Button>
      <Button variant="outline" className="h-12 rounded-full px-5" onClick={() => setStep(csv ? "columns" : "file")}>Back</Button>
    </>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={step === "file" ? "Bring in a bank statement" : step === "columns" ? "Which column is which?" : "Check the payments"}
      description={step === "file" ? "Download a statement from your bank's website (CSV or OFX) and pick it here. Nothing is shared with anyone." : step === "columns" ? "Only needed the first time for each bank. Luex remembers it." : `${fileName}${dupCount ? ` · ${dupCount} already in Money (left unticked)` : ""}${skipped ? ` · ${skipped} lines skipped` : ""}`}
      footer={footer}
    >
      {step === "file" ? (
        <div className="space-y-4">
          <Field label="Which account is it for?">
            <select data-testid="import-account" className={SELECT} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.private_to ? "🔒 " : ""}{a.name}</option>)}
              <option value={NO_ACCOUNT}>Not an account in Luex</option>
            </select>
          </Field>
          <input ref={fileRef} data-testid="import-file" type="file" accept=".csv,.ofx,.qfx,text/csv,application/x-ofx" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void readFile(f).catch((err) => toast.error(friendlyError(err))); }} />
          <Button data-testid="import-pick" className="h-14 w-full rounded-2xl text-base font-semibold" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <FileUp className="size-5" />} Pick the statement file
          </Button>
          <p className="text-sm text-muted-foreground">Payments already in Money are spotted and left out, so it's safe to bring in the same dates twice.</p>
        </div>
      ) : null}

      {step === "columns" && mapping ? (
        <div className="space-y-4">
          <Field label="Which bank is this?">
            <Input data-testid="import-bank" className="h-11" value={bankName} maxLength={60} onChange={(e) => setBankName(e.target.value)} placeholder="Nationwide" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date">{colSelect(mapping.date, (v) => setMapping({ ...mapping, date: v ?? 0 }), "import-col-date")}</Field>
            <Field label="Dates are written">
              <select data-testid="import-date-format" className={SELECT} value={mapping.dateFormat} onChange={(e) => setMapping({ ...mapping, dateFormat: e.target.value as ImportMapping["dateFormat"] })}>
                <option value="dmy">Day, month, year (31/01/2026)</option>
                <option value="mdy">Month, day, year (01/31/2026)</option>
                <option value="ymd">Year, month, day (2026-01-31)</option>
              </select>
            </Field>
            <Field label="Who it was paid to or from">{colSelect(mapping.payee, (v) => setMapping({ ...mapping, payee: v ?? 0 }), "import-col-payee")}</Field>
            <Field label="Amounts are in">
              <select data-testid="import-amount-style" className={SELECT} value={mapping.amount != null ? "one" : "two"}
                onChange={(e) => setMapping(e.target.value === "one"
                  ? { ...mapping, amount: mapping.out ?? mapping.in ?? 0, out: null, in: null }
                  : { ...mapping, amount: null, out: mapping.amount ?? 0, in: mapping.amount ?? 0 })}>
                <option value="one">One column</option>
                <option value="two">Two columns (money out, money in)</option>
              </select>
            </Field>
            {mapping.amount != null ? (
              <>
                <Field label="Amount">{colSelect(mapping.amount, (v) => setMapping({ ...mapping, amount: v ?? 0 }), "import-col-amount")}</Field>
                <Field label="Money out is shown as">
                  <select data-testid="import-out-sign" className={SELECT} value={mapping.outIsPositive ? "plus" : "minus"} onChange={(e) => setMapping({ ...mapping, outIsPositive: e.target.value === "plus" })}>
                    <option value="minus">A minus number (-12.50)</option>
                    <option value="plus">A plain number (12.50)</option>
                  </select>
                </Field>
              </>
            ) : (
              <>
                <Field label="Money out">{colSelect(mapping.out, (v) => setMapping({ ...mapping, out: v }), "import-col-out", true)}</Field>
                <Field label="Money in">{colSelect(mapping.in, (v) => setMapping({ ...mapping, in: v }), "import-col-in", true)}</Field>
              </>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold">How it looks {preview ? <span className="font-normal text-muted-foreground">· {preview.lines.length} payments found{preview.skipped ? `, ${preview.skipped} lines skipped` : ""}</span> : null}</h3>
            <ul className="space-y-1" data-testid="import-preview">
              {preview?.lines.slice(0, 4).map((l, i) => (
                <li key={i} className="glass-tile flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{shortDate(l.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{l.payee || "—"}</span>
                  <span className={cn("font-semibold tabular-nums", l.amount > 0 && "text-[var(--status-green)]")}>{l.amount > 0 ? "+" : ""}{moneyIn(Math.abs(l.amount), currency)}</span>
                </li>
              ))}
            </ul>
            {preview && !preview.lines.length ? <p className="mt-2 flex items-center gap-2 text-sm text-[var(--status-amber)]"><AlertTriangle className="size-4" /> No payments found. Try other columns or date style.</p> : null}
          </div>
        </div>
      ) : null}

      {step === "check" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="glass-tile p-3"><p className="text-xs text-muted-foreground">Money out</p><p className="text-xl font-bold tabular-nums">{moneyIn(outTotal, currency)}</p></div>
            <div className="glass-tile p-3"><p className="text-xs text-muted-foreground">Money in</p><p className="text-xl font-bold tabular-nums text-[var(--status-green)]">{moneyIn(inTotal, currency)}</p></div>
          </div>
          {profile && csv ? <button type="button" className="text-sm font-semibold underline" onClick={() => setStep("columns")}>Columns look wrong? Change them</button> : null}
          <ul className="space-y-1.5" data-testid="import-lines">
            {lines.map((l, i) => {
              const dirCats = cats.filter((c) => c.direction === (l.amount < 0 ? "out" : "in") && !c.archived_at);
              const bill = l.billId ? bills.find((b) => b.id === l.billId) : null;
              return (
                <li key={l.key} data-testid="import-line" className={cn("glass-tile px-3 py-2", !l.keep && "opacity-60")}>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" aria-label="Save this payment" data-testid="import-line-keep" className="size-5 shrink-0 accent-[var(--tile-active)]" checked={l.keep} onChange={(e) => set(i, { keep: e.target.checked })} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{l.payee || "No name"}</span>
                      <span className="text-xs text-muted-foreground">{shortDate(l.date)}
                        {l.dup ? <span className="ml-2 font-semibold text-[var(--status-amber)]">{l.dup === "key" ? "Already brought in" : "Looks already typed in"}</span> : null}
                        {bill ? <span className="ml-2 inline-flex items-center gap-1 font-semibold text-[var(--status-blue)]"><CalendarClock className="size-3" /> Pays {bill.name}{Math.abs(l.amount) !== Number(bill.amount) ? ` (was ${money(bill.amount)})` : ""}</span> : null}
                      </span>
                    </span>
                    <span className={cn("shrink-0 font-bold tabular-nums", l.amount > 0 && "text-[var(--status-green)]")}>{l.amount > 0 ? "+" : ""}{moneyIn(Math.abs(l.amount), currency)}</span>
                  </div>
                  {l.keep ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-8">
                      <select data-testid="import-line-cat" aria-label="Category" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm" value={l.categoryId ?? ""} onChange={(e) => set(i, { categoryId: e.target.value || null })}>
                        <option value="">No category</option>
                        {dirCats.map((c) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ""}{c.name}</option>)}
                      </select>
                      <label className="flex min-h-9 items-center gap-1.5 text-xs">
                        <input type="checkbox" data-testid="import-line-not-budget" className="size-4" checked={!l.inBudget} onChange={(e) => set(i, { inBudget: !e.target.checked })} />
                        Not in the budget
                      </label>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </Sheet>
  );
}
