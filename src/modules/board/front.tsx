// The Board's front page: pinned notes, newest photos, latest chats and things needing you, on one screen.
import { useQuery } from "@tanstack/react-query";
import { Bell, Heart, Images, ListChecks, MapPin, Megaphone, MessagesSquare, Play, Target } from "lucide-react";
import type { ReactNode } from "react";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";

import type { BoardTarget } from "./board-page";
import { boardKey, rows, useFileUrls, useGoals, useLists, useMedia, useThreads, type Ack, type Message, type ThreadInfo } from "./data";
import { goalProgress, ProgressBar } from "./goals";
import { NotesBoard } from "./notes";

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Announcements, "Where are you?" requests and shout-outs from the family chat */
function useFamilyChatBits(familyThreadId: string | undefined) {
  const { family, me } = useFamilyState();
  return useQuery({
    queryKey: boardKey(family.id, "front", familyThreadId),
    enabled: !!familyThreadId,
    queryFn: async () => {
      const since14 = new Date(Date.now() - 14 * 86400000).toISOString();
      const since1h = new Date(Date.now() - 3600000).toISOString();
      const [announcements, asks, myPlaces, kudos] = await Promise.all([
        rows<Message>(supabase.from("board_messages").select("*").eq("thread_id", familyThreadId!).eq("kind", "announcement")
          .is("deleted_at", null).gte("created_at", since14).order("created_at", { ascending: false }).limit(10)),
        rows<Message>(supabase.from("board_messages").select("*").eq("family_id", family.id).eq("kind", "location_request")
          .eq("ask_member", me.id).is("deleted_at", null).gte("created_at", since1h).order("created_at", { ascending: false })),
        rows<Message>(supabase.from("board_messages").select("id, thread_id, reply_to, created_at").eq("family_id", family.id).eq("kind", "location")
          .eq("author", me.id).gte("created_at", since1h)),
        rows<Message>(supabase.from("board_messages").select("*").eq("thread_id", familyThreadId!).eq("kind", "kudos")
          .is("deleted_at", null).order("created_at", { ascending: false }).limit(6)),
      ]);
      const acks = announcements.length
        ? await rows<Ack>(supabase.from("board_acks").select("*").in("message_id", announcements.map((a) => a.id)).eq("member_id", me.id))
        : [];
      const acked = new Set(acks.map((a) => a.message_id));
      const pendingAsks = asks.filter((a) => !myPlaces.some((p) => p.reply_to === a.id || (p.thread_id === a.thread_id && p.created_at > a.created_at)));
      return {
        announcements: announcements.filter((a) => a.author !== me.id && !acked.has(a.id)),
        asks: pendingAsks,
        kudos,
      };
    },
  });
}

export function BoardHome({ onGo }: { onGo: (t: BoardTarget) => void }) {
  const desktop = useDesktop();
  const threads = useThreads();
  const familyThread = threads.data?.find((t) => t.kind === "family");
  const bits = useFamilyChatBits(familyThread?.id);

  const needs = <NeedsYou threads={threads.data ?? []} bits={bits.data} onGo={onGo} />;
  const notes = <NotesBoard compact />;
  const photos = <PhotoStrip onGo={onGo} />;
  const chats = <LatestChats threads={threads.data ?? []} onGo={onGo} />;
  const kudos = <KudosWall kudos={bits.data?.kudos ?? []} onGo={onGo} familyThreadId={familyThread?.id} />;
  const goals = <GoalsSummary onGo={onGo} />;

  return (
    <Windows>
      <RecordsWindow className="space-y-5">
        {needs}
        {notes}
        {photos}
        {!desktop ? <>{chats}{goals}{kudos}</> : null}
      </RecordsWindow>
      <DetailWindow className="space-y-5">
        {chats}
        {goals}
        {kudos}
      </DetailWindow>
    </Windows>
  );
}

function Section({ title, icon: Icon, children, action }: { title: string; icon: React.ComponentType<{ className?: string }>; children: ReactNode; action?: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex flex-1 items-center gap-2 font-bold"><Icon className="size-4" /> {title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function NeedRow({ icon: Icon, tone, children, onClick }: { icon: React.ComponentType<{ className?: string }>; tone: string; children: ReactNode; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-[var(--surface)] px-3 py-2 text-left hover:bg-muted">
        <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ background: `var(--status-${tone}-soft)`, color: `var(--status-${tone})` }}><Icon className="size-4" /></span>
        <span className="min-w-0 flex-1 text-sm">{children}</span>
      </button>
    </li>
  );
}

