// Everything Household Money reads and writes. Parents only: the database returns nothing to anyone else,
// and "just mine" rows only to the parent who owns them. These hooks ask, and keep screens fresh.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { Database } from "@/lib/database.types";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

export type MoneySettings = Row<"money_settings">;
export type Account = Row<"money_accounts">;
export type Category = Row<"money_categories">;
export type Budget = Row<"money_budgets">;
export type Bill = Row<"money_bills">;
export type Pot = Row<"money_pots">;
export type PotMove = Row<"money_pot_moves">;
export type GiftBudget = Row<"money_gift_budgets">;
export type Payment = Row<"money_payments">;
export type PayeeRule = Row<"money_payee_rules">;
export type ImportProfile = Omit<Row<"money_import_profiles">, "mapping"> & { mapping: ImportMapping };
export type Debt = Row<"money_debts">;
export type Holding = Row<"money_holdings">;
export type HoldingValue = Row<"money_holding_values">;
export type CreditScore = Row<"money_credit_scores">;

/** How a bank's CSV columns map onto a payment (column indexes; amount either one signed column or out/in columns) */
export type ImportMapping = {
  date: number;
  dateFormat: "dmy" | "mdy" | "ymd";
  payee: number;
  amount?: number | null;
  out?: number | null;
  in?: number | null;
  /** true when money out is shown as a positive number in the single amount column */
  outIsPositive?: boolean;
  skipRows?: number;
};

export const BUCKET = "money-files";
export const EVERY = ["week", "four_weeks", "month", "quarter", "year"] as const;
export type Every = (typeof EVERY)[number];
export const EVERY_LABEL: Record<Every, string> = { week: "Every week", four_weeks: "Every 4 weeks", month: "Every month", quarter: "Every 3 months", year: "Every year" };
export const ACCOUNT_KIND_LABEL: Record<Account["kind"], string> = {
  current: "Current account", joint: "Joint account", savings: "Savings", credit: "Credit card", cash: "Cash", other: "Other",
};
export const DEBT_KIND_LABEL: Record<Debt["kind"], string> = { loan: "Loan", card: "Credit card", mortgage: "Mortgage", car: "Car finance", other: "Other" };
export const HOLDING_KIND_LABEL: Record<Holding["kind"], string> = { isa: "ISA", pension: "Pension", shares: "Shares", savings: "Savings", other: "Other" };
/** Plain links only: no commission, no referral codes */
export const CREDIT_LINKS = [
  { name: "Experian", url: "https://www.experian.co.uk/consumer/statutory-report.html" },
  { name: "Equifax", url: "https://www.equifax.co.uk/Products/credit/statutory-report.html" },
  { name: "TransUnion", url: "https://www.transunion.co.uk/consumer/statutory-credit-report" },
];
export const COMPARE_LINKS = [
  { name: "Citizens Advice: switching energy", url: "https://www.citizensadvice.org.uk/consumer/energy/energy-supply/get-a-better-energy-deal/" },
  { name: "Ofcom: switching broadband and phone", url: "https://www.ofcom.org.uk/phones-and-broadband/switching-provider" },
  { name: "MoneyHelper: insurance", url: "https://www.moneyhelper.org.uk/en/everyday-money/insurance" },
];

/** Every Money query key starts with this, so one call refreshes them all */
export const moneyKey = (familyId: string, ...rest: unknown[]) => ["money", familyId, ...rest];

export async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

export function refreshMoney(qc: QueryClient, familyId: string) {
  return qc.invalidateQueries({ queryKey: ["money", familyId] });
}

const LIVE_TABLES = ["money_payments", "money_bills", "money_budgets", "money_pots"] as const;

/** Keep Money fresh while it is open (both parents adding at once) */
export function useMoneyLive() {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void refreshMoney(qc, family.id), 300); };
    const ch = supabase.channel(`money-${family.id}`);
    for (const t of LIVE_TABLES) ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `family_id=eq.${family.id}` }, refresh);
    ch.subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [family.id, qc]);
}

// ---------------------------------------------------------------- set-up

/** Settings and the starter categories. The first parent to open Money sets it up (once). */
export function useMoneySettings() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: moneyKey(family.id, "settings"),
    queryFn: async () => {
      let s = (await rows<MoneySettings>(supabase.from("money_settings").select("*").eq("family_id", family.id)))[0];
      if (!s) {
        const { error } = await supabase.rpc("money_setup");
        if (error) throw error;
        s = (await rows<MoneySettings>(supabase.from("money_settings").select("*").eq("family_id", family.id)))[0];
      }
      return s ?? null;
    },
  });
}

// ---------------------------------------------------------------- queries

export function useAccounts() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: moneyKey(family.id, "accounts"),
    queryFn: () => rows<Account>(supabase.from("money_accounts").select("*").eq("family_id", family.id).is("archived_at", null).order("position").order("name")),
  });
}

export function useCategories() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: moneyKey(family.id, "categories"),
    queryFn: () => rows<Category>(supabase.from("money_categories").select("*").eq("family_id", family.id).order("position").order("name")),
  });
}

