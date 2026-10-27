// Days out: a shared list of places and things the household would love to do. Anyone adds one (children too);
// tick it when you've done it.
import { useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Lightbulb, MapPin, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Empty, Field, Sheet } from "@/modules/calendar/ui";

import { errMsg, refreshTrips, useIdeas, type Idea } from "./data";

export function IdeasTab() {
  const { family, me, members, role } = useFamilyState();
  const qc = useQueryClient();
  const q = useIdeas();
  const [edit, setEdit] = useState<Idea | "new" | null>(null);
  const [showDone, setShowDone] = useState(false);
  const grownUp = role !== "child";
  const all = q.data ?? [];
  const open = all.filter((i) => !i.done_at);
  const done = all.filter((i) => i.done_at);
  const canChange = (i: Idea) => grownUp || i.created_by === me.id;

  async function tick(i: Idea) {
    const { error } = await supabase.from("trip_ideas").update({ done_at: i.done_at ? null : new Date().toISOString() }).eq("id", i.id);
    if (error) return void toast.error(errMsg(error));
    await refreshTrips(qc, family.id);
    if (!i.done_at) toast.success("Done. Hope it was fun");
  }

  const row = (i: Idea) => {
    const by = members.find((m) => m.id === i.created_by);
    return (
      <li key={i.id} className="glass-tile flex items-center gap-3 p-3" data-testid="idea-row">
        <button type="button" className="min-w-0 flex-1 text-left" disabled={!canChange(i)} onClick={() => setEdit(i)}>
          <span className={cn("block text-base font-semibold", i.done_at && "text-muted-foreground line-through")}>{i.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {i.place ? <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {i.place}</span> : null}
            {by ? <span className="inline-flex items-center gap-1"><MemberAvatar member={by} size="sm" className="size-5 ring-0 ring-offset-0" /> {by.display_name}'s idea</span> : null}
          </span>
        </button>
        {i.link ? <a href={i.link} target="_blank" rel="noreferrer noopener" aria-label={`Open the link for ${i.title}`} className="grid size-10 place-items-center rounded-full hover:bg-muted"><ExternalLink className="size-5" /></a> : null}
        {canChange(i) ? (
          <button type="button" data-testid="idea-tick" aria-pressed={!!i.done_at} aria-label={i.done_at ? `Not done: ${i.title}` : `Done: ${i.title}`} onClick={() => void tick(i)}
            className={cn("grid size-11 shrink-0 place-items-center rounded-full border-2", i.done_at ? "border-transparent bg-[var(--status-green)] text-white" : "border-[var(--surface-border)] bg-[var(--surface)]")}>
            <Check className="size-5" />
          </button>
        ) : null}
      </li>
    );
  };

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Days out we'd love to do</h2>
          <Button data-testid="idea-add" className="h-11 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-5" /> Idea</Button>
        </div>
        {q.isLoading ? null : !all.length ? (
          <Empty icon={Lightbulb} title="No ideas yet">Add places and things the family would love to do: the zoo, a castle, a beach. Anyone can add one.</Empty>
        ) : (
          <>
            {open.length ? <ul className="space-y-2">{open.map(row)}</ul> : <p className="text-base text-muted-foreground">You've done them all. Time for new ideas.</p>}
            {done.length ? (
              <div>
                <button type="button" className="min-h-11 text-sm font-semibold underline" onClick={() => setShowDone(!showDone)}>{showDone ? "Hide" : "Show"} done ({done.length})</button>
                {showDone ? <ul className="mt-2 space-y-2">{done.map(row)}</ul> : null}
              </div>
            ) : null}
          </>
        )}
      </RecordsWindow>
      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} title={edit === "new" ? "An idea for a day out" : "Change the idea"}>
        {edit !== null ? <IdeaForm key={edit === "new" ? "new" : edit.id} existing={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
      </Sheet>
    </Windows>
  );
}

function IdeaForm({ existing, onClose }: { existing: Idea | null; onClose: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [place, setPlace] = useState(existing?.place ?? "");
  const [link, setLink] = useState(existing?.link ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    let l = link.trim();
    if (l && !/^https?:\/\//i.test(l)) l = `https://${l}`;
    if (l && !/^https?:\/\/[^\s/]+\.[^\s]+/i.test(l)) return void toast.error("That link doesn't look right");
    setBusy(true);
    try {
      const row = { title: title.trim(), place: place.trim() || null, link: l || null, notes: notes.trim() };
      const { error } = existing ? await supabase.from("trip_ideas").update(row).eq("id", existing.id) : await supabase.from("trip_ideas").insert({ ...row, family_id: family.id });
      if (error) throw error;
      await refreshTrips(qc, family.id);
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    const { error } = await supabase.from("trip_ideas").update({ deleted_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) return void toast.error(errMsg(error));
    await refreshTrips(qc, family.id);
    onClose();
  }

  return (
    <div className="space-y-4">
      <Field label="What would you love to do?"><Input data-testid="idea-title" data-autofocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Go to the zoo" className="h-12 text-base" /></Field>
      <Field label="Where" hint="Optional"><Input data-testid="idea-place" value={place} maxLength={120} onChange={(e) => setPlace(e.target.value)} placeholder="Chester" className="h-12 text-base" /></Field>
      <Field label="Website" hint="Optional"><Input value={link} maxLength={500} inputMode="url" onChange={(e) => setLink(e.target.value)} placeholder="chesterzoo.org" className="h-12 text-base" /></Field>
      <Field label="Notes" hint="Optional">
        <textarea value={notes} maxLength={500} rows={2} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </Field>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-testid="idea-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !title.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
        {existing ? <Button variant="ghost" className="h-12 rounded-full text-[var(--status-red)]" onClick={() => void remove()}><Trash2 className="size-4" /> Remove</Button> : null}
      </div>
    </div>
  );
}
