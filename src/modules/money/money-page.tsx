import { BarChart3, CalendarClock, Landmark, Loader2, PiggyBank, ReceiptText, Settings2, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useExtra } from "@/lib/extras";
import { takeLinkParams } from "@/lib/link-params";
import { Tabs } from "@/modules/calendar/ui";

import { BillsTab } from "./bills";
import { BudgetTab } from "./budget";
import { useMoneyLive, useMoneySettings } from "./data";
import { DebtsTab } from "./debts";
import { flushOutbox } from "./outbox";
import { PaymentsTab } from "./payments";
import { ReportsTab } from "./reports";
import { SavingsTab } from "./savings";
import { MoneySettingsDialog } from "./settings";

export type MoneyTab = "budget" | "payments" | "bills" | "savings" | "debts" | "reports";

/** Where to go inside Money (from other tabs and notification links) */
export type MoneyTarget = { tab: MoneyTab; billId?: string; paymentId?: string; potId?: string; categoryId?: string; add?: boolean };
export type TabProps = { target: MoneyTarget; onGo: (t: MoneyTarget) => void };

function fromUrl(): MoneyTarget {
  const p = takeLinkParams();
  const t: MoneyTarget = { tab: (p.get("tab") as MoneyTab | null) ?? "budget" };
  if (p.get("bill")) { t.tab = "bills"; t.billId = p.get("bill")!; }
  if (p.get("payment")) { t.tab = "payments"; t.paymentId = p.get("payment")!; }
  return t;
}

export function MoneyPage() {
  useMoneyLive();
  const settings = useMoneySettings();
  const first = useMemo(fromUrl, []);
  const [target, setTarget] = useState<MoneyTarget>(first);
  const [showSettings, setShowSettings] = useState(false);

  // payments added without a signal go as soon as it's back
  useEffect(() => {
    void flushOutbox();
    const on = () => void flushOutbox();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, []);

  // extras (Settings, More features) add the investments and reports tabs
  const invest = useExtra("money.invest");
  const reports = useExtra("money.reports");
  const items: { key: MoneyTab; label: string; icon: typeof Wallet }[] = [
    { key: "budget", label: "This month", icon: Wallet },
    { key: "payments", label: "Payments", icon: ReceiptText },
    { key: "bills", label: "Bills", icon: CalendarClock },
    { key: "savings", label: "Savings", icon: PiggyBank },
  ];
  if (invest) items.push({ key: "debts", label: "Investments and credit", icon: Landmark });
  if (reports) items.push({ key: "reports", label: "Reports", icon: BarChart3 });
  const tab: MoneyTab = items.some((i) => i.key === target.tab) ? target.tab : "budget";

  if (settings.isLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (settings.isError) return <div className="grid flex-1 place-items-center p-6 text-center text-sm">Money couldn't open. Check your signal and try again.</div>;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <Tabs<MoneyTab> value={tab} onChange={(t) => setTarget({ tab: t })} items={items} />
        </div>
        <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" onClick={() => setShowSettings(true)} aria-label="Money settings"><Settings2 className="size-5" /></Button>
      </div>
      {tab === "budget" ? <BudgetTab target={target} onGo={setTarget} /> : null}
      {tab === "payments" ? <PaymentsTab target={target} onGo={setTarget} /> : null}
      {tab === "bills" ? <BillsTab target={target} onGo={setTarget} /> : null}
      {tab === "savings" ? <SavingsTab target={target} onGo={setTarget} /> : null}
      {tab === "debts" ? <DebtsTab target={target} onGo={setTarget} /> : null}
      {tab === "reports" ? <ReportsTab target={target} onGo={setTarget} /> : null}
      <MoneySettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </div>
  );
}
