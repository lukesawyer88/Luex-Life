// One message in a chat: the words or the photo, poll, place, announcement or shout-out, plus reactions
// and the actions menu.
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3, CalendarPlus, Check, Copy, CornerUpLeft, Download, ListPlus, MapPin, Megaphone, MoreHorizontal, Pencil, Pin,
  PinOff, RotateCcw, Star, Trash2, BellRing,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { friendlyError, type Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

import {
  cantPlay, clientId, downloadOriginal, refreshBoard, useAllowed, useFileUrl, useFileUrls, type Media, type Message,
  type ThreadData,
} from "./data";

export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

export const STICKERS: Record<string, string> = {
  heart: "❤️", party: "🎉", hug: "🤗", star: "🌟", thumbs: "👍", laugh: "😂", love: "🥰", cake: "🎂", sun: "☀️",
  rainbow: "🌈", dog: "🐶", cat: "🐱", unicorn: "🦄", rocket: "🚀", trophy: "🏆", flower: "🌸", pizza: "🍕",
  sleep: "😴", wave: "👋", kiss: "😘", clap: "👏", muscle: "💪", ghost: "👻", dino: "🦖",
};

export type MessageActions = {
  onReply: (m: Message) => void;
  onEdit: (m: Message) => void;
  onCalendar: (m: Message, reminder: boolean) => void;
  onList: (m: Message) => void;
  onOpenMedia: (md: Media) => void;
  onPollToCalendar: (m: Message, onDay: string) => void;
};

export function timeOf(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
}

export function MessageRow({
  m, data, readOnly, highlight, actions, members, canPostHere,
}: {
  m: Message; data: ThreadData; readOnly: boolean; highlight: boolean; actions: MessageActions; members: Member[]; canPostHere: boolean;
}) {
  const { me, isParent, family } = useFamilyState();
  const qc = useQueryClient();
  const mine = m.author === me.id;
  const author = members.find((x) => x.id === m.author);
  const replyTo = m.reply_to ? data.messages.find((x) => x.id === m.reply_to) : null;
  const replyAuthor = replyTo ? members.find((x) => x.id === replyTo.author) : null;
  const removed = !!m.deleted_at;
  const reactions = data.reactions.filter((r) => r.message_id === m.id);
  const grouped = REACTIONS.concat([...new Set(reactions.map((r) => r.emoji))].filter((e) => !REACTIONS.includes(e)))
    .map((e) => ({ e, who: reactions.filter((r) => r.emoji === e) }))
    .filter((g) => g.who.length);
  const refresh = () => void refreshBoard(qc, family.id);

  async function run(fn: () => PromiseLike<{ error: unknown }>, ok?: string) {
    const { error } = await fn();
    if (error) toast.error(friendlyError(error));
    else { if (ok) toast.success(ok); refresh(); }
  }

  async function toggleReaction(e: string) {
    const own = reactions.find((r) => r.member_id === me.id && r.emoji === e);
    if (own) await run(() => supabase.from("board_reactions").delete().eq("id", own.id));
    else await run(() => supabase.from("board_reactions").insert({ message_id: m.id, member_id: me.id, family_id: family.id, emoji: e }));
  }

  async function remove() {
    const { error } = await supabase.from("board_messages").update({ deleted_at: new Date().toISOString() }).eq("id", m.id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
    toast("Message removed", {
      action: { label: "Undo", onClick: () => void run(() => supabase.from("board_messages").update({ deleted_at: null }).eq("id", m.id)) },
    });
  }

  const canEdit = mine && !removed && ["text", "announcement", "kudos"].includes(m.kind);
  const canRemove = !removed && (mine || isParent);
  const canRestore = removed && (m.deleted_by === me.id || isParent);
  const text = m.body;

  return (
    <div id={`msg-${m.id}`} className={cn("group flex gap-2 px-1 py-1", mine ? "flex-row-reverse" : "", highlight && "rounded-2xl bg-[var(--status-amber-soft)]")}>
      {!mine ? (author ? <MemberAvatar member={author} size="sm" className="mt-5 shrink-0 ring-1 ring-offset-1" /> : <span className="size-8 shrink-0" />) : null}
      <div className={cn("flex min-w-0 max-w-[85%] flex-col", mine ? "items-end" : "items-start")}>
        {!mine ? <span className="px-2 text-xs font-semibold text-muted-foreground">{author?.display_name ?? "Someone"}</span> : null}
        <div className={cn("flex items-start gap-1", mine ? "flex-row-reverse" : "")}>
          <div
            className={cn(
              "min-w-0 rounded-2xl px-3 py-2 text-[15px] leading-snug",
              removed ? "border border-dashed border-[var(--surface-border)] bg-transparent italic text-muted-foreground"
              : m.kind === "sticker" ? "bg-transparent px-0 py-0"
              : m.kind === "announcement" ? "border-2 border-[var(--status-amber)] bg-[var(--status-amber-soft)]"
              : m.kind === "kudos" ? "border-2 border-[var(--status-green)] bg-[var(--status-green-soft)]"
              : mine ? "bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "bg-[var(--surface)]",
            )}
          >
            {replyTo && !removed ? (
              <button type="button" onClick={() => document.getElementById(`msg-${replyTo.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                className="mb-1 block w-full rounded-lg border-l-4 border-[var(--status-blue)] bg-black/5 px-2 py-1 text-left text-xs">
                <span className="font-semibold">{replyAuthor?.display_name ?? "Someone"}</span>
                <span className="line-clamp-2 opacity-80">{replyTo.deleted_at ? "Message removed" : replyTo.body || kindWord(replyTo.kind)}</span>
              </button>
            ) : null}
            {removed ? (
              <span>{m.deleted_by && m.deleted_by !== m.author ? "Removed by a parent" : "Message removed"}</span>
            ) : (
              <Body m={m} data={data} members={members} actions={actions} readOnly={readOnly || !canPostHere} />
            )}
            {m.pinned_at && !removed ? <span className="mt-1 flex items-center gap-1 text-[11px] opacity-70"><Pin className="size-3" /> Pinned</span> : null}
          </div>
          {!readOnly || canRemove || canRestore ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Message options" className="mt-1 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={mine ? "end" : "start"} className="w-60">
                {!readOnly && !removed ? (
                  <>
                    <div className="flex justify-between px-1 py-1">
                      {REACTIONS.map((e) => (
                        <button key={e} type="button" className="grid size-9 place-items-center rounded-full text-xl hover:bg-muted" aria-label={`React ${e}`} onClick={() => void toggleReaction(e)}>{e}</button>
                      ))}
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => actions.onReply(m)}><CornerUpLeft className="mr-2 size-4" /> Reply</DropdownMenuItem>
                    {canEdit ? <DropdownMenuItem onSelect={() => actions.onEdit(m)}><Pencil className="mr-2 size-4" /> Edit</DropdownMenuItem> : null}
                    <DropdownMenuItem onSelect={() => void run(() => supabase.from("board_messages").update({ pinned_at: m.pinned_at ? null : new Date().toISOString() }).eq("id", m.id), m.pinned_at ? "Unpinned" : "Pinned")}>
                      {m.pinned_at ? <><PinOff className="mr-2 size-4" /> Unpin</> : <><Pin className="mr-2 size-4" /> Pin</>}
                    </DropdownMenuItem>
                  </>
                ) : null}
                {!removed && text ? (
                  <DropdownMenuItem onSelect={() => { void navigator.clipboard?.writeText(text).then(() => toast.success("Copied")); }}><Copy className="mr-2 size-4" /> Copy</DropdownMenuItem>
                ) : null}
                {!readOnly && !removed ? (
                  <>
                    <DropdownMenuItem onSelect={() => actions.onCalendar(m, false)}><CalendarPlus className="mr-2 size-4" /> Add to calendar</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => actions.onCalendar(m, true)}><BellRing className="mr-2 size-4" /> Remind me later</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => actions.onList(m)}><ListPlus className="mr-2 size-4" /> Add to a list</DropdownMenuItem>
                  </>
                ) : null}
                {canRemove ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-[var(--status-red)]" onSelect={() => void remove()}><Trash2 className="mr-2 size-4" /> Remove</DropdownMenuItem>
                  </>
                ) : null}
                {canRestore ? (
                  <DropdownMenuItem onSelect={() => void run(() => supabase.from("board_messages").update({ deleted_at: null }).eq("id", m.id), "Brought back")}><RotateCcw className="mr-2 size-4" /> Bring back</DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        {grouped.length && !removed ? (
          <div className={cn("mt-0.5 flex flex-wrap gap-1", mine ? "justify-end" : "")}>
            {grouped.map((g) => {
              const minePick = g.who.some((r) => r.member_id === me.id);
              const names = g.who.map((r) => members.find((x) => x.id === r.member_id)?.display_name ?? "Someone").join(", ");
              return (
                <button key={g.e} type="button" title={names} disabled={readOnly}
                  onClick={() => void toggleReaction(g.e)}
                  className={cn("inline-flex min-h-8 items-center gap-1 rounded-full border px-2 text-sm",
                    minePick ? "border-[var(--status-blue)] bg-[var(--status-blue-soft)]" : "border-[var(--surface-border)] bg-[var(--surface)]")}>
                  <span>{g.e}</span><span className="text-xs font-semibold">{g.who.length}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        <span className="px-2 text-[11px] text-muted-foreground">
          {timeOf(m.created_at, family.timezone)}{m.edited_at && !removed ? " · edited" : ""}
        </span>
      </div>
    </div>
  );
}

export function kindWord(kind: string): string {
  return ({ photo: "Photo", voice: "Voice note", poll: "Poll", location: "Shared location", location_request: "Asked where someone is", sticker: "Sticker" } as Record<string, string>)[kind] ?? "";
}

/** Words with @names shown in bold */
function Words({ text, members }: { text: string; members: Member[] }) {
  if (!text) return null;
  const names = members.map((m) => m.display_name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return <p className="whitespace-pre-wrap break-words">{text}</p>;
  const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
  const parts = text.split(re);
  return <p className="whitespace-pre-wrap break-words">{parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : p))}</p>;
}

function Body({ m, data, members, actions, readOnly }: { m: Message; data: ThreadData; members: Member[]; actions: MessageActions; readOnly: boolean }) {
  switch (m.kind) {
    case "sticker":
      return <span className="block text-6xl leading-none" role="img" aria-label="Sticker">{STICKERS[m.sticker ?? ""] ?? "🙂"}</span>;
    case "photo":
      return (
        <div className="space-y-1">
          <MediaGrid media={data.media.filter((x) => x.message_id === m.id)} onOpen={actions.onOpenMedia} />
          <Words text={m.body} members={members} />
        </div>
      );
    case "voice":
      return <VoiceNote media={data.media.find((x) => x.message_id === m.id)} />;
    case "poll":
      return <PollCard m={m} data={data} members={members} readOnly={readOnly} onToCalendar={actions.onPollToCalendar} />;
    case "location":
      return <PlaceCard m={m} data={data} members={members} />;
    case "location_request":
      return <AskCard m={m} data={data} members={members} readOnly={readOnly} />;
    case "announcement":
      return <AnnouncementCard m={m} data={data} members={members} readOnly={readOnly} />;
    case "kudos": {
      const to = members.find((x) => x.id === m.kudos_to);
      return (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold"><Star className="size-4 text-[var(--status-green)]" /> Shout-out to {to?.display_name ?? "someone"}</p>
          <Words text={m.body} members={members} />
        </div>
      );
    }
    default:
      return <Words text={m.body} members={members} />;
  }
}

// ---------------------------------------------------------------- photos, videos and voice notes

export function MediaGrid({ media, onOpen }: { media: Media[]; onOpen: (md: Media) => void }) {
  const urls = useFileUrls(media.map((x) => x.thumb_path ?? (x.kind === "video" ? null : x.path))).data;
  if (!media.length) return <p className="text-sm italic opacity-70">Still arriving…</p>;
  return (
    <div className={cn("grid gap-1", media.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
      {media.slice(0, 4).map((x, i) => {
        const u = urls?.get(x.thumb_path ?? x.path);
        return (
          <button key={x.id} type="button" onClick={() => onOpen(x)} className="relative block overflow-hidden rounded-xl bg-black/10" aria-label={x.kind === "video" ? "Play video" : "Open photo"}>
            {u ? <img src={u} alt={x.caption || "Photo"} className={cn("w-full object-cover", media.length === 1 ? "max-h-72" : "aspect-square")} loading="lazy" />
              : <span className="grid aspect-square w-40 place-items-center text-xs opacity-70">{x.kind === "video" ? "Video" : "Loading…"}</span>}
            {x.kind === "video" ? <span className="absolute inset-0 grid place-items-center text-3xl text-white drop-shadow">▶</span> : null}
            {i === 3 && media.length > 4 ? <span className="absolute inset-0 grid place-items-center bg-black/50 text-xl font-bold text-white">+{media.length - 4}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function VoiceNote({ media }: { media?: Media }) {
  const url = useFileUrl(media?.path);
  if (!media) return <p className="text-sm italic opacity-70">Voice note still arriving…</p>;
  if (cantPlay(media.mime)) {
    return (
      <Button variant="outline" className="h-10 rounded-full" onClick={() => void downloadOriginal(media.path).catch((e) => toast.error(friendlyError(e)))}>
        <Download className="size-4" /> Download voice note
      </Button>
    );
  }
  return url ? <audio controls src={url} className="h-10 max-w-[16rem]" /> : <p className="text-sm opacity-70">Loading…</p>;
}

/** Full-size photo or video, with "Save original" */
export function MediaViewer({ media }: { media: Media }) {
  const url = useFileUrl(media.path);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await downloadOriginal(media.path); } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      {media.kind === "video" ? (
        cantPlay(media.mime) ? (
          <p className="rounded-2xl bg-[var(--status-amber-soft)] p-3 text-sm">This video can't play on this device. Download it to watch.</p>
        ) : url ? <video controls playsInline src={url} className="max-h-[65dvh] w-full rounded-2xl bg-black" /> : <p className="text-sm">Loading…</p>
      ) : url ? <img src={url} alt={media.caption || "Photo"} className="max-h-[65dvh] w-full rounded-2xl object-contain" /> : <p className="text-sm">Loading…</p>}
      {media.caption ? <p className="text-sm">{media.caption}</p> : null}
      <Button className="h-11 w-full rounded-full" disabled={busy} onClick={() => void save()}><Download className="size-4" /> Save original</Button>
    </div>
  );
}

// ---------------------------------------------------------------- polls

function PollCard({ m, data, members, readOnly, onToCalendar }: { m: Message; data: ThreadData; members: Member[]; readOnly: boolean; onToCalendar: (m: Message, day: string) => void }) {
  const { me, isParent, family } = useFamilyState();
  const qc = useQueryClient();
  const poll = data.polls.find((p) => p.message_id === m.id);
  const options = data.options.filter((o) => o.message_id === m.id);
  const votes = data.votes.filter((v) => v.message_id === m.id);
  if (!poll) return <p className="text-sm">Poll</p>;
  const closed = !!poll.closed_at;
  const voters = new Set(votes.map((v) => v.member_id)).size;
  const max = Math.max(0, ...options.map((o) => votes.filter((v) => v.option_id === o.id).length));
  const winner = closed && max > 0 ? options.find((o) => votes.filter((v) => v.option_id === o.id).length === max) : null;
  const canClose = !readOnly && (m.author === me.id || isParent);

  async function vote(optionId: string) {
    if (closed || readOnly) return;
    const own = votes.find((v) => v.option_id === optionId && v.member_id === me.id);
    const res = own
      ? await supabase.from("board_poll_votes").delete().eq("id", own.id)
      : await supabase.from("board_poll_votes").insert({ option_id: optionId, message_id: m.id, member_id: me.id, family_id: family.id });
    if (res.error) toast.error(friendlyError(res.error));
    void refreshBoard(qc, family.id);
  }
  async function close() {
    const { error } = await supabase.from("board_polls").update({ closed_at: new Date().toISOString() }).eq("message_id", m.id);
    if (error) toast.error(friendlyError(error)); else void refreshBoard(qc, family.id);
  }

  return (
    <div className="min-w-[14rem] space-y-2">
      <p className="flex items-center gap-1.5 font-bold"><BarChart3 className="size-4" /> {poll.question}</p>
      <p className="text-xs opacity-70">{poll.kind === "date" ? "Pick the dates that suit you" : poll.multi ? "Pick as many as you like" : "Pick one"} · {voters} voted{closed ? " · Closed" : ""}</p>
      <ul className="space-y-1.5">
        {options.map((o) => {
          const n = votes.filter((v) => v.option_id === o.id);
          const minePick = n.some((v) => v.member_id === me.id);
          const pct = voters ? Math.round((n.length / voters) * 100) : 0;
          const names = n.map((v) => members.find((x) => x.id === v.member_id)?.display_name ?? "?").join(", ");
          return (
            <li key={o.id}>
              <button type="button" disabled={closed || readOnly} onClick={() => void vote(o.id)} title={names}
                className={cn("relative block min-h-11 w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-sm text-foreground",
                  minePick ? "border-[var(--status-blue)]" : "border-[var(--surface-border)]", "bg-[var(--surface)] disabled:cursor-default")}>
                <span className="absolute inset-y-0 left-0 bg-[var(--status-blue-soft)]" style={{ width: `${pct}%` }} />
                <span className="relative flex items-center gap-2">
                  {minePick ? <Check className="size-4 text-[var(--status-blue)]" /> : null}
                  <span className="flex-1 font-medium">{o.label}</span>
                  <span className="text-xs font-semibold">{n.length}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {canClose && !closed ? <Button variant="outline" className="h-10 w-full rounded-full text-foreground" onClick={() => void close()}>Close the poll</Button> : null}
      {closed && poll.kind === "date" && winner?.on_date && !poll.event_id && canClose ? (
        <Button className="h-10 w-full rounded-full" onClick={() => onToCalendar(m, winner.on_date!)}><CalendarPlus className="size-4" /> Add {winner.label} to the calendar</Button>
      ) : null}
      {poll.event_id ? <p className="text-xs font-semibold">✓ Added to the calendar</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- "Where are you?"

function AskCard({ m, data, members, readOnly }: { m: Message; data: ThreadData; members: Member[]; readOnly: boolean }) {
  const { me, family } = useFamilyState();
  const qc = useQueryClient();
  const allowed = useAllowed("location");
  const [busy, setBusy] = useState(false);
  const asker = members.find((x) => x.id === m.author);
  const asked = members.find((x) => x.id === m.ask_member);
  const answered = data.messages.some((x) => x.kind === "location" && x.reply_to === m.id && x.author === m.ask_member);
  const forMe = m.ask_member === me.id;

  function share() {
    if (!navigator.geolocation) { toast.error("This device can't share its location"); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { error } = await supabase.rpc("board_share_location", {
          p_thread: m.thread_id, p_reply_to: m.id, p_lat: pos.coords.latitude, p_lng: pos.coords.longitude,
          p_accuracy: Math.round(pos.coords.accuracy || 0), p_client_id: clientId(),
        });
        setBusy(false);
        if (error) toast.error(friendlyError(error));
        else { toast.success("Shared for one hour"); void refreshBoard(qc, family.id); }
      },
      () => { setBusy(false); toast.error("Location wasn't allowed. You can allow it in your device settings"); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 font-semibold"><MapPin className="size-4" /> {forMe ? `${asker?.display_name ?? "Someone"} asked where you are` : `Asked where ${asked?.display_name ?? "someone"} is`}</p>
      {forMe && !readOnly && !answered ? (
        allowed ? (
          <Button className="h-11 w-full rounded-full" disabled={busy} onClick={share}><MapPin className="size-4" /> {busy ? "Finding you…" : "Share my location once"}</Button>
        ) : <p className="text-xs">A parent has switched location sharing off for you.</p>
      ) : null}
      {answered ? <p className="text-xs font-semibold">✓ Answered</p> : null}
    </div>
  );
}

function PlaceCard({ m, data, members }: { m: Message; data: ThreadData; members: Member[] }) {
  const place = data.places.find((p) => p.message_id === m.id);
  const who = members.find((x) => x.id === m.author);
  if (!place || new Date(place.expires_at).getTime() < Date.now()) {
    return <p className="flex items-center gap-1.5 text-sm"><MapPin className="size-4" /> {who?.display_name ?? "Someone"} shared where they were. Places disappear after one hour.</p>;
  }
  const mins = Math.max(1, Math.round((new Date(place.expires_at).getTime() - Date.now()) / 60000));
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 font-semibold"><MapPin className="size-4" /> Where {who?.display_name ?? "they are"} is</p>
      {place.accuracy ? <p className="text-xs opacity-80">Within about {place.accuracy < 1000 ? `${place.accuracy} m` : `${Math.round(place.accuracy / 1000)} km`}</p> : null}
      <a href={`https://maps.google.com/?q=${place.lat},${place.lng}`} target="_blank" rel="noreferrer"
        className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--surface)] px-4 text-sm font-semibold text-foreground">
        Open in Maps
      </a>
      <p className="text-xs opacity-70">Disappears in {mins} min</p>
    </div>
  );
}

// ---------------------------------------------------------------- announcements

function AnnouncementCard({ m, data, members, readOnly }: { m: Message; data: ThreadData; members: Member[]; readOnly: boolean }) {
  const { me, family } = useFamilyState();
  const qc = useQueryClient();
  const acks = data.acks.filter((a) => a.message_id === m.id);
  const done = acks.some((a) => a.member_id === me.id);
  const logins = members.filter((x) => x.user_id && x.id !== m.author);
  async function gotIt() {
    const { error } = await supabase.from("board_acks").insert({ message_id: m.id, member_id: me.id, family_id: family.id });
    if (error) toast.error(friendlyError(error)); else void refreshBoard(qc, family.id);
  }
  return (
    <div className="space-y-2 text-foreground">
      <p className="flex items-center gap-1.5 text-sm font-bold"><Megaphone className="size-4 text-[var(--status-amber)]" /> Announcement</p>
      <Words text={m.body} members={members} />
      {m.author !== me.id && !readOnly ? (
        done ? <p className="text-xs font-semibold">✓ You've got it</p>
          : <Button className="h-11 w-full rounded-full" onClick={() => void gotIt()}><Check className="size-4" /> Got it</Button>
      ) : null}
      <p className="text-xs opacity-80">
        Got it: {acks.length} of {logins.length}
        {acks.length ? ` (${acks.map((a) => members.find((x) => x.id === a.member_id)?.display_name ?? "?").join(", ")})` : ""}
      </p>
    </div>
  );
}

export function DaySeparator({ children }: { children: ReactNode }) {
  return (
    <div className="my-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
      <span className="h-px flex-1 bg-[var(--surface-border)]" />{children}<span className="h-px flex-1 bg-[var(--surface-border)]" />
    </div>
  );
}
