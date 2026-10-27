// Waiting (parents): children's spending, gifts from relatives and reward-shop requests, each with a big Yes or No.
import { useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { Empty } from "@/modules/calendar/ui";

import { errMsg, MONEY_KIND_LABEL, money, POT_LABEL, refreshRewards, useBalances, useRewards, useWaiting, type Pot } from "./data";
import type { TabProps } from "./rewards-page";

type Item = { key: string; table: "pocket_entries" | "reward_claims"; id: string; memberId: string; createdBy: string | null; title: string; sub: string; at: string };

export function ApprovalsTab(_props: TabProps) {
  const { family, members } = useFamilyState();
  const qc = useQueryClient();
  const waiting = useWaiting();
  const rewards = useRewards();
  const balances = useBalances();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ memberId: string; text: string } | null>(null);
  const name = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? "Someone";

  const items: Item[] = [
    ...(waiting.data?.money ?? []).map((e) => {
      const amt = Number(e.amount);
      const kind = MONEY_KIND_LABEL[e.kind as keyof typeof MONEY_KIND_LABEL];
      return {
        key: "m" + e.id, table: "pocket_entries" as const, id: e.id, memberId: e.member_id, createdBy: e.created_by,
        title: amt < 0 ? `${name(e.member_id)} spent ${money(-amt)}` : `${kind} for ${name(e.member_id)}: ${money(amt)}`,
        sub: [e.note, amt < 0 ? `from ${POT_LABEL[e.pot as Pot].toLowerCase()}` : e.created_by && e.created_by !== e.member_id ? `from ${name(e.created_by)}` : ""].filter(Boolean).join(" · "),
        at: e.created_at,
      };
    }),
    ...(waiting.data?.claims ?? []).map((c) => {
      const r = rewards.data?.rewards.find((x) => x.id === c.reward_id);
      return {
        key: "c" + c.id, table: "reward_claims" as const, id: c.id, memberId: c.member_id, createdBy: c.member_id,
        title: `${name(c.member_id)} would like: ${r?.emoji ? r.emoji + " " : ""}${r?.title ?? "a reward"}`,
        sub: `${c.stars} stars`, at: c.created_at,
      };
    }),
  ].sort((a, b) => a.at.localeCompare(b.at));

  async function decide(it: Item, yes: boolean) {
    setBusy(it.key);
    const status = it.table === "pocket_entries" ? (yes ? "ok" : "declined") : yes ? "approved" : "declined";
    const { error } = await supabase.from(it.table).update({ status }).eq("id", it.id);
    setBusy(null);
    if (error) { toast.error(errMsg(error)); return; }
    await refreshRewards(qc, family.id);
    const fresh = await balances.refetch();
    const b = fresh.data?.get(it.memberId);
    setDone({ memberId: it.memberId, text: `${yes ? "Done" : "Said no"}. ${name(it.memberId)} now has ${b ? `${b.stars} stars and ${money(b.spend)} to spend` : "an updated balance"}.` });
  }

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Waiting for an OK</h2>
        {done ? <p className="rounded-2xl bg-[var(--status-green-soft)] p-3 text-sm font-semibold" data-testid="approval-done">{done.text}</p> : null}
        {waiting.isLoading ? null : !items.length ? (
          <Empty icon={Clock3} title="Nothing waiting">Children's spending, gifts from relatives and reward requests show here.</Empty>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => {
              const m = members.find((x) => x.id === it.memberId);
              return (
                <li key={it.key} data-testid="approval-row" className="glass-tile flex flex-wrap items-center gap-3 p-3">
                  {m ? <MemberAvatar member={m} size="md" /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{it.title}</span>
                    {it.sub ? <span className="block text-sm text-muted-foreground">{it.sub}</span> : null}
                  </span>
                  <span className="flex gap-2">
                    <Button data-testid="approve-yes" className="h-12 rounded-full px-5 text-base font-semibold" disabled={busy === it.key} onClick={() => void decide(it, true)}><Check className="size-5" /> Yes</Button>
                    <Button data-testid="approve-no" variant="outline" className="h-12 rounded-full px-5 text-base" disabled={busy === it.key} onClick={() => void decide(it, false)}><X className="size-5" /> No</Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </RecordsWindow>
    </Windows>
  );
}
