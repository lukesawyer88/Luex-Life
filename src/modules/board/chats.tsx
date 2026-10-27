// Chats: the family chat, small groups and one-to-one chats. Parents can also read (not write in) the chats
// of children who let them; children always see when that is on.
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BellOff, Eye, MessageSquarePlus, Pin, Settings2, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useExtra } from "@/lib/extras";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { friendlyError, type Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { EventEditor, type EditorMode } from "@/modules/calendar/event-editor";
import { todayKey } from "@/modules/calendar/time";
import { Chip, PeoplePicker, Sheet } from "@/modules/calendar/ui";

import type { BoardTarget } from "./board-page";
import { Composer } from "./chat-composer";
import { DaySeparator, kindWord, MediaViewer, MessageRow, timeOf, type MessageActions } from "./chat-message";
import {
  refreshBoard, useAllowed, useLists, useMessages, useMySettings, useThreads, type Media, type Message, type ThreadInfo,
} from "./data";
import { removePending, usePending, useOutboxFlush } from "./outbox";

export function threadName(t: ThreadInfo, members: Member[], meId: string): string {
  if (t.kind === "family") return "Family chat";
  if (t.kind === "group") return `${t.emoji ? `${t.emoji} ` : ""}${t.title ?? "Group"}`;
  const others = t.people.filter((p) => p !== meId).map((p) => members.find((m) => m.id === p)?.display_name ?? "Someone");
  if (!t.mine) return t.people.map((p) => members.find((m) => m.id === p)?.display_name ?? "Someone").join(" and ");
  return others[0] ?? "Chat";
}

export function ChatsTab({ target, onGo }: { target: BoardTarget; onGo: (t: BoardTarget) => void }) {
  const { members, me, role } = useFamilyState();
  const desktop = useDesktop();
  const qc = useQueryClient();
  const { family } = useFamilyState();
  const threadsQ = useThreads();
  const threads = useMemo(() => threadsQ.data ?? [], [threadsQ.data]);
  const mySettings = useMySettings();
  const [openId, setOpenId] = useState<string | null>(target.threadId ?? null);
  const [dialog, setDialog] = useState<null | "new" | "settings">(null);
  const onSent = useCallback(() => void refreshBoard(qc, family.id), [qc, family.id]);
  useOutboxFlush(onSent);

  // on a big screen, open the family chat straight away
  useEffect(() => {
    if (!openId && desktop && threads.length) setOpenId(threads[0].id);
  }, [openId, desktop, threads]);

  const open = threads.find((t) => t.id === openId) ?? null;
  const mine = threads.filter((t) => t.mine);
  const watching = threads.filter((t) => !t.mine);
  const parentsRead = role === "child" && mySettings?.parents_can_read;

  const list = (
    <div className="flex h-full flex-col gap-2">
      {parentsRead ? (
        <p className="flex items-center gap-2 rounded-2xl bg-[var(--status-blue-soft)] px-3 py-2 text-sm font-medium"><Eye className="size-4 shrink-0" /> Your parents can read your chats</p>
      ) : null}
      <NewChatButton onClick={() => setDialog("new")} />
      <ul className="space-y-1">
        {mine.map((t) => <ThreadRow key={t.id} t={t} on={t.id === openId} onClick={() => setOpenId(t.id)} />)}
      </ul>
      {watching.length ? (
        <>
          <h3 className="mt-3 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Children's chats (read only)</h3>
          <ul className="space-y-1">
            {watching.map((t) => <ThreadRow key={t.id} t={t} on={t.id === openId} onClick={() => setOpenId(t.id)} />)}
          </ul>
        </>
      ) : null}
      {threadsQ.isLoading ? <p className="px-1 text-sm text-muted-foreground">Loading…</p> : null}
    </div>
  );

  const thread = open ? (
    <ThreadView
      key={open.id}
      thread={open}
      focusMessage={open.id === target.threadId ? target.messageId : undefined}
      onBack={desktop ? undefined : () => setOpenId(null)}
      onSettings={() => setDialog("settings")}
      parentsRead={!!parentsRead}
      onGo={onGo}
    />
  ) : (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">Pick a chat</div>
  );

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      {desktop || !open ? (
        <section className={cn("glass-panel scrollbar-thin min-h-0 overflow-y-auto p-3 sm:p-4", desktop ? "w-80 shrink-0" : "flex-1")}>{list}</section>
      ) : null}
      {desktop || open ? (
        <section className="glass-panel flex min-h-0 min-w-0 flex-1 flex-col p-2 sm:p-3">{thread}</section>
      ) : null}
      <NewChatDialog open={dialog === "new"} onOpenChange={(o) => setDialog(o ? "new" : null)} onOpened={(id) => { setDialog(null); setOpenId(id); }} members={members} meId={me.id} />
      {open ? <ThreadSettingsDialog open={dialog === "settings"} onOpenChange={(o) => setDialog(o ? "settings" : null)} thread={open} onLeft={() => { setDialog(null); setOpenId(null); }} /> : null}
    </div>
  );
}

