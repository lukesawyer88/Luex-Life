// Journal and memories: family memories with photos, milestones for each child (with their age),
// children's daily questions, the free year book and downloading everything.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, Download, Footprints, HelpCircle, Lock, MoreHorizontal, NotebookPen, Pencil, Plus, Sparkles, Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { Chip, Empty, Sheet } from "@/modules/calendar/ui";

import type { BoardTarget } from "./board-page";
import {
  ageOn, boardKey, refreshBoard, rows, useAlbums, useFileUrls, useMemories, usePrompts, useTodaysPrompt, type Media, type Memory,
} from "./data";
import { MemoryEditor, usePrivateLabel, type EditorMode } from "./journal-editor";
import { ExportSheet } from "./journal-export";
import { PromptsSheet } from "./journal-prompts";
import { MediaViewer } from "./photos";

type View = "memories" | "milestones" | "journal";

const LONG = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
const MONTH = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

/** Photos attached to memories I can see */
function useMemoryMedia() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: boardKey(family.id, "memory-media"),
    queryFn: () => rows<Media>(supabase.from("board_media").select("*").eq("family_id", family.id).not("memory_id", "is", null).is("deleted_at", null).order("created_at")),
  });
}

export function JournalTab({ target }: { target: BoardTarget; onGo: (t: BoardTarget) => void }) {
  const { family, members, me, role, isParent } = useFamilyState();
  const desktop = useDesktop();
  const qc = useQueryClient();
  const memories = useMemories();
  const media = useMemoryMedia();
  const prompts = usePrompts();
  const todays = useTodaysPrompt();
  const privateLabel = usePrivateLabel();
  const [view, setView] = useState<View>(target.promptId || role === "child" ? "journal" : "memories");
  const [openId, setOpenId] = useState<string | null>(target.memoryId ?? null);
  const [editor, setEditor] = useState<{ open: boolean; mode: EditorMode }>({ open: false, mode: { kind: "new", type: "memory" } });
  const [sheet, setSheet] = useState<null | "prompts" | "book" | "zip">(null);
  const [childSel, setChildSel] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ items: Media[]; index: number } | null>(null);
  const albums = useAlbums();

  const all = memories.data ?? [];
  const byMemory = useMemo(() => {
    const m = new Map<string, Media[]>();
    for (const x of media.data ?? []) if (x.memory_id) m.set(x.memory_id, [...(m.get(x.memory_id) ?? []), x]);
    return m;
  }, [media.data]);
  const thumbs = useFileUrls((media.data ?? []).map((x) => x.thumb_path ?? x.path));

  // the question from a notification link, else today's
  const asked = target.promptId ? (prompts.data ?? []).find((p) => p.id === target.promptId) : null;
  const question = asked ? { id: asked.id, text: asked.text } : todays.data ? { id: todays.data.prompt_id, text: todays.data.text } : null;
  const answered = question ? all.some((m) => m.prompt_id === question.id && m.author === me.id && m.happened_on === new Date().toISOString().slice(0, 10)) : false;

  // open a memory from a link once it has loaded
  useEffect(() => {
    if (!target.memoryId) return;
    const m = all.find((x) => x.id === target.memoryId);
    if (m) setView(m.kind === "milestone" ? "milestones" : m.kind === "journal" ? "journal" : "memories");
  }, [target.memoryId, all]);

  const list = useMemo(() => {
    if (view === "memories") return all.filter((m) => m.kind === "memory");
    if (view === "journal") return all.filter((m) => m.kind === "journal");
    return all.filter((m) => m.kind === "milestone" && (!childSel || m.milestone_for === childSel));
  }, [all, view, childSel]);
  const milestonePeople = members.filter((m) => m.role === "child" || all.some((x) => x.milestone_for === m.id));
  const open = all.find((m) => m.id === openId) ?? null;

  const add = (mode: EditorMode) => setEditor({ open: true, mode });

  async function remove(m: Memory) {
    const { error } = await supabase.from("board_memories").update({ deleted_at: new Date().toISOString() }).eq("id", m.id);
    if (error) { toast.error(friendlyError(error)); return; }
    setOpenId(null);
    void refreshBoard(qc, family.id);
    toast.success("Removed", {
      action: { label: "Undo", onClick: () => { void supabase.from("board_memories").update({ deleted_at: null }).eq("id", m.id).then(() => refreshBoard(qc, family.id)); } },
    });
  }

  const detail = open ? (
    <MemoryDetail
      memory={open}
      media={byMemory.get(open.id) ?? []}
      thumbs={thumbs.data}
      onEdit={() => add({ kind: "edit", memory: open })}
      onRemove={() => void remove(open)}
      onPhoto={(i) => setViewer({ items: byMemory.get(open.id) ?? [], index: i })}
    />
  ) : (
    <div className="space-y-3 text-sm">
      <h3 className="font-bold">Journal and memories</h3>
      <p className="text-muted-foreground">Memories and milestones are shared with the family unless you choose otherwise. Tag who was there and they'll get a notification.</p>
      <Button variant="outline" className="h-11 w-full rounded-full" onClick={() => setSheet("book")}><BookOpen className="size-4" /> Make a year book (free PDF)</Button>
      <p className="text-xs text-muted-foreground">Printed books are coming soon.</p>
    </div>
  );

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Chip on={view === "memories"} onClick={() => setView("memories")}><Sparkles className="size-4" /> Memories</Chip>
            <Chip on={view === "milestones"} onClick={() => setView("milestones")}><Footprints className="size-4" /> Milestones</Chip>
            <Chip on={view === "journal"} onClick={() => setView("journal")}><NotebookPen className="size-4" /> Journal</Chip>
          </div>
          <div className="flex-1" />
          <Button
            className="h-11 rounded-full px-4 font-semibold"
            onClick={() => add({ kind: "new", type: view === "milestones" ? "milestone" : view === "journal" ? "journal" : "memory", childId: view === "milestones" ? childSel ?? undefined : undefined })}
          >
            <Plus className="size-4" /> {view === "milestones" ? "Milestone" : view === "journal" ? "Write" : "Memory"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label="More journal options"><MoreHorizontal className="size-5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {isParent ? <DropdownMenuItem onSelect={() => setSheet("prompts")}><HelpCircle className="mr-2 size-4" /> Journal questions</DropdownMenuItem> : null}
              <DropdownMenuItem onSelect={() => setSheet("book")}><BookOpen className="mr-2 size-4" /> Year book (free PDF)</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSheet("zip")}><Download className="mr-2 size-4" /> Download everything</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {view === "milestones" ? (
          <div className="scrollbar-none -mx-1 flex shrink-0 gap-1.5 overflow-x-auto px-1 pb-0.5">
            <Chip on={!childSel} onClick={() => setChildSel(null)} className="shrink-0">Everyone</Chip>
            {milestonePeople.map((m) => (
              <Chip key={m.id} on={childSel === m.id} onClick={() => setChildSel(m.id)} className="shrink-0">
                <MemberAvatar member={m} size="sm" className="size-6 text-[10px] ring-0 ring-offset-0" /> {m.display_name}
              </Chip>
            ))}
          </div>
        ) : null}

        {view === "journal" ? (
          <div className="space-y-2">
            {question ? (
              <div className="rounded-2xl bg-[var(--status-blue-soft)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--status-blue)]">{asked && asked.id !== todays.data?.prompt_id ? "Question" : "Today's question"}</p>
                <p className="mt-1 text-lg font-bold">{question.text}</p>
                {answered ? <p className="mt-2 text-sm">You've answered today. Well done!</p> : (
                  <Button className="mt-3 h-12 rounded-full px-5 text-base font-semibold" onClick={() => add({ kind: "new", type: "journal", promptId: question.id, promptText: question.text })}>
                    <Pencil className="size-4" /> Answer it
                  </Button>
                )}
              </div>
            ) : null}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> Journal entries are private to {privateLabel === "Only me" ? "you" : "you and your parents"} unless you share them with the family.
            </p>
          </div>
        ) : null}

        <div className="min-h-0 flex-1">
          {memories.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : list.length === 0 ? (
            <Empty icon={view === "milestones" ? Footprints : view === "journal" ? NotebookPen : Sparkles} title={view === "milestones" ? "No milestones yet" : view === "journal" ? "Nothing written yet" : "No memories yet"}>
              {view === "milestones" ? "First steps, first words, first day at school: add them here and see how old they were." : view === "journal" ? "Write about your day, or answer a question." : "Add a day out, a funny moment or a big event, with photos."}
            </Empty>
          ) : (
            <MemoryList
              list={list}
              byMemory={byMemory}
              thumbs={thumbs.data}
              selected={openId}
              onOpen={setOpenId}
            />
          )}
        </div>
      </RecordsWindow>
      <DetailWindow>{detail}</DetailWindow>

      {!desktop ? (
        <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)} title={open ? memoryHeading(open, members) : ""}>
          {open ? detail : null}
        </Sheet>
      ) : null}

      <MemoryEditor open={editor.open} onOpenChange={(o) => setEditor((x) => ({ ...x, open: o }))} mode={editor.mode} media={media.data ?? []} />
      {isParent ? <PromptsSheet open={sheet === "prompts"} onOpenChange={(o) => !o && setSheet(null)} /> : null}
      <ExportSheet open={sheet === "book" || sheet === "zip"} start={sheet === "book" ? "book" : "zip"} onOpenChange={(o) => !o && setSheet(null)} />
      {viewer ? <MediaViewer items={viewer.items} index={viewer.index} onIndex={(i) => setViewer({ ...viewer, index: i })} onClose={() => setViewer(null)} albums={albums.data ?? []} /> : null}
    </Windows>
  );
}

