// Home essentials: the address, where the stopcock, fuse box and spare key are, the Wi-Fi, bedtimes and the family plan.
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Home } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { Empty, Field, Sheet } from "@/modules/calendar/ui";

import { errMsg, refreshEm, useHome, type HomeInfo } from "./data";

const WHERE: { key: "stopcock" | "fuse_box" | "gas_meter" | "first_aid" | "spare_key"; label: string; ph: string }[] = [
  { key: "stopcock", label: "Water stopcock", ph: "Under the kitchen sink" },
  { key: "fuse_box", label: "Fuse box", ph: "Cupboard under the stairs" },
  { key: "gas_meter", label: "Gas meter", ph: "Box by the front door" },
  { key: "first_aid", label: "First-aid kit", ph: "Bathroom cabinet" },
  { key: "spare_key", label: "Spare key", ph: "With next door (Sue, number 3)" },
];

export function HomeTab() {
  const { role } = useFamilyState();
  const q = useHome();
  const h = q.data ?? null;
  const [editing, setEditing] = useState(false);
  const [showWifi, setShowWifi] = useState(false);
  const grownUp = role !== "child";
  const has = h && (h.address || WHERE.some((w) => h[w.key]) || h.wifi_name || h.meet_point || h.plan || h.bedtimes);
  const item = (label: string, v: string | null | undefined) => (v ? (
    <div className="glass-tile p-3"><div className="text-sm text-muted-foreground">{label}</div><div className="whitespace-pre-line text-lg font-semibold">{v}</div></div>
  ) : null);

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Home essentials</h2>
          {grownUp ? <Button data-testid="home-change" className="h-11 rounded-full px-4 font-semibold" onClick={() => setEditing(true)}>{has ? "Change" : "Fill in"}</Button> : null}
        </div>
        {q.isLoading ? null : !has ? (
          <Empty icon={Home} title="Nothing here yet">
            {grownUp ? "Add your address and where the stopcock, fuse box and spare key are, so anyone can find them in a hurry." : "A grown-up can add where things are."}
          </Empty>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2" data-testid="home-items">
            {item("Our address", h!.address)}
            {WHERE.map((w) => <div key={w.key} className="contents">{item(w.label, h![w.key])}</div>)}
            {h!.wifi_name ? (
              <div className="glass-tile flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-muted-foreground">Wi-Fi</div>
                  <div className="text-lg font-semibold">{h!.wifi_name}</div>
                  {h!.wifi_password ? <div className="select-all font-mono text-base">{showWifi ? h!.wifi_password : "••••••••"}</div> : null}
                </div>
                {h!.wifi_password ? <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label={showWifi ? "Hide the password" : "Show the password"} onClick={() => setShowWifi(!showWifi)}>{showWifi ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</Button> : null}
              </div>
            ) : null}
            {item("Where we meet if we're separated", h!.meet_point)}
            {item("Who collects the children if we can't", h!.plan)}
            {item("Bedtimes and routines", h!.bedtimes)}
          </div>
        )}
      </RecordsWindow>
      <DetailWindow>
        <p className="text-sm text-muted-foreground">These show on the printed emergency sheet and in a babysitter link. The Wi-Fi only goes in a babysitter link if you tick it.</p>
      </DetailWindow>
      <Sheet open={editing} onOpenChange={setEditing} title="Home essentials">
        {editing ? <HomeForm h={h} onClose={() => setEditing(false)} /> : null}
      </Sheet>
    </Windows>
  );
}

function HomeForm({ h, onClose }: { h: HomeInfo | null; onClose: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [v, setV] = useState({
    address: h?.address ?? "", stopcock: h?.stopcock ?? "", fuse_box: h?.fuse_box ?? "", gas_meter: h?.gas_meter ?? "", first_aid: h?.first_aid ?? "",
    spare_key: h?.spare_key ?? "", wifi_name: h?.wifi_name ?? "", wifi_password: h?.wifi_password ?? "", meet_point: h?.meet_point ?? "",
    plan: h?.plan ?? "", bedtimes: h?.bedtimes ?? "",
  });
  const [wifiInLink, setWifiInLink] = useState(h?.wifi_in_link ?? false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((o) => ({ ...o, [k]: e.target.value }));
  const area = (k: keyof typeof v, max: number, ph?: string) => (
    <textarea data-testid={`home-${k}`} value={v[k]} maxLength={max} rows={2} placeholder={ph} onChange={set(k)}
      className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
  );

  async function save() {
    setBusy(true);
    try {
      const row = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim() || null])) as Record<keyof typeof v, string | null>;
      // someone else may have filled it in first: then change theirs
      let { error } = h ? { error: null } : await supabase.from("em_home").insert({ ...row, wifi_in_link: wifiInLink, family_id: family.id });
      if (h || error?.code === "23505") ({ error } = await supabase.from("em_home").update({ ...row, wifi_in_link: wifiInLink }).eq("family_id", family.id));
      if (error) throw error;
      await refreshEm(qc, family.id);
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Our address" hint="Exactly as you'd read it out to 999, with the postcode">{area("address", 300)}</Field>
      {WHERE.map((w) => (
        <Field key={w.key} label={`Where's the ${w.label.toLowerCase()}?`}>
          <Input data-testid={`home-${w.key}`} value={v[w.key]} maxLength={120} onChange={set(w.key)} placeholder={w.ph} className="h-12 text-base" />
        </Field>
      ))}
      <div className="flex flex-wrap gap-3">
        <Field label="Wi-Fi name"><Input data-testid="home-wifi-name" value={v.wifi_name} maxLength={60} onChange={set("wifi_name")} className="h-12 w-52 text-base" /></Field>
        <Field label="Wi-Fi password"><Input data-testid="home-wifi" value={v.wifi_password} maxLength={80} onChange={set("wifi_password")} className="h-12 w-52 text-base" /></Field>
      </div>
      <div className="glass-tile flex min-h-14 items-center gap-3 p-4">
        <Label htmlFor="wifi-link" className="flex-1 text-base font-semibold">
          Put the Wi-Fi in babysitter links
          <span className="block text-sm font-normal text-muted-foreground">{wifiInLink ? "Anyone with a babysitter link can see the password." : "Babysitter links don't show the Wi-Fi."}</span>
        </Label>
        <Switch id="wifi-link" data-testid="home-wifi-link" checked={wifiInLink} onCheckedChange={setWifiInLink} />
      </div>
      <Field label="Where we meet if we're separated" hint="For example “The lamp post at the end of the road”">{area("meet_point", 200)}</Field>
      <Field label="Who collects the children if we can't">{area("plan", 500, "Gran first, then Sue next door")}</Field>
      <Field label="Bedtimes and routines" hint="For the babysitter">{area("bedtimes", 500, "Mia: bath at 6.30, bed at 7. Tom: bed at 8, reading first")}</Field>
      <div className="flex gap-2 pt-1">
        <Button data-testid="home-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
