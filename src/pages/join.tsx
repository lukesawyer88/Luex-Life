import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AuthForm } from "@/components/auth-form";
import { CentreCard, Splash } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { friendlyError } from "@/lib/family";
import { supabase } from "@/lib/supabase";
import { roleLabel } from "@/lib/household";

export function JoinPage() {
  const { t } = useSearch({ from: "/join" });
  const { user, loading, signOut } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const preview = useQuery({
    queryKey: ["invite-preview", t],
    enabled: !!t,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("preview_invite", { p_token: t! });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  if (loading || (t && preview.isLoading)) return <Splash />;

  if (!t || !preview.data) {
    return (
      <CentreCard title="This invite isn't valid" subtitle="It may have expired or been cancelled.">
        <p className="mb-4 text-sm">Ask the person who invited you to send a new one.</p>
        <Button className="h-11 w-full rounded-full" onClick={() => navigate({ to: "/" })}>Go to Luex Life</Button>
      </CentreCard>
    );
  }

  const inv = preview.data;

  async function join() {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("accept_invite", { p_token: t! });
      if (error) throw error;
      await qc.invalidateQueries();
      toast.success(`Welcome to ${inv.family_name}!`);
      await navigate({ to: "/" });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CentreCard title={`Join ${inv.family_name}`} subtitle={`You've been invited as ${inv.display_name} (${roleLabel(inv.role, "family").toLowerCase()}).`}>
      {user ? (
        <div className="space-y-3">
          <p className="text-center text-sm">Signed in as <strong>{user.email}</strong></p>
          <Button className="h-11 w-full rounded-full" onClick={join} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : `Join ${inv.family_name}`}
          </Button>
          <p className="text-center text-xs text-muted-foreground">The invite only works for the email address it was sent to.</p>
          <Button variant="ghost" className="h-11 w-full rounded-full" onClick={() => void signOut()}>Use a different email</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-center text-sm text-muted-foreground">Sign in or create an account with the email address this invite was sent to.</p>
          <AuthForm redirectPath={`/join?t=${encodeURIComponent(t)}`} defaultMode="up" />
        </div>
      )}
    </CentreCard>
  );
}