function NewChatButton({ onClick }: { onClick: () => void }) {
  const can = useAllowed("private_chats");
  if (!can) return null;
  return <Button className="h-11 w-full rounded-full font-semibold" onClick={onClick}><MessageSquarePlus className="size-5" /> New chat</Button>;
}

function ThreadRow({ t, on, onClick }: { t: ThreadInfo; on: boolean; onClick: () => void }) {
  const { members, me, family } = useFamilyState();
  const name = threadName(t, members, me.id);
  const other = t.kind === "direct" ? members.find((m) => m.id === t.people.find((p) => p !== me.id)) : null;
  const today = todayKey(family.timezone);
  const when = t.last_message_at.slice(0, 10) === today ? timeOf(t.last_message_at, family.timezone)
    : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: family.timezone }).format(new Date(t.last_message_at));
  return (
    <li>
      <button type="button" onClick={onClick} aria-current={on}
        className={cn("flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition", on ? "bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "hover:bg-muted")}>
        {other && t.mine ? <MemberAvatar member={other} size="sm" className="ring-1 ring-offset-1" />
          : <span className="grid size-8 place-items-center rounded-full bg-[var(--surface)] text-foreground">{t.kind === "family" ? "🏠" : t.kind === "group" ? (t.emoji || <Users className="size-4" />) : <Eye className="size-4" />}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{name}</span>
          <span className="block text-xs opacity-70">{when}</span>
        </span>
        {t.muted ? <BellOff className="size-4 opacity-60" aria-label="Muted" /> : null}
        {t.unread && t.mine ? <span className="grid min-w-6 place-items-center rounded-full bg-[var(--status-red)] px-1.5 text-xs font-bold text-white">{t.unread > 99 ? "99+" : t.unread}</span> : null}
      </button>
    </li>
  );
}

// ---------------------------------------------------------------- one chat

function ThreadView({
  thread, focusMessage, onBack, onSettings, parentsRead, onGo,
}: {
  thread: ThreadInfo; focusMessage?: string; onBack?: () => void; onSettings: () => void; parentsRead: boolean; onGo: (t: BoardTarget) => void;
}) {
  const { members, me, family } = useFamilyState();
  const qc = useQueryClient();
  const [pages, setPages] = useState(1);
  const q = useMessages(thread.id, pages);
  const data = q.data;
  const pending = usePending(thread.id);
  const scroller = useRef<HTMLDivElement>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [viewing, setViewing] = useState<Media | null>(null);
  const [listFor, setListFor] = useState<Message | null>(null);
  const [calendar, setCalendar] = useState<{ mode: EditorMode; pollId?: string } | null>(null);
  const [highlight, setHighlight] = useState<string | undefined>(focusMessage);
  const readOnly = !thread.mine;
  const people = thread.kind === "family" ? members.filter((m) => m.user_id) : members.filter((m) => thread.people.includes(m.id));
  const lastId = data?.messages.at(-1)?.id;

  // mark as read when opened and when new messages arrive
  useEffect(() => {
    if (!thread.mine || !lastId) return;
    void supabase.rpc("board_mark_read", { p_thread: thread.id }).then(() => void qc.invalidateQueries({ queryKey: ["board", family.id, "threads"] }));
  }, [thread.id, thread.mine, lastId, qc, family.id]);

  // keep the newest message in view (or the one a notification pointed at)
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    if (highlight && scrolledTo.current !== highlight) {
      const el = document.getElementById(`msg-${highlight}`);
      if (el) { el.scrollIntoView({ block: "center" }); scrolledTo.current = highlight; setTimeout(() => setHighlight(undefined), 4000); return; }
    }
    if (pages === 1) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lastId, pending.length, data, highlight, pages]);

  const pinOn = useExtra("board.pin");
  const seenOn = useExtra("board.seen");
  const pinned = (pinOn ? data?.messages ?? [] : []).filter((m) => m.pinned_at && !m.deleted_at).sort((a, b) => (b.pinned_at ?? "").localeCompare(a.pinned_at ?? ""));
  const lastMine = [...(data?.messages ?? [])].reverse().find((m) => m.author === me.id && !m.deleted_at);
  const seenBy = seenOn && lastMine && data
    ? data.state.filter((s) => s.member_id !== me.id && s.last_read_at >= lastMine.created_at).map((s) => members.find((m) => m.id === s.member_id)?.display_name).filter(Boolean)
    : [];

  const actions: MessageActions = {
    onReply: setReplyTo,
    onEdit: setEditing,
    onOpenMedia: setViewing,
    onList: setListFor,
    onCalendar: (m, reminder) => setCalendar({
      mode: { kind: "new", dayK: todayKey(family.timezone), title: (m.body || kindWord(m.kind)).slice(0, 80), type: reminder ? "reminder" : undefined },
    }),
    onPollToCalendar: (m, onDay) => setCalendar({ mode: { kind: "new", dayK: onDay, title: m.body.slice(0, 80) }, pollId: m.id }),
  };

  let lastDay = "";
  const dayLabel = (iso: string) => {
    const k = new Intl.DateTimeFormat("en-CA", { timeZone: family.timezone }).format(new Date(iso));
    const today = todayKey(family.timezone);
    const y = new Date(`${today}T12:00:00`); y.setDate(y.getDate() - 1);
    const yk = new Intl.DateTimeFormat("en-CA").format(y);
    const label = k === today ? "Today" : k === yk ? "Yesterday"
      : new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: family.timezone }).format(new Date(iso));
    if (k === lastDay) return null;
    lastDay = k;
    return label;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-[var(--surface-border)] pb-2">
        {onBack ? <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={onBack} aria-label="Back to chats"><ArrowLeft className="size-5" /></Button> : null}
        <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{threadName(thread, members, me.id)}</h2>
        {thread.mine ? <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={onSettings} aria-label="Chat settings"><Settings2 className="size-5" /></Button> : null}
      </header>
      {readOnly ? <p className="mt-2 flex items-center gap-2 rounded-2xl bg-[var(--status-blue-soft)] px-3 py-2 text-sm"><Eye className="size-4 shrink-0" /> You can read this chat because a child in it lets parents read their chats. You can remove messages but not write here.</p> : null}
      {parentsRead && thread.kind !== "family" ? <p className="mt-2 flex items-center gap-2 rounded-2xl bg-[var(--status-blue-soft)] px-3 py-1.5 text-xs font-medium"><Eye className="size-4 shrink-0" /> Your parents can read your chats</p> : null}
      {pinned.length ? (
        <button type="button" onClick={() => { setHighlight(pinned[0].id); scrolledTo.current = null; }}
          className="mt-2 flex min-h-10 items-center gap-2 rounded-2xl bg-[var(--surface)] px-3 text-left text-sm">
          <Pin className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate"><strong>Pinned:</strong> {pinned[0].body || kindWord(pinned[0].kind)}</span>
          {pinned.length > 1 ? <span className="text-xs text-muted-foreground">+{pinned.length - 1}</span> : null}
        </button>
      ) : null}

      <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-2">
        {data?.hasMore ? (
          <div className="mb-2 text-center"><Button variant="outline" className="h-10 rounded-full" onClick={() => setPages((p) => p + 1)}>Load earlier messages</Button></div>
        ) : null}
        {q.isLoading ? <p className="p-4 text-center text-sm text-muted-foreground">Loading…</p> : null}
        {data && !data.messages.length && !pending.length ? <p className="p-6 text-center text-sm text-muted-foreground">No messages yet. Say hello!</p> : null}
        {data?.messages.map((m) => {
          const label = dayLabel(m.created_at);
          return (
            <div key={m.id}>
              {label ? <DaySeparator>{label}</DaySeparator> : null}
              <MessageRow m={m} data={data} readOnly={readOnly} highlight={highlight === m.id} actions={actions} members={members} canPostHere={thread.mine} />
            </div>
          );
        })}
        {pending.map((p) => (
          <div key={p.clientId} className="flex flex-col items-end px-1 py-1 opacity-60">
            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-[var(--tile-active)] px-3 py-2 text-[15px] text-[var(--tile-active-fg)]">{p.body}</div>
            <span className="flex items-center gap-2 px-2 text-[11px] text-muted-foreground">
              Waiting for signal
              <button type="button" className="underline" onClick={() => removePending(p.clientId)}>Don't send</button>
            </span>
          </div>
        ))}
        {seenBy.length ? <p className="px-3 pt-1 text-right text-[11px] text-muted-foreground">Seen by {seenBy.join(", ")}</p> : null}
      </div>

      {thread.mine ? (
        <Composer thread={thread} people={people} replyTo={replyTo} onClearReply={() => setReplyTo(null)} onSent={() => { scrolledTo.current = null; }} />
      ) : null}

      <EditSheet message={editing} onClose={() => setEditing(null)} />
      <Sheet open={!!viewing} onOpenChange={(o) => !o && setViewing(null)} title={viewing?.kind === "video" ? "Video" : "Photo"} wide>
        {viewing ? <MediaViewer media={viewing} /> : null}
      </Sheet>
      <AddToListSheet message={listFor} onClose={() => setListFor(null)} onOpenLists={() => { setListFor(null); onGo({ tab: "lists" }); }} />
      {calendar ? (
        <EventEditor
          open
          onOpenChange={(o) => { if (!o) setCalendar(null); }}
          mode={calendar.mode}
          onSaved={(ev) => {
            const pollId = calendar.pollId;
            setCalendar(null);
            toast.success("Added to the calendar");
            if (pollId) {
              void supabase.from("board_polls").update({ event_id: ev.id }).eq("message_id", pollId)
                .then(({ error }) => { if (error) toast.error(friendlyError(error)); void refreshBoard(qc, family.id); });
            }
          }}
        />
      ) : null}
    </div>
  );
}

