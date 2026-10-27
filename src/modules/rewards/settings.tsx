// Rewards settings: what the household uses (parents choose), and which notifications I get (everyone).
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { Field, Sheet } from "@/modules/calendar/ui";

import { ALERT_LABEL, ALERTS, errMsg, refreshRewards, usePeopleSettings, useRewardSettings } from "./data";

function Toggle({ label, hint, on, onChange, disabled, testId }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean; testId?: string }) {
  return (
    <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--surface)] px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      <Switch data-testid={testId} checked={on} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

export function RewardSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { family, me, isParent } = useFamilyState();
  const qc = useQueryClient();
  const settings = useRewardSettings();
  const people = usePeopleSettings();
  const mine = people.data?.get(me.id) ?? null;

  const [forMe, setForMe] = useState(true);
  const [forUs, setForUs] = useState(true);
  const [kids, setKids] = useState(true);
  const [rate, setRate] = useState("");
  const [deductions, setDeductions] = useState(false);
  const [bonus, setBonus] = useState("");
  const [bonusStars, setBonusStars] = useState("");
  const [alerts, setAlerts] = useState<string[]>([...ALERTS]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const s = settings.data;
    if (s) {
      setForMe(s.for_me); setForUs(s.for_us); setKids(s.children);
      setRate(s.stars_per_pound ? String(s.stars_per_pound) : "");
      setDeductions(s.deductions_on);
      setBonus(Number(s.week_bonus) > 0 ? Number(s.week_bonus).toFixed(2) : "");
      setBonusStars(s.week_bonus_stars > 0 ? String(s.week_bonus_stars) : "");
    }
    setAlerts(mine?.alerts ?? [...ALERTS]);
  }, [open, settings.data, mine]);

  async function save() {
    setBusy(true);
    try {
      if (isParent) {
        const r = rate.trim() ? Math.round(Number(rate)) : null;
        if (r !== null && (!Number.isFinite(r) || r < 1 || r > 1000)) throw new Error("Stars for £1 should be between 1 and 1000");
        const b = bonus.trim() ? Math.round(Number(bonus.replace(/[£,\s]/g, "")) * 100) / 100 : 0;
        if (!Number.isFinite(b) || b < 0 || b >= 1000) throw new Error("Type a weekly bonus like 1.00");
        const bs = bonusStars.trim() ? Math.round(Number(bonusStars)) : 0;
        if (!Number.isFinite(bs) || bs < 0 || bs > 1000) throw new Error("Weekly bonus stars should be up to 1000");
        const { error } = await supabase.from("reward_settings").update({
          for_me: forMe, for_us: forUs, children: kids, stars_per_pound: r, deductions_on: deductions, week_bonus: b, week_bonus_stars: bs,
        }).eq("family_id", family.id);
        if (error) throw error;
      }
      const { error } = mine
        ? await supabase.from("reward_people").update({ alerts }).eq("member_id", me.id)
        : await supabase.from("reward_people").insert({ member_id: me.id, family_id: family.id, alerts });
      if (error) throw error;
      await refreshRewards(qc, family.id);
      toast.success("Saved");
      onOpenChange(false);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Rewards settings"
      footer={
        <>
          <Button data-testid="rset-save" className="h-11 flex-1 rounded-full px-6 sm:flex-none" disabled={busy} onClick={save}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}</Button>
          <Button variant="ghost" className="h-11 rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-5">
        <section className="space-y-2">
          <h3 className="text-sm font-bold">What we use</h3>
          {!isParent ? <p className="text-xs text-muted-foreground">A parent chooses these.</p> : null}
          <Toggle testId="rset-me" label="For me" hint="Habits and treats for each grown-up" on={forMe} onChange={setForMe} disabled={!isParent} />
          <Toggle testId="rset-us" label="For us" hint="Shared rewards and up-for-grabs jobs" on={forUs} onChange={setForUs} disabled={!isParent} />
          <Toggle testId="rset-kids" label="For the children" hint="Pocket money, stars and the reward shop" on={kids} onChange={setKids} disabled={!isParent} />
        </section>

        {isParent ? (
          <section className="space-y-4">
            <h3 className="text-sm font-bold">Stars and money</h3>
            <Field label="Swap stars for money" hint="How many stars make £1. Leave empty to switch swapping off.">
              <div className="flex items-center gap-2">
                <Input data-testid="rset-rate" inputMode="numeric" value={rate} placeholder="Off" className="h-11 w-28" onChange={(e) => setRate(e.target.value)} />
                <span className="text-sm text-muted-foreground">stars = £1</span>
              </div>
            </Field>
            <Toggle testId="rset-deductions" label="Allow taking money or stars off" hint="Off unless you switch it on" on={deductions} onChange={setDeductions} />
            <Field label="Weekly bonus" hint="Paid on Sunday evening to a child who did every chore that week.">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">£</span>
                <Input data-testid="rset-bonus" inputMode="decimal" value={bonus} placeholder="0.00" className="h-11 w-28" onChange={(e) => setBonus(e.target.value)} />
                <span className="text-sm text-muted-foreground">and</span>
                <Input data-testid="rset-bonus-stars" inputMode="numeric" value={bonusStars} placeholder="0" className="h-11 w-20" onChange={(e) => setBonusStars(e.target.value)} />
                <span className="text-sm text-muted-foreground">stars</span>
              </div>
            </Field>
          </section>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-sm font-bold">My notifications</h3>
          {ALERTS.map((a) => (
            <Toggle key={a} testId={`alert-${a}`} label={ALERT_LABEL[a]} on={alerts.includes(a)}
              onChange={(v) => setAlerts((x) => (v ? [...new Set([...x, a])] : x.filter((y) => y !== a)))} />
          ))}
        </section>
      </div>
    </Sheet>
  );
}