/** planned amounts for one period (period_start "YYYY-MM-DD") */
export function useBudgets(periodStart: string) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: moneyKey(family.id, "budgets", periodStart),
    queryFn: () => rows<Budget>(supabase.from("money_budgets").select("*").eq("family_id", family.id).eq("period_start", periodStart)),
  });
}

/** every planned amount up to a period (for carry-over) */
export function useBudgetHistory(upTo: string) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: moneyKey(family.id, "budget-history", upTo),
    queryFn: () => rows<Budget>(supabase.from("money_budgets").select("*").eq("family_id", family.id).lte("period_start", upTo)),
  });
}

export function useBills() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: moneyKey(family.id, "bills"),
    queryFn: () => rows<Bill>(supabase.from("money_bills").select("*").eq("family_id", family.id).is("archived_at", null).order("next_due").order("name")),
  });
}

export function usePots() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: moneyKey(family.id, "pots"),
    queryFn: async () => {
      const [pots, moves] = await Promise.all([
        rows<Pot>(supabase.from("money_pots").select("*").eq("family_id", family.id).is("archived_at", null).order("created_at")),
        rows<PotMove>(supabase.from("money_pot_moves").select("*").eq("family_id", family.id).order("on_date", { ascending: false })),
      ]);
      return { pots, moves };
    },
  });
}

/** payments between two dates (inclusive), newest first; deleted ones left out */
export function usePayments(from: string, to: string) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: moneyKey(family.id, "payments", from, to),
    queryFn: () => fetchPayments(family.id, from, to),
  });
}

export async function fetchPayments(familyId: string, from: string, to: string): Promise<Payment[]> {
  const out: Payment[] = [];
  // page through (a year of imports can be a few thousand lines)
  for (let start = 0; ; start += 1000) {
    const page = await rows<Payment>(
      supabase.from("money_payments").select("*").eq("family_id", familyId).is("deleted_at", null)
        .gte("on_date", from).lte("on_date", to).order("on_date", { ascending: false }).order("created_at", { ascending: false })
        .range(start, start + 999),
    );
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

export function useGiftBudgets(year: number) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: moneyKey(family.id, "gifts", year),
    queryFn: () => rows<GiftBudget>(supabase.from("money_gift_budgets").select("*").eq("family_id", family.id).eq("year", year).order("created_at")),
  });
}

export function useDebts() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: moneyKey(family.id, "debts"),
    queryFn: () => rows<Debt>(supabase.from("money_debts").select("*").eq("family_id", family.id).is("archived_at", null).order("created_at")),
  });
}

export function useHoldings() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: moneyKey(family.id, "holdings"),
    queryFn: async () => {
      const [holdings, values] = await Promise.all([
        rows<Holding>(supabase.from("money_holdings").select("*").eq("family_id", family.id).is("archived_at", null).order("created_at")),
        rows<HoldingValue>(supabase.from("money_holding_values").select("*").eq("family_id", family.id).order("on_date")),
      ]);
      return { holdings, values };
    },
  });
}

export function useCreditScores() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: moneyKey(family.id, "credit"),
    queryFn: () => rows<CreditScore>(supabase.from("money_credit_scores").select("*").eq("family_id", family.id).order("on_date")),
  });
}

export function usePayeeRules() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: moneyKey(family.id, "payee-rules"),
    queryFn: () => rows<PayeeRule>(supabase.from("money_payee_rules").select("*").eq("family_id", family.id)),
  });
}

export function useImportProfiles() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: moneyKey(family.id, "import-profiles"),
    queryFn: () => rows<ImportProfile>(supabase.from("money_import_profiles").select("*").eq("family_id", family.id).order("name")),
  });
}

// ---------------------------------------------------------------- receipts

/** Signed addresses for receipts (an hour; re-asked every 50 minutes) */
export function useReceiptUrls(paths: (string | null | undefined)[]) {
  const clean = [...new Set(paths.filter((p): p is string => !!p))].sort();
  return useQuery({
    queryKey: ["money-urls", clean],
    enabled: clean.length > 0,
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
    queryFn: async () => {
      const out = new Map<string, string>();
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(clean, 3600);
      if (error) throw error;
      for (const d of data ?? []) if (d.signedUrl && d.path) out.set(d.path, d.signedUrl);
      return out;
    },
  });
}

