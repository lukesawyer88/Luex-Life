// Pinned notes: like notes on the fridge. Everyone reads and adds; the writer or a parent changes them.
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Pin, PinOff, Plus, StickyNote, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Field, Sheet } from "@/modules/calendar/ui";

import { refreshBoard, useNotes, type Note } from "./data";

export const NOTE_COLOURS: { key: Note["colour"]; label: string; bg: string }[] = [
  { key: "yellow", label: "Yellow", bg: "color-mix(in srgb, var(--ev-school) 22%, var(--surface))" },
  { key: "blue", label: "Blue", bg: "color-mix(in srgb, var(--ev-birthday) 18%, var(--surface))" },
  { key: "green", label: "Green", bg: "color-mix(in srgb, var(--ev-activity) 18%, var(--surface))" },
  { key: "pink", label: "Pink", bg: "color-mix(in srgb, var(--ev-social) 18%, var(--surface))" },
  { key: "orange", label: "Orange", bg: "color-mix(in srgb, var(--ev-appointment) 16%, var(--surface))" },
  { key: "purple", label: "Purple", bg: "color-mix(in srgb, var(--ev-reminder) 18%, var(--surface))" },
];
export const noteBg = (c: string) => NOTE_COLOURS.find((x) => x.key === c)?.bg ?? NOTE_COLOURS[0].bg;

/** The writer or a parent can change a note */
export function useCanChangeNote() {
  const { me, isParent } = useFamilyState();
  return (n: Note) => isParent || n.author === me.id;
}

/** Fridge-style cards; pinned first */
export function NotesBoard({ compact }: { compact?: boolean }) {
  const notes = useNotes();
  const [edit, setEdit] = useState<Note | "new" | null>(null);
  const list = [...(notes.data ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const shown = compact ? list.filter((n) => n.pinned).slice(0, 6) : list;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex flex-1 items-center gap-2 font-bold"><Pin className="size-4" /> Notes</h3>
        <Button variant="outline" className="h-10 rounded-full px-3" onClick={() => setEdit("new")}><Plus className="size-4" /> Note</Button>
      </div>
      {notes.isLoading ? <Loader2 className="size-5 animate-spin" /> : null}
      {!notes.isLoading && shown.length === 0 ? (
        <button type="button" onClick={() => setEdit("new")} className="flex min-h-20 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--surface-border)] text-sm text-muted-foreground">
          <StickyNote className="size-5" /> Pin a note for everyone to see
        </button>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {shown.map((n) => <NoteCard key={n.id} note={n} onEdit={() => setEdit(n)} />)}
      </div>
      <NoteEditor note={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function NoteCard({ note, onEdit }: { note: Note; onEdit: () => void }) {
  const { members } = useFamilyState();
  const canChange = useCanChangeNote()(note);
  const who = members.find((m) => m.id === note.author);
  return (
    <button
      type="button"
      onClick={canChange ? onEdit : undefined}
      className={cn("relative flex min-h-24 flex-col rounded-2xl p-3 text-left shadow-sm", canChange ? "cursor-pointer" : "cursor-default")}
      style={{ background: noteBg(note.colour), transform: `rotate(${(note.id.charCodeAt(0) % 5) - 2}deg)` }}
      aria-label={canChange ? `Change note: ${note.body}` : note.body}
    >
      {note.pinned ? <Pin className="absolute right-2 top-2 size-3.5 opacity-60" /> : null}
      <span className="line-clamp-5 whitespace-pre-wrap break-words pr-4 text-sm font-medium">{note.body}</span>
      {who ? (
        <span className="mt-auto flex items-center gap-1.5 pt-2 text-xs text-muted-foreground">
          <MemberAvatar member={who} size="sm" className="size-5 text-[9px] ring-0 ring-offset-0" /> {who.display_name}
        </span>
      ) : null}
    </button>
  );
}

export function NoteEditor({ note, onClose }: { note: Note | "new" | null; onClose: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const existing = note && note !== "new" ? note : null;
  const [body, setBody] = useState("");
  const [colour, setColour] = useState<Note["colour"]>("yellow");
  const [pinned, setPinned] = useState(true);
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<Note | "new" | null>(null);
  if (note !== seen) {
    setSeen(note);
    setBody(existing?.body ?? "");
    setColour(existing?.colour ?? "yellow");
    setPinned(existing?.pinned ?? true);
  }

  async function save() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const { error } = existing
        ? await supabase.from("board_notes").update({ body: body.trim(), colour, pinned }).eq("id", existing.id)
        : await supabase.from("board_notes").insert({ family_id: family.id, body: body.trim(), colour, pinned });
      if (error) throw error;
      await refreshBoard(qc, family.id);
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    const id = existing.id;
    const { error } = await supabase.from("board_notes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    await refreshBoard(qc, family.id);
    onClose();
    toast("Note removed", {
      action: {
        label: "Undo",
        onClick: async () => {
          const { error: e2 } = await supabase.from("board_notes").update({ deleted_at: null }).eq("id", id);
          if (e2) toast.error(friendlyError(e2));
          await refreshBoard(qc, family.id);
        },
      },
    });
  }

  return (
    <Sheet
      open={!!note}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "Change note" : "New note"}
      footer={
        <>
          {existing ? <Button variant="ghost" className="h-11 rounded-full text-[var(--status-red)]" onClick={remove}><Trash2 className="size-4" /> Remove</Button> : null}
          <span className="flex-1" />
          <Button className="h-11 rounded-full px-6 font-semibold" onClick={save} disabled={busy || !body.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />} Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Textarea data-autofocus autoFocus value={body} onChange={(e) => setBody(e.target.value.slice(0, 2000))} placeholder="Bins go out on Tuesday" className="min-h-32 text-base" style={{ background: noteBg(colour) }} />
        <Field label="Colour">
          <div className="flex flex-wrap gap-2">
            {NOTE_COLOURS.map((c) => (
              <button key={c.key} type="button" aria-label={c.label} aria-pressed={colour === c.key} onClick={() => setColour(c.key)}
                className={cn("size-11 rounded-full border-2", colour === c.key ? "border-[var(--tile-active)]" : "border-transparent")} style={{ background: c.bg }} />
            ))}
          </div>
        </Field>
        <button type="button" onClick={() => setPinned((p) => !p)} className="flex min-h-11 items-center gap-2 text-sm font-medium">
          {pinned ? <Pin className="size-4" /> : <PinOff className="size-4" />} {pinned ? "Pinned to the board" : "Not pinned"}
        </button>
      </div>
    </Sheet>
  );
}
