import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Baby, Copy, Link2, Loader2, Share2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";

import { useShares, type Share } from "./data";
import { dayKey, shortDate, timeOf } from "./time";
import { Chip, Field, PeoplePicker, Sheet } from "./ui";

// One simple link. Showing the day's notes, routines and birthdays (handy for a babysitter) makes it a
// "babysitter" link in the database; otherwise it's a plain read-only link.
const LENGTHS: { hours: number; label: string }[] = [
  { hours: 12, label: "Tonight" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "A week" },
  { hours: 24 * 31, label: "A month" },
  { hours: 24 * 183, label: "6 months" },
  { hours: 24 * 365, label: "A year" },
];

/** Parents make a read-only link for a babysitter, a grandparent or anyone outside the family */
export function ShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { family, members, isParent } = useFamilyState();
  const qc = useQueryClient();
  const shares = useShares(isParent && open);
  const [name, setName] = useState("");
  const [hours, setHours] = useState(168);
  const [people, setPeople] = useState<string[]>([]);
  const [notes, setNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const tz = family.timezone;

  useEffect(() => {
    if (open) { setLink(null); setName(""); setHours(168); setPeople([]); setNotes(false); }
  }, [open]);

  async function create() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_share", {
        p_name: name.trim() || (notes ? "Babysitter" : "Family"),
        p_kind: notes ? "babysitter" : "outside", p_people: people, p_show_notes: notes, p_hours: hours,
      });
      if (error) throw error;
      setLink(`${window.location.origin}/s/${data as string}`);
      await qc.invalidateQueries({ queryKey: ["cal", family.id, "shares"] });
    } catch (err) {
      toast.error(friendlyError(err));
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
    if (!window.confirm(`Stop the link "${s.name}"? It will stop working straight away.`)) return;
    const { error } = await supabase.from("cal_shares").update({ revoked_at: new Date().toISOString() }).eq("id", s.id);
    if (error) return void toast.error(friendlyError(error));
    await qc.invalidateQueries({ queryKey: ["cal", family.id, "shares"] });
    toast.success("Link stopped");
  }

  if (!isParent) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Share the calendar" description="A read-only link. Nobody can change anything with it.">
      {link ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-2xl bg-[var(--status-amber-soft)] p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--status-amber)]" />
            <span>Anyone with this link can see the calendar until it ends. Only send it to the person it's for. This is the only time you'll see it.</span>
          </div>
          <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="h-12 text-sm" aria-label="Link" />
          <div className="flex flex-wrap gap-2">
            <Button className="h-11 rounded-full" onClick={copy}><Copy className="size-4" /> Copy link</Button>
            {typeof navigator !== "undefined" && "share" in navigator ? (
              <Button variant="outline" className="h-11 rounded-full" onClick={() => void navigator.share({ title: `${family.name} calendar`, url: link }).catch(() => {})}>
                <Share2 className="size-4" /> Send
              </Button>
            ) : null}
            <Button variant="ghost" className="h-11 rounded-full" onClick={() => setLink(null)}>Make another</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <Field label="Who is it for?" hint="Just for you, so you know which link is which.">
            <Input value={name} maxLength={60} placeholder="e.g. Grandad, or Sophie the babysitter" onChange={(e) => setName(e.target.value)} className="h-11" />
          </Field>
          <Field label="How long should it work?">
            <div className="flex flex-wrap gap-1.5">
              {LENGTHS.map((l) => <Chip key={l.hours} on={hours === l.hours} onClick={() => setHours(l.hours)}>{l.label}</Chip>)}
            </div>
          </Field>
          <Field label="Whose things?" hint="Leave empty to show everyone. Things for the whole family always show.">
            <PeoplePicker members={members} value={people} onChange={setPeople} />
          </Field>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium">
            <span>Show notes, routines and birthdays<span className="block text-xs font-normal text-muted-foreground">Handy for a babysitter</span></span>
            <Switch checked={notes} onCheckedChange={setNotes} />
          </label>
          <div className="rounded-2xl bg-muted/60 p-3 text-xs text-muted-foreground">
            Private events, reminders, photos, files and comments are never shown.
          </div>
          <Button className="h-11 w-full rounded-full sm:w-auto sm:px-8" onClick={create} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <><Link2 className="size-4" /> Make the link</>}
          </Button>

          {shares.data?.length ? (
            <div>
              <h3 className="mb-1.5 text-sm font-bold">Links that are working now</h3>
              <div className="space-y-1.5">
                {shares.data.map((s) => (
                  <div key={s.id} className="glass-tile flex min-h-12 items-center gap-3 px-3 py-2">
                    {s.kind === "babysitter" ? <Baby className="size-5 shrink-0 text-muted-foreground" /> : <Users className="size-5 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Ends {shortDate(dayKey(new Date(s.expires_at), tz))} {timeOf(new Date(s.expires_at), tz)}
                        {s.last_used_at ? ` · last opened ${shortDate(dayKey(new Date(s.last_used_at), tz))}` : " · not opened yet"}
                      </p>
                    </div>
                    <Button variant="ghost" className="h-10 rounded-full text-destructive" onClick={() => stop(s)}>Stop this link</Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}