function EditSheet({ message, onClose }: { message: Message | null; onClose: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (message) setBody(message.body); }, [message]);
  async function save() {
    if (!message) return;
    setBusy(true);
    const { error } = await supabase.from("board_messages").update({ body: body.trim() }).eq("id", message.id);
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    void refreshBoard(qc, family.id);
    onClose();
  }
  return (
    <Sheet open={!!message} onOpenChange={(o) => !o && onClose()} title="Edit message"
      footer={<Button className="h-11 flex-1 rounded-full" disabled={busy || !body.trim()} onClick={() => void save()}>Save</Button>}>
      <Textarea value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} className="min-h-32 text-base" data-autofocus />
    </Sheet>
  );
}

function AddToListSheet({ message, onClose, onOpenLists }: { message: Message | null; onClose: () => void; onOpenLists: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const lists = (useLists().data?.lists ?? []).filter((l) => !l.is_template);
  const [text, setText] = useState("");
  useEffect(() => { if (message) setText((message.body || kindWord(message.kind)).slice(0, 300)); }, [message]);
  async function add(listId: string, title: string) {
    const { error } = await supabase.from("board_list_items").insert({ list_id: listId, family_id: family.id, text: text.trim().slice(0, 300), position: Date.now() / 1000 });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(`Added to ${title}`);
    void refreshBoard(qc, family.id);
    onClose();
  }
  return (
    <Sheet open={!!message} onOpenChange={(o) => !o && onClose()} title="Add to a list">
      <label className="mb-3 block space-y-1">
        <span className="text-sm font-semibold">Item</span>
        <Input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} className="h-11" />
      </label>
      {lists.length ? (
        <ul className="space-y-1">
          {lists.map((l) => (
            <li key={l.id}>
              <button type="button" disabled={!text.trim()} onClick={() => void add(l.id, l.title)} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left font-medium hover:bg-muted disabled:opacity-50">
                <span className="text-xl">{l.emoji || (l.kind === "bucket" ? "🪣" : "📝")}</span>{l.title}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-2 text-sm"><p>There are no lists yet.</p><Button variant="outline" className="h-10 rounded-full" onClick={onOpenLists}>Go to lists</Button></div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- starting chats and chat settings

const GROUP_EMOJI = ["👪", "💬", "🎉", "🏡", "⚽", "🎂", "🎁", "🍽️", "✈️", "🧑‍🍳"];

function NewChatDialog({ open, onOpenChange, onOpened, members, meId }: { open: boolean; onOpenChange: (o: boolean) => void; onOpened: (id: string) => void; members: Member[]; meId: string }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [who, setWho] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("💬");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setWho([]); setTitle(""); setEmoji("💬"); } }, [open]);
  const people = members.filter((m) => m.user_id && m.id !== meId);
  const group = who.length > 1;

  async function start() {
    setBusy(true);
    const res = group
      ? await supabase.rpc("board_create_group", { p_title: title.trim(), p_emoji: emoji, p_people: who })
      : await supabase.rpc("board_open_direct", { p_other: who[0] });
    setBusy(false);
    if (res.error) { toast.error(friendlyError(res.error)); return; }
    await refreshBoard(qc, family.id);
    onOpened(res.data as string);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="New chat"
      description="Pick one person for a private chat, or several for a group."
      footer={<Button className="h-11 flex-1 rounded-full" disabled={busy || !who.length || (group && !title.trim())} onClick={() => void start()}>{group ? "Start group" : "Start chat"}</Button>}>
      <div className="space-y-4">
        {people.length ? <PeoplePicker members={people} value={who} onChange={setWho} /> : <p className="text-sm">Invite someone to the family first. They need their own login to chat.</p>}
        {group ? (
          <>
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Group name</span>
              <Input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Parents" className="h-11" />
            </label>
            <div className="flex flex-wrap gap-2">
              {GROUP_EMOJI.map((e) => <Chip key={e} on={emoji === e} onClick={() => setEmoji(e)} className="text-lg">{e}</Chip>)}
            </div>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}

function ThreadSettingsDialog({ open, onOpenChange, thread, onLeft }: { open: boolean; onOpenChange: (o: boolean) => void; thread: ThreadInfo; onLeft: () => void }) {
  const { family, me, members, isParent } = useFamilyState();
  const qc = useQueryClient();
  const [title, setTitle] = useState(thread.title ?? "");
  const [emoji, setEmoji] = useState(thread.emoji ?? "💬");
  const [who, setWho] = useState<string[]>(thread.people);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTitle(thread.title ?? ""); setEmoji(thread.emoji ?? "💬"); setWho(thread.people); } }, [open, thread]);
  const canManage = thread.kind === "group" && (thread.created_by === me.id || isParent);
  const refresh = () => refreshBoard(qc, family.id);

  async function mute(m: boolean) {
    const { error } = await supabase.rpc("board_set_mute", { p_thread: thread.id, p_muted: m });
    if (error) toast.error(friendlyError(error)); else { toast.success(m ? "Muted. You'll still hear when someone mentions you" : "Notifications on"); void refresh(); }
  }
  async function save() {
    setBusy(true);
    const a = await supabase.from("board_threads").update({ title: title.trim(), emoji }).eq("id", thread.id);
    const b = a.error ? a : await supabase.rpc("board_set_group_people", { p_thread: thread.id, p_people: who });
    setBusy(false);
    if (b.error) { toast.error(friendlyError(b.error)); return; }
    toast.success("Saved"); void refresh(); onOpenChange(false);
  }
  async function leave() {
    const { error } = await supabase.rpc("board_leave_group", { p_thread: thread.id });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("You've left the group"); void refresh(); onLeft();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Chat settings"
      footer={canManage ? <Button className="h-11 flex-1 rounded-full" disabled={busy || !title.trim() || who.length < 2} onClick={() => void save()}>Save</Button> : undefined}>
      <div className="space-y-5">
        <div className="space-y-2">
          <h3 className="text-sm font-bold">Notifications</h3>
          <div className="flex flex-wrap gap-2">
            <Chip on={!thread.muted} onClick={() => void mute(false)}>On</Chip>
            <Chip on={thread.muted} onClick={() => void mute(true)}><BellOff className="size-4" /> Muted</Chip>
          </div>
          <p className="text-xs text-muted-foreground">Muted chats stay quiet, but you're still told when someone mentions you or asks where you are.</p>
        </div>
        {thread.kind === "group" ? (
          canManage ? (
            <>
              <label className="block space-y-1">
                <span className="text-sm font-bold">Group name</span>
                <Input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} className="h-11" />
              </label>
              <div className="flex flex-wrap gap-2">{GROUP_EMOJI.map((e) => <Chip key={e} on={emoji === e} onClick={() => setEmoji(e)} className="text-lg">{e}</Chip>)}</div>
              <div className="space-y-2">
                <h3 className="text-sm font-bold">Who's in it</h3>
                <PeoplePicker members={members.filter((m) => m.user_id)} value={who} onChange={setWho} />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-bold">Who's in it</h3>
              <p className="text-sm">{thread.people.map((p) => members.find((m) => m.id === p)?.display_name ?? "Someone").join(", ")}</p>
            </div>
          )
        ) : null}
        {thread.kind === "group" && thread.people.includes(me.id) ? (
          <Button variant="outline" className="h-11 w-full rounded-full text-[var(--status-red)]" onClick={() => void leave()}>Leave this group</Button>
        ) : null}
      </div>
    </Sheet>
  );
}