function memoryHeading(m: Memory, members: { id: string; display_name: string; birthday: string | null }[]): string {
  if (m.kind === "milestone") {
    const p = members.find((x) => x.id === m.milestone_for);
    return `${p?.display_name ?? ""}: ${m.title}`;
  }
  return m.title || m.prompt_text || (m.kind === "journal" ? "Journal" : "Memory");
}

function MemoryList({ list, byMemory, thumbs, selected, onOpen }: {
  list: Memory[]; byMemory: Map<string, Media[]>; thumbs?: Map<string, string>; selected: string | null; onOpen: (id: string) => void;
}) {
  const { members } = useFamilyState();
  const groups: { label: string; items: Memory[] }[] = [];
  for (const m of list) {
    const label = MONTH(m.happened_on);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(m); else groups.push({ label, items: [m] });
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.label}>
          <h3 className="mb-2 text-sm font-bold">{g.label}</h3>
          <ul className="space-y-2">
            {g.items.map((m) => {
              const pics = byMemory.get(m.id) ?? [];
              const author = members.find((x) => x.id === m.author);
              const kid = members.find((x) => x.id === m.milestone_for);
              const age = m.kind === "milestone" && kid ? ageOn(kid.birthday, m.happened_on) : null;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(m.id)}
                    className={cn("w-full rounded-2xl bg-[var(--surface)] p-3 text-left transition hover:bg-muted", selected === m.id && "ring-2 ring-[var(--status-blue)]")}
                  >
                    <div className="flex items-start gap-3">
                      {m.kind === "milestone" && kid ? <MemberAvatar member={kid} size="sm" /> : author ? <MemberAvatar member={author} size="sm" /> : null}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          {LONG(m.happened_on)}
                          {age ? ` · ${kid?.display_name} was ${/^\d+$/.test(age) ? `${age}` : age}` : ""}
                          {m.audience === "private" ? " · private" : ""}
                        </p>
                        <p className="font-semibold">{m.kind === "milestone" ? m.title : m.title || m.prompt_text || (m.body ? "" : "Photos")}</p>
                        {m.body ? <p className="line-clamp-2 text-sm text-muted-foreground">{m.body}</p> : null}
                        {pics.length ? (
                          <div className="mt-2 flex gap-1">
                            {pics.slice(0, 4).map((p) => (
                              <span key={p.id} className="size-14 overflow-hidden rounded-lg bg-muted">
                                {thumbs?.get(p.thumb_path ?? p.path) ? <img src={thumbs.get(p.thumb_path ?? p.path)} alt="" loading="lazy" className="size-full object-cover" /> : null}
                              </span>
                            ))}
                            {pics.length > 4 ? <span className="grid size-14 place-items-center rounded-lg bg-muted text-sm font-semibold">+{pics.length - 4}</span> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MemoryDetail({ memory: m, media, thumbs, onEdit, onRemove, onPhoto }: {
  memory: Memory; media: Media[]; thumbs?: Map<string, string>; onEdit: () => void; onRemove: () => void; onPhoto: (i: number) => void;
}) {
  const { members, me, isParent } = useFamilyState();
  const author = members.find((x) => x.id === m.author);
  const kid = members.find((x) => x.id === m.milestone_for);
  const age = kid ? ageOn(kid.birthday, m.happened_on) : null;
  const who = members.filter((x) => m.people.includes(x.id));
  const canChange = m.author === me.id || isParent;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{LONG(m.happened_on)}{m.audience === "private" ? " · private" : ""}</p>
      <h3 className="text-lg font-bold">
        {m.kind === "milestone" ? `${kid?.display_name ?? ""}: ${m.title}` : m.title || m.prompt_text || (m.kind === "journal" ? "Journal" : "Memory")}
      </h3>
      {age ? <p className="inline-flex rounded-full bg-[var(--status-green-soft)] px-3 py-1 text-sm font-semibold text-[var(--status-green)]">{kid?.display_name} was {age}</p> : null}
      {m.prompt_text && m.title ? <p className="text-sm font-semibold">{m.prompt_text}</p> : null}
      {m.body ? <p className="whitespace-pre-wrap text-sm">{m.body}</p> : null}
      {media.length ? (
        <div className="grid grid-cols-3 gap-1">
          {media.map((p, i) => (
            <button key={p.id} type="button" onClick={() => onPhoto(i)} className="aspect-square overflow-hidden rounded-lg bg-muted" aria-label="Open photo">
              {thumbs?.get(p.thumb_path ?? p.path) ? <img src={thumbs.get(p.thumb_path ?? p.path)} alt="" className="size-full object-cover" /> : null}
            </button>
          ))}
        </div>
      ) : null}
      {who.length ? (
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Who was there</p>
          <div className="flex flex-wrap gap-2">
            {who.map((p) => <span key={p.id} className="flex items-center gap-1.5 text-sm"><MemberAvatar member={p} size="sm" className="size-7 ring-0 ring-offset-0" /> {p.display_name}</span>)}
          </div>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">Added by {author?.display_name ?? "someone"}</p>
      {canChange ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" className="h-11 rounded-full px-4" onClick={onEdit}><Pencil className="size-4" /> Change</Button>
          <Button variant="outline" className="h-11 rounded-full px-4 text-[var(--status-red)]" onClick={onRemove}><Trash2 className="size-4" /> Remove</Button>
        </div>
      ) : null}
    </div>
  );
}
