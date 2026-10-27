// Adding or changing a memory, milestone or journal entry, with photos.
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { Chip, Field, PeoplePicker, Sheet } from "@/modules/calendar/ui";

import { refreshBoard, useFileUrls, useMySettings, type Media, type Memory } from "./data";
import { UploadList, useUploads } from "./photo-upload";

export type EditorMode =
  | { kind: "new"; type: "memory" | "milestone" | "journal"; promptId?: string; promptText?: string; childId?: string }
  | { kind: "edit"; memory: Memory };

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Only me" / "Me and my parents": who sees a private entry */
export function usePrivateLabel(): string {
  const { role } = useFamilyState();
  const s = useMySettings();
  if (role === "child" && (s?.journal_parents_see ?? true)) return "Me and my parents";
  return "Only me";
}

export function MemoryEditor({ open, onOpenChange, mode, media = [] }: { open: boolean; onOpenChange: (o: boolean) => void; mode: EditorMode; media?: Media[] }) {
  const { family, members, me, role } = useFamilyState();
  const qc = useQueryClient();
  const privateLabel = usePrivateLabel();
  const fileInput = useRef<HTMLInputElement>(null);
  const uploads = useUploads();
  const editing = mode.kind === "edit" ? mode.memory : null;
  const [type, setType] = useState<"memory" | "milestone" | "journal">("memory");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [day, setDay] = useState(today());
  const [people, setPeople] = useState<string[]>([]);
  const [child, setChild] = useState<string[]>([]);
  const [audience, setAudience] = useState<"family" | "private">("family");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  const existing = editing ? media.filter((m) => m.memory_id === editing.id && !m.deleted_at) : [];
  const thumbs = useFileUrls(existing.map((m) => m.thumb_path ?? m.path));

  // fill the form each time it opens
  const key = open ? (editing ? `e-${editing.id}` : `n-${mode.kind === "new" ? `${mode.type}-${mode.promptId ?? ""}-${mode.childId ?? ""}` : ""}`) : null;
  if (key !== seen) {
    setSeen(key);
    if (open) {
      setFiles([]); setSavedId(null); uploads.clearDone();
      if (editing) {
        setType(editing.kind as never); setTitle(editing.title); setBody(editing.body); setDay(editing.happened_on);
        setPeople(editing.people); setChild(editing.milestone_for ? [editing.milestone_for] : []); setAudience(editing.audience as never);
      } else if (mode.kind === "new") {
        setType(mode.type); setTitle(""); setBody(""); setDay(today()); setPeople([]);
        setChild(mode.childId ? [mode.childId] : role === "child" && mode.type === "milestone" ? [me.id] : []);
        setAudience(mode.type === "journal" ? (role === "child" ? "private" : "private") : "family");
      }
    }
  }

  const canAudience = !editing || editing.author === me.id;
  const promptText = editing?.prompt_text ?? (mode.kind === "new" ? mode.promptText : undefined);
  const promptId = mode.kind === "new" ? mode.promptId : undefined;
  const ok = (type === "milestone" ? child.length === 1 && title.trim() : body.trim() || title.trim() || files.length) && !busy;

  async function save() {
    setBusy(true);
    try {
      let id = editing?.id ?? savedId;
      if (editing) {
        const patch: { title: string; body: string; happened_on: string; people: string[]; audience?: string } = { title: title.trim(), body: body.trim(), happened_on: day, people };
        if (canAudience) patch.audience = audience;
        const { error } = await supabase.from("board_memories").update(patch).eq("id", editing.id);
        if (error) throw error;
      } else if (!id) {
        const { data, error } = await supabase.from("board_memories").insert({
          family_id: family.id, kind: type, title: title.trim(), body: body.trim(), happened_on: day, people,
          milestone_for: type === "milestone" ? child[0] : null, prompt_id: promptId ?? null, audience,
        }).select("id").single();
        if (error) throw error;
        id = data.id as string;
        setSavedId(id);
      }
      void refreshBoard(qc, family.id);
      if (files.length && id) {
        uploads.add(files, { kind: "memory", memoryId: id }, { people });
        setFiles([]);
        toast.success("Saved. Adding the photos now");
      } else {
        toast.success("Saved");
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(m: Media) {
    const { error } = await supabase.from("board_media").update({ deleted_at: new Date().toISOString() }).eq("id", m.id);
    if (error) toast.error(friendlyError(error)); else void refreshBoard(qc, family.id);
  }

  const uploading = uploads.list.length > 0;
  const title_ = editing ? "Change this" : type === "milestone" ? "Add a milestone" : type === "journal" ? "Write in your journal" : "Add a memory";

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => { if (!uploads.busy) onOpenChange(o); }}
      title={title_}
      wide
      footer={uploading ? (
        <Button className="h-11 flex-1 rounded-full font-semibold" disabled={uploads.busy} onClick={() => onOpenChange(false)}>
          {uploads.busy ? <><Loader2 className="size-4 animate-spin" /> Adding photos…</> : "Done"}
        </Button>
      ) : (
        <Button className="h-11 flex-1 rounded-full font-semibold" disabled={!ok} onClick={() => void save()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null} Save
        </Button>
      )}
    >
      {uploading ? <div className="mb-4"><UploadList uploads={uploads} /></div> : null}
      <div className="space-y-4">
        {!editing && mode.kind === "new" && mode.type !== "journal" ? (
          <div className="flex flex-wrap gap-2">
            <Chip on={type === "memory"} onClick={() => setType("memory")}>Memory</Chip>
            <Chip on={type === "milestone"} onClick={() => setType("milestone")}>Milestone</Chip>
          </div>
        ) : null}
        {promptText ? <p className="rounded-2xl bg-[var(--status-blue-soft)] p-3 text-base font-semibold">{promptText}</p> : null}
        {type === "milestone" ? (
          <Field label="Whose milestone?">
            <PeoplePicker members={members} value={child} onChange={setChild} single allowNone={false} />
          </Field>
        ) : null}
        {type !== "journal" || !promptText ? (
          <Field label={type === "milestone" ? "What happened?" : "Title (optional)"}>
            <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="h-11" placeholder={type === "milestone" ? "First steps" : "Day at the beach"} />
          </Field>
        ) : null}
        <Field label={promptText ? "Your answer" : "Tell the story"}>
          <Textarea value={body} maxLength={10000} rows={promptText ? 6 : 4} onChange={(e) => setBody(e.target.value)} className="text-base" data-autofocus={promptText ? true : undefined} autoFocus={!!promptText} />
        </Field>
        <Field label="When?">
          <Input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value || today())} className="h-11 w-auto" />
        </Field>
        <Field label="Who was there?" hint="Tagged people get a notification and it joins their memories.">
          <PeoplePicker members={members.filter((m) => m.id !== me.id)} value={people} onChange={setPeople} />
        </Field>
        {canAudience ? (
          <Field label="Who can see it?">
            <div className="flex flex-wrap gap-2">
              <Chip on={audience === "family"} onClick={() => setAudience("family")}>The whole family</Chip>
              <Chip on={audience === "private"} onClick={() => setAudience("private")}>{privateLabel}</Chip>
            </div>
          </Field>
        ) : null}
        <Field label="Photos">
          <input ref={fileInput} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => { setFiles((f) => [...f, ...(e.target.files ?? [])]); e.target.value = ""; }} />
          <div className="flex flex-wrap gap-2">
            {existing.map((m) => (
              <span key={m.id} className="relative size-20 overflow-hidden rounded-xl bg-muted">
                {thumbs.data?.get(m.thumb_path ?? m.path) ? <img src={thumbs.data.get(m.thumb_path ?? m.path)} alt="" className="size-full object-cover" /> : null}
                {m.owner === me.id || role === "parent" ? (
                  <button type="button" onClick={() => void removePhoto(m)} aria-label="Remove photo" className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/60 text-white"><X className="size-4" /></button>
                ) : null}
              </span>
            ))}
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="relative grid size-20 place-items-center overflow-hidden rounded-xl bg-[var(--surface)] p-1 text-center text-[11px]">
                {f.name.slice(0, 18)}
                <button type="button" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label="Don't add this" className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/60 text-white"><X className="size-4" /></button>
              </span>
            ))}
            <button type="button" onClick={() => fileInput.current?.click()} className="grid size-20 place-items-center rounded-xl border-2 border-dashed text-muted-foreground" aria-label="Add photos"><ImagePlus className="size-6" /></button>
          </div>
        </Field>
      </div>
    </Sheet>
  );
}
