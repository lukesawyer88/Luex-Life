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

export function SetupPage() {
  const { user, loading } = useAuth();
  const me = useMyMember(user?.id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [familyName, setFamilyName] = useState("");
  const [myName, setMyName] = useState("");
  const [colour, setColour] = useState<string>(FAMILY_COLOURS[0]);
  const [busy, setBusy] = useState(false);

  if (loading || (user && me.isLoading)) return <Splash />;
  if (!user) return <Navigate to="/sign-in" />;
  if (me.data) return <Navigate to="/" />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.rpc("create_family", { p_family_name: familyName, p_my_name: myName, p_colour: colour });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["me"] });
      await navigate({ to: "/" });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CentreCard title="Set up your family" subtitle="You can change all of this later.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="family">Family name</Label>
          <Input id="family" required maxLength={80} placeholder="The Murphys" value={familyName} onChange={(e) => setFamilyName(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="me">Your name</Label>
          <Input id="me" required maxLength={60} value={myName} onChange={(e) => setMyName(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label>Your colour</Label>
          <ColourPicker value={colour} onChange={setColour} />
        </div>
        <p className="text-xs text-muted-foreground">You'll be the family's first parent. You can add the others on the next screen.</p>
        <Button type="submit" className="h-11 w-full rounded-full" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Create my family"}
        </Button>
      </form>
    </CentreCard>
  );
}
