// Family lists: everyone sees every list. Ticks update for everyone straight away.
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, CopyPlus, GripVertical, ListChecks, Loader2, MoreHorizontal, PartyPopper, Pencil, Plus,
  ShoppingBasket, Trash2, UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { Chip, Empty, Field, PeoplePicker, Sheet } from "@/modules/calendar/ui";

import type { BoardTarget } from "./board-page";
import { refreshBoard, useLists, type BoardList, type ListItem } from "./data";
import { BUILT_IN_TEMPLATES, type ListTemplate } from "./list-templates";

const EMOJIS = ["📝", "✅", "🏠", "🧹", "🎒", "🌙", "🔧", "🎉", "🌍", "⭐", "🎬", "📚"];

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ListsTab({ target }: { target: BoardTarget; onGo: (t: BoardTarget) => void }) {
  const { family, me, role } = useFamilyState();
  const qc = useQueryClient();
  const desktop = useDesktop();
  const data = useLists();
  const lists = useMemo(() => data.data?.lists ?? [], [data.data]);
  const items = useMemo(() => data.data?.items ?? [], [data.data]);
  const [sel, setSel] = useState<string | null>(target.listId ?? null);
  const [creating, setCreating] = useState<null | { template?: ListTemplate | BoardList }>(null);

  const real = lists.filter((l) => !l.is_template);
  const familyTemplates = lists.filter((l) => l.is_template);
  const chosen = real.find((l) => l.id === sel) ?? (desktop ? real[0] : undefined);
  useEffect(() => { if (target.listId) setSel(target.listId); }, [target.listId]);

  const isAdult = role !== "child";
  const canChangeList = (l: BoardList) => isAdult || l.created_by === me.id;

  const listPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-lg font-bold">Lists</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-10 rounded-full px-4 font-semibold"><Plus className="size-4" /> New list</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onSelect={() => setCreating({})}><Plus className="mr-2 size-4" /> Empty list</DropdownMenuItem>
            <DropdownMenuSeparator />
            <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">From a template</p>
            {BUILT_IN_TEMPLATES.map((t) => (
              <DropdownMenuItem key={t.key} onSelect={() => setCreating({ template: t })}><span className="mr-2">{t.emoji}</span> {t.title}</DropdownMenuItem>
            ))}
            {familyTemplates.map((t) => (
              <DropdownMenuItem key={t.id} onSelect={() => setCreating({ template: t })}><span className="mr-2">{t.emoji ?? "📝"}</span> {t.title} (ours)</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShoppingBasket className="size-4" /> Shopping lists live in Food.</p>
      {data.isLoading ? <Loader2 className="size-5 animate-spin" /> : null}
      {!data.isLoading && real.length === 0 ? (
        <Empty icon={ListChecks} title="No lists yet">Make a list for jobs, plans or a family bucket list. Everyone can see and tick every list.</Empty>
      ) : null}
      <ul className="space-y-1.5">
        {real.map((l) => {
          const its = items.filter((i) => i.list_id === l.id);
          const left = its.filter((i) => !i.done_at).length;
          const on = chosen?.id === l.id;
          return (
            <li key={l.id}>
              <button type="button" onClick={() => setSel(l.id)}
                className={cn("flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left transition", on ? "bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "bg-[var(--surface)] hover:bg-muted")}>
                <span className="text-2xl">{l.emoji ?? (l.kind === "bucket" ? "🌍" : "📝")}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{l.title}</span>
                  <span className={cn("block text-xs", on ? "opacity-80" : "text-muted-foreground")}>
                    {l.kind === "bucket" ? `${its.length - left} of ${its.length} done` : its.length === 0 ? "Empty" : left === 0 ? "All ticked" : `${left} to do`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const detail = chosen ? (
    <ListDetail
      key={chosen.id}
      list={chosen}
      items={items.filter((i) => i.list_id === chosen.id)}
      canChange={canChangeList(chosen)}
      onBack={desktop ? undefined : () => setSel(null)}
    />
  ) : (
    <Empty icon={ListChecks} title="Pick a list">Tap a list to see what's on it.</Empty>
  );

  return (
    <>
      <Windows>
        <RecordsWindow>{!desktop && chosen ? detail : listPanel}</RecordsWindow>
        <DetailWindow>{detail}</DetailWindow>
      </Windows>
      <NewListSheet
        open={!!creating}
        template={creating?.template}
        templateItems={creating?.template && "id" in creating.template ? items.filter((i) => i.list_id === (creating.template as BoardList).id).map((i) => i.text) : undefined}
        onClose={() => setCreating(null)}
        onMade={async (id) => { setCreating(null); await refreshBoard(qc, family.id); setSel(id); }}
      />
    </>
  );
}

// ---------------------------------------------------------------- one list

function ListDetail({ list, items, canChange, onBack }: { list: BoardList; items: ListItem[]; canChange: boolean; onBack?: () => void }) {
  const { family, me, role, members } = useFamilyState();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [editItem, setEditItem] = useState<ListItem | null>(null);
  const [renaming, setRenaming] = useState(false);
  const isAdult = role !== "child";
  const bucket = list.kind === "bucket";
  const ordered = useMemo(() => [...items].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)), [items]);
  const todo = ordered.filter((i) => !i.done_at);
  const done = ordered.filter((i) => i.done_at).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  const canEditItem = (i: ListItem) => isAdult || i.created_by === me.id;
  const refresh = () => refreshBoard(qc, family.id);

  async function add() {
    const t = text.trim();
    if (!t) return;
    setAdding(true);
    const pos = (ordered.length ? Math.max(...ordered.map((i) => i.position)) : 0) + 1;
    const { error } = await supabase.from("board_list_items").insert({ list_id: list.id, family_id: family.id, text: t.slice(0, 300), position: pos });
    setAdding(false);
    if (error) { toast.error(friendlyError(error)); return; }
    setText("");
    await refresh();
  }

  async function tick(i: ListItem) {
    const { error } = await supabase.from("board_list_items").update({ done_at: i.done_at ? null : new Date().toISOString() }).eq("id", i.id);
    if (error) { toast.error(friendlyError(error)); return; }
    if (!i.done_at && bucket) toast.success("We did it! 🎉");
    await refresh();
  }

  async function move(i: ListItem, toIndex: number) {
    const others = todo.filter((x) => x.id !== i.id);
    const idx = Math.max(0, Math.min(others.length, toIndex));
    const before = others[idx - 1]?.position;
    const after = others[idx]?.position;
    const pos = before == null && after == null ? 1 : before == null ? after! - 1 : after == null ? before + 1 : (before + after) / 2;
    if (pos === i.position) return;
    const { error } = await supabase.from("board_list_items").update({ position: pos }).eq("id", i.id);
    if (error) { toast.error(friendlyError(error)); return; }
    await refresh();
  }

  async function reinsert(gone: ListItem[]) {
    for (const g of gone) {
      const { data, error } = await supabase.from("board_list_items")
        .insert({ list_id: g.list_id, family_id: g.family_id, text: g.text, assignee: g.assignee, position: g.position }).select("id").single();
      if (error) { toast.error(friendlyError(error)); continue; }
      if (g.done_at && data) await supabase.from("board_list_items").update({ done_at: new Date().toISOString() }).eq("id", data.id);
    }
    await refresh();
  }

  async function remove(i: ListItem) {
    const { error } = await supabase.from("board_list_items").delete().eq("id", i.id);
    if (error) { toast.error(friendlyError(error)); return; }
    setEditItem(null);
    await refresh();
    toast("Item removed", { action: { label: "Undo", onClick: () => void reinsert([i]) } });
  }

  async function clearTicked() {
    const mine = done.filter(canEditItem);
    if (!mine.length) return;
    const { error } = await supabase.from("board_list_items").delete().in("id", mine.map((i) => i.id));
    if (error) { toast.error(friendlyError(error)); return; }
    await refresh();
    toast(`${mine.length} ticked item${mine.length === 1 ? "" : "s"} cleared`, { action: { label: "Undo", onClick: () => void reinsert(mine) } });
  }

  async function saveAsTemplate() {
    const { data, error } = await supabase.from("board_lists")
      .insert({ family_id: family.id, title: list.title, emoji: list.emoji, kind: list.kind, is_template: true }).select("id").single();
    if (error || !data) { toast.error(friendlyError(error)); return; }
    const rowsToAdd = ordered.map((i, n) => ({ list_id: data.id, family_id: family.id, text: i.text, position: n + 1 }));
    if (rowsToAdd.length) {
      const { error: e2 } = await supabase.from("board_list_items").insert(rowsToAdd);
      if (e2) { toast.error(friendlyError(e2)); return; }
    }
    await refresh();
    toast.success("Saved as a template. Find it under New list");
  }

  async function archive() {
    const { error } = await supabase.from("board_lists").update({ archived_at: new Date().toISOString() }).eq("id", list.id);
    if (error) { toast.error(friendlyError(error)); return; }
    await refresh();
    onBack?.();
    toast("List removed", {
      action: { label: "Undo", onClick: async () => { await supabase.from("board_lists").update({ archived_at: null }).eq("id", list.id); await refresh(); } },
    });
  }

  // drag to reorder (handle only)
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null);
  function onHandleDown(e: React.PointerEvent, i: ListItem) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: i.id, over: todo.findIndex((x) => x.id === i.id) });
  }
  function onHandleMove(e: React.PointerEvent) {
    if (!drag) return;
    const others = todo.filter((x) => x.id !== drag.id);
    let over = others.length;
    for (let n = 0; n < others.length; n++) {
      const r = rowRefs.current.get(others[n].id)?.getBoundingClientRect();
      if (r && e.clientY < r.top + r.height / 2) { over = n; break; }
    }
    if (over !== drag.over) setDrag({ ...drag, over });
  }
  function onHandleUp() {
    if (!drag) return;
    const i = todo.find((x) => x.id === drag.id);
    const to = drag.over;
    setDrag(null);
    if (i) void move(i, to);
  }

  const rowFor = (i: ListItem, n: number, isDone: boolean) => {
    const who = members.find((m) => m.id === i.assignee);
    const ticker = members.find((m) => m.id === i.done_by);
    return (
      <li
        key={i.id}
        ref={(el) => { if (el) rowRefs.current.set(i.id, el); else rowRefs.current.delete(i.id); }}
        className={cn("flex min-h-14 items-center gap-2 rounded-2xl bg-[var(--surface)] px-2", drag?.id === i.id && "opacity-60 ring-2 ring-[var(--tile-active)]")}
      >
        {!isDone ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Drag to reorder"
            className="grid size-9 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground"
            onPointerDown={(e) => onHandleDown(e, i)}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={() => setDrag(null)}
          >
            <GripVertical className="size-5" />
          </span>
        ) : null}
        <button type="button" onClick={() => tick(i)} aria-pressed={isDone} aria-label={isDone ? `Untick ${i.text}` : `Tick ${i.text}`}
          className={cn("grid size-9 shrink-0 place-items-center rounded-full border-2", isDone ? "border-transparent bg-[var(--status-green)] text-white" : "border-[var(--surface-border)]")}>
          {isDone ? <Check className="size-5" /> : null}
        </button>
        <div className="min-w-0 flex-1 py-1.5">
          <p className={cn("break-words font-medium", isDone && !bucket && "text-muted-foreground line-through")}>{i.text}</p>
          {isDone && i.done_at ? (
            <p className="text-xs text-muted-foreground">
              {bucket ? `We did it! ${shortDate(i.done_at)}` : `Ticked${ticker ? ` by ${ticker.display_name}` : ""}`}
            </p>
          ) : null}
        </div>
        {who ? <MemberAvatar member={who} size="sm" className="size-7 shrink-0 text-[10px] ring-0 ring-offset-0" /> : null}
        {!isDone ? (
          <span className="hidden flex-col sm:flex">
            <button type="button" aria-label={`Move ${i.text} up`} disabled={n === 0} onClick={() => move(i, n - 1)} className="grid h-5 w-7 place-items-center text-muted-foreground disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
            <button type="button" aria-label={`Move ${i.text} down`} disabled={n === todo.length - 1} onClick={() => move(i, n + 1)} className="grid h-5 w-7 place-items-center text-muted-foreground disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
          </span>
        ) : null}
        <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" aria-label={`More for ${i.text}`} onClick={() => setEditItem(i)}><MoreHorizontal className="size-5" /></Button>
      </li>
    );
  };

  // show the drop gap while dragging
  const todoShown = drag ? (() => {
    const others = todo.filter((x) => x.id !== drag.id);
    const dragged = todo.find((x) => x.id === drag.id)!;
    return [...others.slice(0, drag.over), dragged, ...others.slice(drag.over)];
  })() : todo;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {onBack ? <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={onBack} aria-label="Back to lists"><ArrowLeft className="size-5" /></Button> : null}
        <span className="text-2xl">{list.emoji ?? (bucket ? "🌍" : "📝")}</span>
        <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{list.title}</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-10 rounded-full" aria-label="List options"><MoreHorizontal className="size-5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {canChange ? <DropdownMenuItem onSelect={() => setRenaming(true)}><Pencil className="mr-2 size-4" /> Rename</DropdownMenuItem> : null}
            <DropdownMenuItem onSelect={saveAsTemplate}><CopyPlus className="mr-2 size-4" /> Save as a template</DropdownMenuItem>
            {!bucket && done.some(canEditItem) ? <DropdownMenuItem onSelect={clearTicked}><Check className="mr-2 size-4" /> Clear ticked</DropdownMenuItem> : null}
            {canChange ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={archive} className="text-[var(--status-red)]"><Trash2 className="mr-2 size-4" /> Remove list</DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={bucket ? "Something we want to do together" : "Add something"} className="h-12 text-base" aria-label="New item" />
        <Button type="submit" className="h-12 rounded-full px-5 font-semibold" disabled={adding || !text.trim()}>{adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add</Button>
      </form>

      {todo.length === 0 && done.length === 0 ? <p className="text-sm text-muted-foreground">Nothing on this list yet.</p> : null}
      <ul className="space-y-1.5" onPointerMove={onHandleMove}>{todoShown.map((i, n) => rowFor(i, n, false))}</ul>

      {done.length ? (
        <div>
          <h3 className="mb-1.5 flex items-center gap-2 text-sm font-bold text-muted-foreground">
            {bucket ? <><PartyPopper className="size-4" /> We did it!</> : `Ticked (${done.length})`}
          </h3>
          <ul className="space-y-1.5">{done.map((i, n) => rowFor(i, n, true))}</ul>
        </div>
      ) : null}

      <ItemSheet item={editItem} canEdit={!!editItem && canEditItem(editItem)} canAssign={isAdult || (!!editItem && editItem.created_by === me.id)}
        onClose={() => setEditItem(null)} onRemove={remove} onSaved={refresh} />
      <RenameSheet open={renaming} list={list} onClose={() => setRenaming(false)} onSaved={refresh} />
    </div>
  );
}

function ItemSheet({ item, canEdit, canAssign, onClose, onRemove, onSaved }: {
  item: ListItem | null; canEdit: boolean; canAssign: boolean; onClose: () => void; onRemove: (i: ListItem) => void; onSaved: () => Promise<unknown>;
}) {
  const { members } = useFamilyState();
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState<string[]>([]);
  const [seen, setSeen] = useState<ListItem | null>(null);
  const [busy, setBusy] = useState(false);
  if (item !== seen) { setSeen(item); setText(item?.text ?? ""); setAssignee(item?.assignee ? [item.assignee] : []); }

  async function save() {
    if (!item || !text.trim()) return;
    setBusy(true);
    const patch: { text?: string; assignee?: string | null } = {};
    if (canEdit && text.trim() !== item.text) patch.text = text.trim();
    if (canAssign && (assignee[0] ?? null) !== item.assignee) patch.assignee = assignee[0] ?? null;
    const { error } = Object.keys(patch).length ? await supabase.from("board_list_items").update(patch).eq("id", item.id) : { error: null };
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    await onSaved();
    onClose();
  }

  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()} title="Item"
      footer={
        <>
          {item && canEdit ? <Button variant="ghost" className="h-11 rounded-full text-[var(--status-red)]" onClick={() => onRemove(item)}><Trash2 className="size-4" /> Remove</Button> : null}
          <span className="flex-1" />
          <Button className="h-11 rounded-full px-6 font-semibold" onClick={save} disabled={busy || (!canEdit && !canAssign)}>{busy ? <Loader2 className="size-4 animate-spin" /> : null} Save</Button>
        </>
      }>
      <div className="space-y-4">
        <Field label="What">
          <Input value={text} onChange={(e) => setText(e.target.value)} disabled={!canEdit} className="h-12 text-base" />
          {!canEdit ? <p className="text-xs text-muted-foreground">Only a grown-up or whoever added it can change this.</p> : null}
        </Field>
        <Field label={<span className="flex items-center gap-2"><UserRound className="size-4" /> Give it to</span>} hint="Everyone still sees it.">
          {canAssign ? <PeoplePicker members={members} value={assignee} onChange={setAssignee} single /> : <p className="text-sm text-muted-foreground">{members.find((m) => m.id === item?.assignee)?.display_name ?? "Nobody"}</p>}
        </Field>
      </div>
    </Sheet>
  );
}

function RenameSheet({ open, list, onClose, onSaved }: { open: boolean; list: BoardList; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [title, setTitle] = useState(list.title);
  const [emoji, setEmoji] = useState(list.emoji ?? "📝");
  useEffect(() => { if (open) { setTitle(list.title); setEmoji(list.emoji ?? "📝"); } }, [open, list]);
  async function save() {
    const { error } = await supabase.from("board_lists").update({ title: title.trim().slice(0, 80), emoji }).eq("id", list.id);
    if (error) { toast.error(friendlyError(error)); return; }
    await onSaved();
    onClose();
  }
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Rename list"
      footer={<><span className="flex-1" /><Button className="h-11 rounded-full px-6 font-semibold" onClick={save} disabled={!title.trim()}>Save</Button></>}>
      <div className="space-y-4">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-12 text-base" aria-label="List name" />
        <EmojiPick value={emoji} onChange={setEmoji} />
      </div>
    </Sheet>
  );
}

function EmojiPick({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {EMOJIS.map((e) => (
        <button key={e} type="button" aria-pressed={value === e} onClick={() => onChange(e)}
          className={cn("grid size-11 place-items-center rounded-full text-xl", value === e ? "bg-[var(--tile-active)]" : "bg-[var(--surface)]")}>{e}</button>
      ))}
    </div>
  );
}

function NewListSheet({ open, template, templateItems, onClose, onMade }: {
  open: boolean; template?: ListTemplate | BoardList; templateItems?: string[]; onClose: () => void; onMade: (id: string) => void;
}) {
  const { family } = useFamilyState();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("📝");
  const [kind, setKind] = useState<"list" | "bucket">("list");
  const [busy, setBusy] = useState(false);
  const startItems = template ? ("items" in template ? template.items : templateItems ?? []) : [];
  useEffect(() => {
    if (!open) return;
    setTitle(template?.title ?? "");
    setEmoji(template?.emoji ?? "📝");
    setKind(template && "kind" in template && template.kind === "bucket" ? "bucket" : "list");
  }, [open, template]);

  async function make() {
    setBusy(true);
    try {
      const { data, error } = await supabase.from("board_lists")
        .insert({ family_id: family.id, title: title.trim().slice(0, 80), emoji, kind }).select("id").single();
      if (error || !data) throw error;
      if (startItems.length) {
        const { error: e2 } = await supabase.from("board_list_items")
          .insert(startItems.map((t, n) => ({ list_id: data.id, family_id: family.id, text: t, position: n + 1 })));
        if (e2) throw e2;
      }
      onMade(data.id);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={template ? `New list: ${template.title}` : "New list"}
      footer={<><span className="flex-1" /><Button className="h-11 rounded-full px-6 font-semibold" onClick={make} disabled={busy || !title.trim()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Make list</Button></>}>
      <div className="space-y-4">
        <Field label="Name"><Input data-autofocus autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Jobs this weekend" className="h-12 text-base" /></Field>
        <Field label="Kind of list">
          <div className="flex flex-wrap gap-1.5">
            <Chip on={kind === "list"} onClick={() => setKind("list")}>Ordinary list</Chip>
            <Chip on={kind === "bucket"} onClick={() => { setKind("bucket"); if (emoji === "📝") setEmoji("🌍"); if (!title) setTitle("Family bucket list"); }}>🌍 Family bucket list</Chip>
          </div>
        </Field>
        <Field label="Picture"><EmojiPick value={emoji} onChange={setEmoji} /></Field>
        {startItems.length ? (
          <Field label={`Starts with ${startItems.length} items`}>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">{startItems.map((t) => <li key={t}>{t}</li>)}</ul>
          </Field>
        ) : null}
      </div>
    </Sheet>
  );
}
