import { Clock3, HandHeart, History, Loader2, Settings2, Sparkles, Star, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useFamilyState } from "@/lib/family-context";
import { Tabs } from "@/modules/calendar/ui";

import { ApprovalsTab } from "./approvals";
import { useRewardSettings, useRewardsLive, useWaiting } from "./data";
import { HistoryTab } from "./history";
import { KidsTab } from "./kids";
import { MeTab } from "./me";
import { MineTab } from "./mine";
import { flushOutbox } from "./outbox";
import { RewardSettingsDialog } from "./settings";
import { UsTab } from "./us";

export type RewardTab = "me" | "mine" | "us" | "kids" | "approvals" | "history";

/** Where to go inside Rewards (from other tabs and notification links) */
export type RewardTarget = { tab: RewardTab; memberId?: string; jobId?: string; rewardId?: string };
export type TabProps = { target: RewardTarget; onGo: (t: RewardTarget) => void };

function fromUrl(): Partial<RewardTarget> {
  const p = new URLSearchParams(window.location.search);
  const t: Partial<RewardTarget> = {};
  const tab = p.get("tab");
  if (tab === "approvals") t.tab = "approvals";
  if (tab === "jobs") t.tab = "us";
  if ([...p.keys()].length) window.history.replaceState(null, "", window.location.pathname);
  return t;
}

export function RewardsPage() {
  useRewardsLive();
  const { role, isParent, members } = useFamilyState();
  const settings = useRewardSettings();
  const waiting = useWaiting();
  const first = useMemo(fromUrl, []);
  const [target, setTarget] = useState<RewardTarget | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // ticks and records made without a signal go as soon as it's back
  useEffect(() => {
    void flushOutbox();
    const on = () => void flushOutbox();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, []);

  if (settings.isLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (settings.isError || !settings.data) return <div className="grid flex-1 place-items-center p-6 text-center text-sm">Rewards couldn't open. Check your signal and try again.</div>;
  const s = settings.data;
  const hasChildren = members.some((m) => m.role === "child" && !m.archived_at);
  const waitingN = (waiting.data?.money.length ?? 0) + (waiting.data?.claims.length ?? 0);

  const items: { key: RewardTab; label: string; icon: typeof Star }[] = [];
  if (role === "child") items.push({ key: "mine", label: "My stars and money", icon: Star });
  else if (s.for_me) items.push({ key: "me", label: "Me", icon: Sparkles });
  if (s.for_us) items.push({ key: "us", label: "Together", icon: Users });
  if (isParent && s.children && hasChildren) {
    items.push({ key: "kids", label: "Children", icon: HandHeart });
    items.push({ key: "approvals", label: waitingN ? `Waiting (${waitingN})` : "Waiting", icon: Clock3 });
  }
  items.push({ key: "history", label: "History", icon: History });

  const wanted = target?.tab ?? first.tab ?? items[0].key;
  const tab = items.some((i) => i.key === wanted) ? wanted : items[0].key;
  const t: RewardTarget = { ...(target ?? {}), tab };
  const go = (n: RewardTarget) => setTarget(n);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <Tabs<RewardTab> value={tab} onChange={(k) => setTarget({ tab: k })} items={items} />
        </div>
        <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" onClick={() => setShowSettings(true)} aria-label="Rewards settings"><Settings2 className="size-5" /></Button>
      </div>
      {tab === "me" ? <MeTab target={t} onGo={go} /> : null}
      {tab === "mine" ? <MineTab target={t} onGo={go} /> : null}
      {tab === "us" ? <UsTab target={t} onGo={go} /> : null}
      {tab === "kids" ? <KidsTab target={t} onGo={go} /> : null}
      {tab === "approvals" ? <ApprovalsTab target={t} onGo={go} /> : null}
      {tab === "history" ? <HistoryTab target={t} onGo={go} /> : null}
      <RewardSettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </div>
  );
}
