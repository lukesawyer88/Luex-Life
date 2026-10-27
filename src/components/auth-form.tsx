import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError } from "@/lib/family";
import { supabase } from "@/lib/supabase";

/** Sign in, create an account, or get a sign-in link by email. The auth state change does the rest. */
export function AuthForm({ redirectPath = "/", defaultMode = "in" }: { redirectPath?: string; defaultMode?: "in" | "up" }) {
  const [mode, setMode] = useState<"in" | "up">(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const redirectTo = `${window.location.origin}${redirectPath}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        if (!data.session) setSent("Check your email and tap the link to finish creating your account.");
      }
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function magicLink() {
    if (!email.trim()) {
      toast.error("Type your email address first.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } });
      if (error) throw error;
      setSent("We've emailed you a sign-in link. Open it on this device.");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm">{sent}</p>
        <Button variant="ghost" onClick={() => setSent(null)}>Back</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1 text-sm font-medium" role="tablist">
        {(["in", "up"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={mode === m ? "min-h-10 rounded-full bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "min-h-10 rounded-full text-muted-foreground"}
          >
            {m === "in" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-11"
        />
        {mode === "up" ? <p className="text-xs text-muted-foreground">At least 8 characters.</p> : null}
      </div>
      <Button type="submit" className="h-11 w-full rounded-full" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : mode === "in" ? "Sign in" : "Create account"}
      </Button>
      <Button type="button" variant="ghost" className="h-11 w-full rounded-full" onClick={magicLink} disabled={busy}>
        Email me a sign-in link instead
      </Button>
    </form>
  );
}
