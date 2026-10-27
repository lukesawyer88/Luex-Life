// Small pieces shared by the Bills, Savings and Loans screens.
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import type { ReactNode, SelectHTMLAttributes } from "react";

import { Switch } from "@/components/ui/switch";
import { useFamilyState } from "@/lib/family-context";
import { cn } from "@/lib/utils";

import { rateToGbp } from "./data";

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

/** The small lock shown on "just mine" things */
export function MineLock({ className }: { className?: string }) {
  return <Lock className={cn("inline size-3.5 shrink-0 text-muted-foreground", className)} aria-label="Just mine" />;
}

/** "Just mine" switch with the plain rules underneath */
export function JustMine({ on, onChange, disabled, hint }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string }) {
  return (
    <label className={cn("flex items-start gap-3 rounded-2xl bg-[var(--surface)] p-3", disabled && "opacity-70")}>
      <Switch checked={on} onCheckedChange={onChange} disabled={disabled} data-testid="just-mine" className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-semibold"><Lock className="size-4" /> Just mine</span>
        <span className="block text-xs text-muted-foreground">{hint ?? "The other parent won't see this."}</span>
      </span>
    </label>
  );
}

/** Parse a typed amount ("£1,234.50", "12") into a number; null when it isn't one */
export function parseAmount(s: string): number | null {
  const v = Number(s.replace(/[£,\s]/g, ""));
  return s.trim() && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/** Today's rates for a set of currencies (pounds per 1 unit); missing ones are left out */
export function useRates(currencies: string[]) {
  const list = [...new Set(currencies.filter((c) => c && c !== "GBP"))].sort();
  return useQuery({
    queryKey: ["money-rates", list],
    enabled: list.length > 0,
    staleTime: 6 * 60 * 60_000,
    queryFn: async () => {
      const out = new Map<string, number>([["GBP", 1]]);
      for (const c of list) {
        const r = await rateToGbp(c);
        if (r) out.set(c, r);
      }
      return out;
    },
  });
}

/** The parents in the family (Money is parents only) */
export function useParents() {
  const { members } = useFamilyState();
  return members.filter((m) => m.role === "parent");
}

/** A big number tile */
export function Stat({ label, value, sub, testId }: { label: string; value: ReactNode; sub?: ReactNode; testId?: string }) {
  return (
    <div className="glass-tile min-w-0 p-3" data-testid={testId}>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-xl font-bold tabular-nums">{value}</p>
      {sub ? <div className="truncate text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

/** Small bars showing how a value moved over time (no chart library) */
export function Sparkbars({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || max || 1;
  return (
    <div className={cn("flex h-12 items-end gap-0.5", className)} aria-hidden>
      {values.slice(-24).map((v, i) => (
        <span key={i} className="min-w-1 flex-1 rounded-t bg-[var(--status-blue)]" style={{ height: `${Math.max(8, ((v - min) / span) * 100)}%`, opacity: 0.45 + (0.55 * (i + 1)) / Math.min(values.length, 24) }} />
      ))}
    </div>
  );
}
