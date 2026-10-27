// Read-only album links for relatives without a login (grown-ups make them; they stop by themselves).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { Chip, Field, Sheet } from "@/modules/calendar/ui";

import { boardKey, rows, type Album, type AlbumShare } from "./data";

const DAYS = [7, 30, 90];

export function AlbumLinksSheet({ album, open, onOpenChange }: { album: Album | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { family, isParent, me } = useFamilyState();
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [days, setDays] = useState(30);
  const [made, setMade] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const links = useQuery({
    queryKey: boardKey(family.id, "album-shares", album?.id),
    enabled: open && !!album,
    queryFn: () => rows<AlbumShare>(supabase.from("board_album_shares")
      .select("id, family_id, album_id, label, expires_at, revoked_at, last_used_at, created_by, created_at")
      .eq("album_id", album!.id).order("created_at", { ascending: false })),
  });
  const live = (links.data ?? []).filter((l) => !l.revoked_at && new Date(l.expires_at) > new Date());
  const url = made ? `${window.location.origin}/a/${made}` : "";

  async function create() {
    if (!album || !label.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("board_create_album_share", { p_album: album.id, p_label: label.trim(), p_days: days });
      if (error) throw error;
      setMade(data as string);
      setLabel("");
      void qc.invalidateQueries({ queryKey: boardKey(family.id, "album-shares") });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function stop(id: string) {
    const { error } = await supabase.from("board_album_shares").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(friendlyError(error));
    else { toast.success("Link stopped"); void qc.invalidateQueries({ queryKey: boardKey(family.id, "album-shares") }); }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => { if (!o) setMade(null); onOpenChange(o); }}
      title={`Share "${album?.title ?? ""}"`}
      description="People with the link can see this album's photos and videos. They can't see anything else, and they don't need a login."
    >
      {made ? (
        <div className="mb-5 rounded-2xl bg-[var(--status-green-soft)] p-4">
          <p className="mb-2 text-sm font-semibold">Here's the link. It's only shown once, so copy it now.</p>
          <p className="mb-3 break-all rounded-xl bg-[var(--surface)] p-2 text-sm">{url}</p>
          <div className="flex flex-wrap gap-2">
            <Button className="h-11 rounded-full px-4" onClick={() => { void navigator.clipboard?.writeText(url).then(() => toast.success("Copied")); }}><Copy className="size-4" /> Copy</Button>
            {typeof navigator.share === "function" ? (
              <Button variant="outline" className="h-11 rounded-full px-4" onClick={() => { void navigator.share({ title: album?.title, url }).catch(() => {}); }}><Share2 className="size-4" /> Share</Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        <Field label="Who is it for?" hint="Just so you know which link is which, for example Grandad in Spain">
          <Input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="Grandad" className="h-11" />
        </Field>
        <Field label="How long should it work?">
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => <Chip key={d} on={days === d} onClick={() => setDays(d)}>{d === 7 ? "1 week" : d === 30 ? "1 month" : "3 months"}</Chip>)}
          </div>
        </Field>
        <Button className="h-11 w-full rounded-full font-semibold" disabled={busy || !label.trim()} onClick={() => void create()}><Link2 className="size-4" /> Make a link</Button>
      </div>

      <h3 className="mb-2 mt-6 text-sm font-bold">Links that work now</h3>
      {live.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
        <ul className="space-y-2">
          {live.map((l) => (
            <li key={l.id} className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{l.label}</span>
                <span className="block text-xs text-muted-foreground">
                  Works until {new Date(l.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  {l.last_used_at ? ` · last opened ${new Date(l.last_used_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : " · not opened yet"}
                </span>
              </span>
              {isParent || l.created_by === me.id ? <Button variant="outline" className="h-10 rounded-full px-3" onClick={() => void stop(l.id)}>Stop</Button> : null}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
