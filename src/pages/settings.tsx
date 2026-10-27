import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { EXTRAS, setExtra, useExtrasOn } from "@/lib/extras";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { MODULES } from "@/modules/registry";

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const { family, isParent, switchedOff } = useFamilyState();
  const qc = useQueryClient();
  const [name, setName] = useState(family.name);
  const extrasOn = useExtrasOn().data;

  async function rename() {
    const { error } = await supabase.from("families").update({ name: name.trim() }).eq("id", family.id);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    await qc.invalidateQueries({ queryKey: ["family", family.id] });
    toast.success("Family name saved");
  }

  async function toggle(key: string, enabled: boolean) {
    const { error } = await supabase
      .from("family_modules")
      .upsert({ family_id: family.id, module_key: key, enabled }, { onConflict: "family_id,module_key" });
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    await qc.invalidateQueries({ queryKey: ["modules", family.id] });
  }

  async function toggleExtra(key: string, on: boolean) {
    try {
      await setExtra(family.id, key, on);
    } catch (e) {
      toast.error(friendlyError(e as Error));
      return;
    }
    await qc.invalidateQueries({ queryKey: ["modules", family.id] });
  }

  return (
    <Windows>
      <RecordsWindow>
        <div className="mx-auto max-w-2xl space-y-5">
          <section className="glass-tile space-y-3 p-4">
            <h2 className="text-sm font-semibold">Your account</h2>
            <p className="text-sm text-muted-foreground">Signed in as {user?.email}</p>
            <Button variant="outline" className="rounded-full" onClick={() => void signOut()}>Sign out</Button>
          </section>

          {isParent ? (
            <section className="glass-tile space-y-3 p-4">
              <h2 className="text-sm font-semibold">Family name</h2>
              <div className="flex gap-2">
                <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-11" aria-label="Family name" />
                <Button className="h-11 rounded-full" onClick={rename} disabled={!name.trim() || name.trim() === family.name}>Save</Button>
              </div>
            </section>
          ) : null}

          <section className="glass-tile p-4">
            <h2 className="mb-1 text-sm font-semibold">What does your family use?</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              {isParent ? "Switch off what you don't need. Nothing is deleted, and you can switch it back on any time." : "Only a parent can change this."}
            </p>
            <ul className="divide-y divide-border">
              {MODULES.map((m) => {
                const Icon = m.icon;
                const on = !switchedOff.has(m.key);
                const id = `mod-${m.key}`;
                return (
                  <li key={m.key} className="flex min-h-12 items-center gap-3 py-2">
                    <Icon className="size-5 shrink-0 text-muted-foreground" />
                    <Label htmlFor={id} className="flex-1 text-sm font-medium">
                      {m.name}
                      {m.audience === "parents" ? <span className="ml-2 text-xs font-normal text-muted-foreground">parents only</span> : null}
                    </Label>
                    <Switch id={id} checked={on} disabled={!isParent || !m.canSwitchOff} onCheckedChange={(v) => void toggle(m.key, v)} />
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="glass-tile p-4" data-testid="more-features">
            <h2 className="mb-1 text-sm font-semibold">More features</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              {isParent
                ? "Luex keeps things simple. Switch on extras only if your household wants them. Nothing is lost when they're off."
                : "Only a parent can change this."}
            </p>
            <div className="space-y-4">
              {MODULES.filter((m) => !switchedOff.has(m.key) && EXTRAS.some((x) => x.module === m.key)).map((m) => (
                <div key={m.key}>
                  <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{m.name}</h3>
                  <ul className="divide-y divide-border">
                    {EXTRAS.filter((x) => x.module === m.key).map((x) => {
                      const id = `extra-${x.key}`;
                      return (
                        <li key={x.key} className="flex min-h-12 items-center gap-3 py-2">
                          <Label htmlFor={id} className="flex-1 text-sm font-medium">
                            {x.label}
                            <span className="block text-xs font-normal text-muted-foreground">{x.hint}</span>
                          </Label>
                          <Switch id={id} data-testid={id} checked={!!extrasOn?.has(x.key)} disabled={!isParent} onCheckedChange={(v) => void toggleExtra(x.key, v)} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      </RecordsWindow>
    </Windows>
  );
}
