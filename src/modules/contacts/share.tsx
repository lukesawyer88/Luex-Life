// Babysitter links (parents): a link with no sign-in that shows the children's cards, who to call, the home essentials
// and bedtimes, and stops working on the day chosen.
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Copy, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { Chip, Field, Sheet } from "@/modules/calendar/ui";

import { errMsg, useShares, type Share } from "./data";

const LENGTHS = [{ days: 1, label: "Today and tomorrow" }, { days: 3, label: "3 days" }, { days: 7, label: "A week" }, { days: 31, label: "A month" }];

export function ShareSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const shares = useShares(open);
  const [name, setName] = useState("");
  const [days, setDays] = useState(1);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setLink(null); setName(""); setDays(1); }
  }, [open]);

  async function create() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("em_create_share", { p_name: name.trim() || "Babysitter", p_days: days });
      if (error) throw error;
      setLink(`${window.location.origin}/e/${data as string}`);
      await qc.invalidateQueries({ queryKey: ["em-shares", family.id] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Press and hold the link to copy it");
    }
  }

  async function stop(s: Share) {
    if (!window.confirm(`Stop the link "${s.name}"? It stops working straight away.`)) return;
    const { error } = await supabase.from("em_shares").update({ revoked_at: new Date().toISOString() }).eq("id", s.id);
    if (error) return void toast.error(errMsg(error));
    await qc.invalidateQueries({ queryKey: ["em-shares", family.id] });
    toast.success("Link stopped");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Babysitter link" description="Who to call, the children's allergies and medicines, where things are and bedtimes. Nobody can change anything with it.">
      {link ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-2xl bg-[var(--status-amber-soft)] p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--status-amber)]" />
            <span>Anyone with this link can see it until it ends. Only send it to the person it's for. This is the only time you'll see it.</span>
          </div>
          <Input readOnly value={link} data-testid="share-link" onFocus={(e) => e.currentTarget.select()} className="h-12 text-sm" aria-label="Link" />
          <div className="flex flex-wrap gap-2">
            <Button className="h-11 rounded-full" onClick={() => void copy()}><Copy className="size-4" /> Copy link</Button>
            {typeof navigator !== "undefined" && "share" in navigator ? (
              <Button variant="outline" className="h-11 rounded-full" onClick={() => void navigator.share({ title: `${family.name}: for the babysitter`, url: link }).catch(() => {})}>
                <Share2 className="size-4" /> Send
              </Button>
            ) : null}
            <Button variant="ghost" className="h-11 rounded-full" onClick={() => setLink(null)}>Make another</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <Field label="Who is it for?" hint="Just for you, so you know which link is which.">
            <Input data-testid="share-name" value={name} maxLength={60} placeholder="Sophie the babysitter" onChange={(e) => setName(e.target.value)} className="h-12 text-base" />
          </Field>
          <Field label="How long should it work?">
            <div className="flex flex-wrap gap-2">
              {LENGTHS.map((l) => <Chip key={l.days} on={days === l.days} onClick={() => setDays(l.days)} className="min-h-11 text-base">{l.label}</Chip>)}
            </div>
          </Field>
          <Button data-testid="share-make" className="h-12 w-full rounded-full text-base font-semibold" disabled={busy} onClick={() => void create()}>{busy ? "Making…" : "Make the link"}</Button>
          {shares.data?.length ? (
            <section>
              <h3 className="mb-2 text-sm font-bold">Links that work now</h3>
              <ul className="space-y-2">
                {shares.data.map((s) => (
                  <li key={s.id} className="glass-tile flex items-center gap-2 p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{s.name}</span>
                      <span className="block text-sm text-muted-foreground">
                        Until {new Date(s.expires_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                        {s.last_used_at ? " · opened" : " · not opened yet"}
                      </span>
                    </span>
                    <Button variant="outline" className="h-10 rounded-full" onClick={() => void stop(s)}>Stop</Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}
