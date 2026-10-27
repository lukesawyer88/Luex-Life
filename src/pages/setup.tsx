import { Navigate, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { CentreCard, Splash } from "@/components/page-parts";
import { ColourPicker } from "@/components/colour-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { friendlyError, useMyMember } from "@/lib/family";
import { supabase } from "@/lib/supabase";
import { FAMILY_COLOURS } from "@/components/colour-picker";
import { HOUSEHOLD_KINDS, setHouseholdKind, type HouseholdKind } from "@/lib/household";
import { cn } from "@/lib/utils";

export function SetupPage() {
  const { user, loading } = useAuth();
  const me = useMyMember(user?.id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [familyName, setFamilyName] = useState("");
  const [myName, setMyName] = useState("");
  const [colour, setColour] = useState<string>(FAMILY_COLOURS[0]);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<HouseholdKind | null>(null);
  const fam = kind === "family";

  if (loading || (user && me.isLoading)) return <Splash />;
  if (!user) return <Navigate to="/sign-in" />;
  if (me.data) return <Navigate to="/" />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_family", { p_family_name: familyName, p_my_name: myName, p_colour: colour });
      if (error) throw error;
      // which modules start switched on, and the words the app uses
      if (kind && data) await setHouseholdKind(data as string, kind);
      await qc.invalidateQueries({ queryKey: ["me"] });
      await navigate({ to: "/" });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CentreCard title={kind === null ? "Who lives here?" : fam ? "Set up your family" : "Set up your household"} subtitle="You can change all of this later.">
      {kind === null ? (
        <div className="grid gap-2" data-testid="household-kind">
          {HOUSEHOLD_KINDS.map((k) => (
            <button key={k.key} type="button" onClick={() => setKind(k.key)} data-testid={`kind-${k.key}`}
              className={cn("glass-tile flex min-h-16 items-center gap-3 p-3 text-left hover:bg-muted/40")}>
              <span className="text-3xl" aria-hidden>{k.emoji}</span>
              <span className="min-w-0">
                <span className="block text-base font-semibold">{k.label}</span>
                <span className="block text-sm text-muted-foreground">{k.hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
      <form onSubmit={submit} className="space-y-4">
        <button type="button" onClick={() => setKind(null)} className="text-sm font-semibold underline">
          {HOUSEHOLD_KINDS.find((k) => k.key === kind)?.emoji} {HOUSEHOLD_KINDS.find((k) => k.key === kind)?.label} · change
        </button>
        <div className="space-y-1.5">
          <Label htmlFor="family">{fam ? "Family name" : kind === "solo" ? "Name for your home" : "Household name"}</Label>
          <Input id="family" required maxLength={80} placeholder={fam ? "The Murphys" : kind === "solo" ? "My place" : kind === "couple" ? "Ann and Pat" : "Number 12"} value={familyName} onChange={(e) => setFamilyName(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="me">Your name</Label>
          <Input id="me" required maxLength={60} value={myName} onChange={(e) => setMyName(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label>Your colour</Label>
          <ColourPicker value={colour} onChange={setColour} />
        </div>
        <p className="text-xs text-muted-foreground">{fam ? "You'll be the family's first parent. You can add the others on the next screen." : kind === "solo" ? "It's just you for now. You can add people later." : "You'll be the organiser. You can add the others on the next screen."}</p>
        <Button type="submit" className="h-11 w-full rounded-full" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : fam ? "Create my family" : "Create my household"}
        </Button>
      </form>
      )}
    </CentreCard>
  );
}