/** Upload a (shrunk) receipt photo. Private payments keep their receipt in the owner's own folder. */
export async function uploadReceipt(familyId: string, blob: Blob, privateTo: string | null): Promise<string> {
  const folder = privateTo ? `p/${privateTo}` : "s";
  const path = `${familyId}/money/${folder}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("Couldn't save the receipt. Try again");
  return path;
}

// ---------------------------------------------------------------- exchange rates

/** Today's European Central Bank rate (pounds per 1 unit), cached for the day on this device. Null when offline. */
export async function rateToGbp(currency: string): Promise<number | null> {
  if (currency === "GBP") return 1;
  const day = new Date().toISOString().slice(0, 10);
  const key = `luex.life.money.rate.${currency}.${day}`;
  try {
    const hit = localStorage.getItem(key);
    if (hit) return Number(hit);
  } catch { /* no storage */ }
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(currency)}&to=GBP`);
    if (!r.ok) return null;
    const j = (await r.json()) as { rates?: { GBP?: number } };
    const rate = j.rates?.GBP;
    if (!rate || !Number.isFinite(rate)) return null;
    try { localStorage.setItem(key, String(rate)); } catch { /* no storage */ }
    return rate;
  } catch {
    return null;
  }
}
export const CURRENCIES = ["GBP", "EUR", "USD", "AUD", "CAD", "CHF", "DKK", "NOK", "SEK", "PLN", "CZK", "JPY", "NZD", "ZAR", "INR", "TRY", "HKD", "SGD"];

// ---------------------------------------------------------------- numbers and dates

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const gbp0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
/** "£1,234.50" (or "£1,235" when whole is true) */
export function money(n: number | string | null | undefined, whole = false): string {
  const v = Number(n ?? 0);
  return (whole ? gbp0 : gbp).format(Number.isFinite(v) ? v : 0);
}
export function moneyIn(n: number | string, currency: string): string {
  try { return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(n)); } catch { return `${n} ${currency}`; }
}
/** what a regular amount costs in a month, on average */
export function perMonth(amount: number | string, every: Every): number {
  const a = Number(amount);
  switch (every) {
    case "week": return (a * 52) / 12;
    case "four_weeks": return (a * 13) / 12;
    case "month": return a;
    case "quarter": return a / 3;
    case "year": return a / 12;
  }
}
export function perYear(amount: number | string, every: Every): number {
  return perMonth(amount, every) * 12;
}

/** "YYYY-MM-DD" for today in the family's time zone */
export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function addDaysKey(k: string, n: number): string {
  const d = new Date(k + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function addMonthsKey(k: string, n: number): string {
  const [y, m, day] = k.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 86_400_000);
}
/** "Mon 3 Nov" */
export function shortDate(k: string): string {
  return new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** The budget period containing a day (same rules as the database's money_period_start). */
export function periodFor(s: MoneySettings | null | undefined, day: string): { start: string; end: string; label: string } {
  let start: string;
  let next: string;
  if (!s || s.period === "month") {
    start = day.slice(0, 8) + "01";
    next = addMonthsKey(start, 1);
  } else if (s.four_weekly_anchor) {
    const k = Math.floor(daysBetween(s.four_weekly_anchor, day) / 28);
    start = addDaysKey(s.four_weekly_anchor, k * 28);
    next = addDaysKey(start, 28);
  } else {
    const pd = s.payday_day ?? 1;
    const onMonth = (monthFirst: string) => {
      const [y, m] = monthFirst.split("-").map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return `${monthFirst.slice(0, 8)}${String(Math.min(pd, last)).padStart(2, "0")}`;
    };
    const thisFirst = day.slice(0, 8) + "01";
    const cand = onMonth(thisFirst);
    start = cand <= day ? cand : onMonth(addMonthsKey(thisFirst, -1));
    next = onMonth(addMonthsKey(start.slice(0, 8) + "01", 1));
  }
  const end = addDaysKey(next, -1);
  const label = !s || s.period === "month"
    ? new Date(start + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    : `${shortDate(start)} to ${shortDate(end)}`;
  return { start, end, label };
}

/** the period before or after one (n = -1 or 1) */
export function shiftPeriod(s: MoneySettings | null | undefined, start: string, n: number) {
  const cur = periodFor(s, start);
  return periodFor(s, n < 0 ? addDaysKey(cur.start, -1) : addDaysKey(cur.end, 1));
}

/** Suggest a category for a payee from the family's remembered rules (longest match wins) */
export function suggestCategory(payee: string, rules: PayeeRule[]): string | null {
  const p = payee.toLowerCase();
  let best: PayeeRule | null = null;
  for (const r of rules) if (p.includes(r.match.toLowerCase()) && (!best || r.match.length > best.match.length)) best = r;
  return best?.category_id ?? null;
}

/** Months (rounded up) to clear a debt; null when the payment never clears it */
export function monthsToClear(balance: number, ratePct: number, payment: number): number | null {
  const r = ratePct / 100 / 12;
  if (payment <= 0) return null;
  if (r === 0) return Math.ceil(balance / payment);
  if (payment <= balance * r) return null;
  return Math.ceil(-Math.log(1 - (r * balance) / payment) / Math.log(1 + r));
}
/** Monthly repayment for a repayment mortgage or loan */
export function monthlyRepayment(principal: number, ratePct: number, years: number): number {
  const n = Math.round(years * 12);
  const r = ratePct / 100 / 12;
  if (n <= 0) return 0;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Friendly message from a database error */
export function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/fetch|network/i.test(m)) return "No signal. Try again in a moment";
  if (/not allowed|row-level|permission/i.test(m)) return "That change is not allowed";
  return m.length < 120 ? m : "Something went wrong. Try again";
}