function NeedsYou({ threads, bits, onGo }: { threads: ThreadInfo[]; bits?: ReturnType<typeof useFamilyChatBits>["data"]; onGo: (t: BoardTarget) => void }) {
  const { me, members } = useFamilyState();
  const lists = useLists();
  const goals = useGoals();
  const name = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? "Someone";

  const unread = threads.filter((t) => t.mine && !t.muted && t.unread > 0);
  const myItems = (lists.data?.items ?? []).filter((i) => i.assignee === me.id && !i.done_at);
  const listOf = (id: string) => lists.data?.lists.find((l) => l.id === id);
  const closeGoals = (goals.data?.goals ?? []).filter((g) => {
    if (g.done_at || !(g.people.length === 0 || g.people.includes(me.id))) return false;
    const { ratio } = goalProgress(g, (goals.data?.steps ?? []).filter((s) => s.goal_id === g.id));
    return ratio >= 0.75;
  });
  const count = unread.length + myItems.length + closeGoals.length + (bits?.announcements.length ?? 0) + (bits?.asks.length ?? 0);

  return (
    <Section title="Things needing you" icon={Bell}>
      {count === 0 ? <p className="rounded-2xl bg-[var(--surface)] px-3 py-3 text-sm text-muted-foreground">You're all caught up.</p> : null}
      <ul className="space-y-1.5">
        {bits?.asks.map((a) => (
          <NeedRow key={a.id} icon={MapPin} tone="red" onClick={() => onGo({ tab: "chats", threadId: a.thread_id, messageId: a.id })}>
            <b>{name(a.author)}</b> asked where you are. Tap to answer.
          </NeedRow>
        ))}
        {bits?.announcements.map((a) => (
          <NeedRow key={a.id} icon={Megaphone} tone="amber" onClick={() => onGo({ tab: "chats", threadId: a.thread_id, messageId: a.id })}>
            <b>Announcement:</b> <span className="line-clamp-1 inline">{a.body}</span> <span className="text-muted-foreground">Tap "Got it"</span>
          </NeedRow>
        ))}
        {unread.map((t) => (
          <NeedRow key={t.id} icon={MessagesSquare} tone="blue" onClick={() => onGo({ tab: "chats", threadId: t.id })}>
            {t.unread} new in <b>{threadName(t, me.id, members)}</b>
          </NeedRow>
        ))}
        {myItems.slice(0, 5).map((i) => (
          <NeedRow key={i.id} icon={ListChecks} tone="green" onClick={() => onGo({ tab: "lists", listId: i.list_id })}>
            {i.text} <span className="text-muted-foreground">· {listOf(i.list_id)?.title}</span>
          </NeedRow>
        ))}
        {closeGoals.map((g) => (
          <NeedRow key={g.id} icon={Target} tone="green" onClick={() => onGo({ tab: "goals", goalId: g.id })}>
            Nearly there: <b>{g.title}</b>
          </NeedRow>
        ))}
      </ul>
    </Section>
  );
}

export function threadName(t: ThreadInfo, myId: string, members: { id: string; display_name: string }[]) {
  if (t.kind === "family") return "Family chat";
  if (t.kind === "group") return t.title ?? "Group";
  const other = t.people.find((p) => p !== myId) ?? t.people[0];
  const names = t.people.map((p) => members.find((m) => m.id === p)?.display_name ?? "Someone");
  return t.mine ? members.find((m) => m.id === other)?.display_name ?? "Chat" : names.join(" and ");
}

function LatestChats({ threads, onGo }: { threads: ThreadInfo[]; onGo: (t: BoardTarget) => void }) {
  const { me, members } = useFamilyState();
  const shown = [...threads].sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)).slice(0, 5);
  return (
    <Section title="Latest chats" icon={MessagesSquare}>
      <ul className="space-y-1.5">
        {shown.map((t) => {
          const other = t.kind === "direct" ? members.find((m) => m.id === t.people.find((p) => p !== me.id)) : undefined;
          return (
            <li key={t.id}>
              <button type="button" onClick={() => onGo({ tab: "chats", threadId: t.id })} className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-[var(--surface)] px-3 py-2 text-left hover:bg-muted">
                {other ? <MemberAvatar member={other} size="sm" className="size-9 ring-0 ring-offset-0" /> : (
                  <span className="grid size-9 place-items-center rounded-full bg-[var(--status-blue-soft)] text-lg">{t.kind === "family" ? "🏠" : t.emoji ?? "👥"}</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{threadName(t, me.id, members)}</span>
                  <span className="block text-xs text-muted-foreground">{t.mine ? ago(t.last_message_at) : "Reading only"}</span>
                </span>
                {t.unread > 0 && t.mine ? (
                  <span className={cn("grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-bold", t.muted ? "bg-[var(--surface-border)]" : "bg-[var(--status-red)] text-white")}>{t.unread > 99 ? "99+" : t.unread}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function PhotoStrip({ onGo }: { onGo: (t: BoardTarget) => void }) {
  const media = useMedia({ limit: 12 });
  const items = media.data ?? [];
  const urls = useFileUrls(items.map((m) => m.thumb_path));
  return (
    <Section title="Newest photos" icon={Images} action={<button type="button" className="min-h-10 px-2 text-sm font-semibold underline-offset-2 hover:underline" onClick={() => onGo({ tab: "photos" })}>See all</button>}>
      {items.length === 0 ? (
        <button type="button" onClick={() => onGo({ tab: "photos" })} className="flex min-h-20 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--surface-border)] text-sm text-muted-foreground">
          <Images className="size-5" /> Add the first family photo
        </button>
      ) : (
        <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {items.map((m) => {
            const u = m.thumb_path ? urls.data?.get(m.thumb_path) : undefined;
            return (
              <button key={m.id} type="button" onClick={() => onGo({ tab: "photos", albumId: m.album_id ?? undefined })}
                className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-[var(--surface)]" aria-label={m.caption || (m.kind === "video" ? "Video" : "Photo")}>
                {u ? <img src={u} alt="" className="size-full object-cover" loading="lazy" /> : <Images className="m-auto size-6 text-muted-foreground" />}
                {m.kind === "video" ? <Play className="absolute bottom-1.5 right-1.5 size-5 fill-white text-white drop-shadow" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function KudosWall({ kudos, onGo, familyThreadId }: { kudos: Message[]; onGo: (t: BoardTarget) => void; familyThreadId?: string }) {
  const { members } = useFamilyState();
  return (
    <Section title="Shout-outs" icon={Heart}>
      {kudos.length === 0 ? (
        <button type="button" disabled={!familyThreadId} onClick={() => onGo({ tab: "chats", threadId: familyThreadId })} className="w-full rounded-2xl bg-[var(--surface)] px-3 py-3 text-left text-sm text-muted-foreground">
          Say well done to someone from the family chat.
        </button>
      ) : null}
      <ul className="grid gap-1.5">
        {kudos.map((k) => {
          const to = members.find((m) => m.id === k.kudos_to);
          const from = members.find((m) => m.id === k.author);
          return (
            <li key={k.id}>
              <button type="button" onClick={() => onGo({ tab: "chats", threadId: k.thread_id, messageId: k.id })}
                className="flex w-full items-start gap-3 rounded-2xl px-3 py-2 text-left" style={{ background: "var(--status-amber-soft)" }}>
                {to ? <MemberAvatar member={to} size="sm" className="size-9 ring-0 ring-offset-0" /> : null}
                <span className="min-w-0 flex-1 text-sm">
                  <b>Well done {to?.display_name ?? ""}!</b> <span className="line-clamp-2">{k.body}</span>
                  <span className="block text-xs text-muted-foreground">From {from?.display_name ?? "someone"} · {ago(k.created_at)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function GoalsSummary({ onGo }: { onGo: (t: BoardTarget) => void }) {
  const goals = useGoals();
  const open = (goals.data?.goals ?? []).filter((g) => !g.done_at).slice(0, 4);
  return (
    <Section title="Family goals" icon={Target} action={<button type="button" className="min-h-10 px-2 text-sm font-semibold underline-offset-2 hover:underline" onClick={() => onGo({ tab: "goals" })}>See all</button>}>
      {open.length === 0 ? <p className="rounded-2xl bg-[var(--surface)] px-3 py-3 text-sm text-muted-foreground">No goals on the go.</p> : null}
      <ul className="space-y-1.5">
        {open.map((g) => {
          const { ratio } = goalProgress(g, (goals.data?.steps ?? []).filter((s) => s.goal_id === g.id));
          return (
            <li key={g.id}>
              <button type="button" onClick={() => onGo({ tab: "goals", goalId: g.id })} className="flex w-full flex-col gap-1.5 rounded-2xl bg-[var(--surface)] px-3 py-2 text-left hover:bg-muted">
                <span className="flex items-center gap-2 text-sm font-semibold"><span>{g.emoji ?? "🎯"}</span> <span className="truncate">{g.title}</span></span>
                <ProgressBar ratio={ratio} className="h-2" />
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
