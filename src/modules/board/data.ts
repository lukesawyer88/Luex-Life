// Everything the Family Board reads and writes. The database decides who may see and change what;
// these hooks just ask, and keep every screen up to date when someone else changes something.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { Database } from "@/lib/database.types";
import { useFamilyState } from "@/lib/family-context";
import { fitJpeg } from "@/lib/image";
import { supabase } from "@/lib/supabase";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

export type BoardSettings = Row<"board_settings">;
export type Thread = Row<"board_threads">;
export type ThreadPerson = Row<"board_thread_people">;
export type ThreadState = Row<"board_thread_state">;
export type Message = Row<"board_messages">;
export type Reaction = Row<"board_reactions">;
export type Ack = Row<"board_acks">;
export type Poll = Row<"board_polls">;
export type PollOption = Row<"board_poll_options">;
export type PollVote = Row<"board_poll_votes">;
export type SharedPlace = Row<"board_locations">;
export type Album = Row<"board_albums">;
export type Media = Row<"board_media">;
export type AlbumShare = Omit<Row<"board_album_shares">, "token_hash">;
export type Memory = Row<"board_memories">;
export type BoardList = Row<"board_lists">;
export type ListItem = Row<"board_list_items">;
export type Note = Row<"board_notes">;
export type Goal = Row<"board_goals">;
export type GoalStep = Row<"board_goal_steps">;
export type Prompt = Row<"board_prompts">;
export type Unread = { thread_id: string; unread: number; last_message_at: string; muted: boolean };

/** Every Board query key starts with this, so one call refreshes them all */
export const boardKey = (familyId: string, ...rest: unknown[]) => ["board", familyId, ...rest];

export const ALLOWANCE_WARN = 0.8;
export const VIDEO_MAX_SECONDS = 180;
export const BUCKET = "board-media";

export async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

export function refreshBoard(qc: QueryClient, familyId: string) {
  return qc.invalidateQueries({ queryKey: ["board", familyId] });
}

// ---------------------------------------------------------------- live updates

const LIVE_TABLES = [
  "board_messages", "board_threads", "board_thread_state", "board_lists", "board_list_items", "board_notes",
  "board_goals", "board_goal_steps", "board_media", "board_memories",
] as const;

/** Keep every Board screen fresh while the Board is open */
export function useBoardLive() {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refreshBoard(qc, family.id), 250);
    };
    const ch = supabase.channel(`board-${family.id}`);
    for (const t of LIVE_TABLES) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `family_id=eq.${family.id}` }, refresh);
    }
    ch.subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
  }, [family.id, qc]);
}

// ---------------------------------------------------------------- settings

/** My Board settings, and (for parents) everyone's */
export function useBoardSettings() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: boardKey(family.id, "settings"),
    queryFn: () => rows<BoardSettings>(supabase.from("board_settings").select("*").eq("family_id", family.id)),
  });
}

export function useMySettings(): BoardSettings | undefined {
  const { me } = useFamilyState();
  return useBoardSettings().data?.find((s) => s.member_id === me.id);
}

/** A child's switch (grown-ups always true) */
export function useAllowed(what: "photos" | "voice" | "location" | "private_chats" | "chat"): boolean {
  const { role } = useFamilyState();
  const s = useMySettings();
  if (role !== "child") return true;
  return s ? Boolean(s[what]) : true;
}

// ---------------------------------------------------------------- chats

export function useThreads() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: boardKey(family.id, "threads"),
    queryFn: async () => {
      // make sure the family chat exists (the first person to open the Board creates it)
      await supabase.rpc("board_family_thread");
      const [threads, people, unread] = await Promise.all([
        rows<Thread>(supabase.from("board_threads").select("*").eq("family_id", family.id).is("archived_at", null)),
        rows<ThreadPerson>(supabase.from("board_thread_people").select("*").eq("family_id", family.id)),
        rows<Unread>(supabase.rpc("board_unread")),
      ]);
      const u = new Map(unread.map((x) => [x.thread_id, x]));
      return threads
        .map((t) => ({
          ...t,
          people: people.filter((p) => p.thread_id === t.id).map((p) => p.member_id),
          unread: u.get(t.id)?.unread ?? 0,
          muted: u.get(t.id)?.muted ?? false,
          /** false = a parent reading a child's chat (read-only) */
          mine: u.has(t.id),
        }))
        .sort((a, b) => (a.kind === "family" ? -1 : b.kind === "family" ? 1 : b.last_message_at.localeCompare(a.last_message_at)));
    },
  });
}
export type ThreadInfo = NonNullable<ReturnType<typeof useThreads>["data"]>[number];

/** Total unread across my chats (for badges) */
export function useUnreadTotal(): number {
  const t = useThreads().data ?? [];
  return t.filter((x) => x.mine && !x.muted).reduce((n, x) => n + x.unread, 0);
}

export const PAGE = 60;

/** The latest messages in a chat, oldest first; `pages` loads further back */
export function useMessages(threadId: string | null, pages = 1) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: boardKey(family.id, "messages", threadId, pages),
    enabled: !!threadId,
    queryFn: async () => {
      const msgs = await rows<Message>(
        supabase.from("board_messages").select("*").eq("thread_id", threadId!).order("created_at", { ascending: false }).limit(PAGE * pages),
      );
      const ids = msgs.map((m) => m.id);
      const pollIds = msgs.filter((m) => m.kind === "poll").map((m) => m.id);
      const placeIds = msgs.filter((m) => m.kind === "location").map((m) => m.id);
      const annIds = msgs.filter((m) => m.kind === "announcement").map((m) => m.id);
      const [reactions, polls, options, votes, places, acks, media, state] = await Promise.all([
        ids.length ? rows<Reaction>(supabase.from("board_reactions").select("*").in("message_id", ids)) : [],
        pollIds.length ? rows<Poll>(supabase.from("board_polls").select("*").in("message_id", pollIds)) : [],
        pollIds.length ? rows<PollOption>(supabase.from("board_poll_options").select("*").in("message_id", pollIds).order("position")) : [],
        pollIds.length ? rows<PollVote>(supabase.from("board_poll_votes").select("*").in("message_id", pollIds)) : [],
        placeIds.length ? rows<SharedPlace>(supabase.from("board_locations").select("*").in("message_id", placeIds)) : [],
        annIds.length ? rows<Ack>(supabase.from("board_acks").select("*").in("message_id", annIds)) : [],
        ids.length ? rows<Media>(supabase.from("board_media").select("*").in("message_id", ids).is("deleted_at", null)) : [],
        rows<ThreadState>(supabase.from("board_thread_state").select("*").eq("thread_id", threadId!)),
      ]);
      return {
        messages: msgs.reverse(),
        hasMore: msgs.length === PAGE * pages,
        reactions, polls, options, votes, places, acks, media, state,
      };
    },
  });
}
export type ThreadData = NonNullable<ReturnType<typeof useMessages>["data"]>;

// ---------------------------------------------------------------- photos

export function useAlbums() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: boardKey(family.id, "albums"),
    queryFn: () => rows<Album>(supabase.from("board_albums").select("*").eq("family_id", family.id).is("archived_at", null).order("created_at", { ascending: false })),
  });
}

/** Photos and videos the family can see (family chat, albums, memories), newest first */
export function useMedia(opts: { albumId?: string | null; memoryId?: string; limit?: number } = {}) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: boardKey(family.id, "media", opts.albumId ?? null, opts.memoryId ?? null, opts.limit ?? 300),
    queryFn: () => {
      let q = supabase.from("board_media").select("*").eq("family_id", family.id).is("deleted_at", null).neq("kind", "voice");
      if (opts.albumId) q = q.eq("album_id", opts.albumId);
      if (opts.memoryId) q = q.eq("memory_id", opts.memoryId);
      return rows<Media>(q.order("created_at", { ascending: false }).limit(opts.limit ?? 300));
    },
  });
}

export function useStorageUse() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: boardKey(family.id, "storage"),
    queryFn: async () => {
      const r = await rows<{ used: number; allowance: number }>(supabase.rpc("board_storage"));
      return r[0] ?? { used: 0, allowance: 53687091200 };
    },
    staleTime: 60_000,
  });
}

/** Signed addresses for private files (valid for an hour; re-asked every 50 minutes) */
export function useFileUrls(paths: (string | null | undefined)[]) {
  const clean = [...new Set(paths.filter((p): p is string => !!p))].sort();
  return useQuery({
    queryKey: ["board-urls", clean],
    enabled: clean.length > 0,
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
    queryFn: async () => {
      const out = new Map<string, string>();
      for (let i = 0; i < clean.length; i += 100) {
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(clean.slice(i, i + 100), 3600);
        if (error) throw error;
        for (const d of data ?? []) if (d.signedUrl && d.path) out.set(d.path, d.signedUrl);
      }
      return out;
    },
  });
}

export function useFileUrl(path: string | null | undefined): string | undefined {
  return useFileUrls([path]).data?.get(path ?? "");
}

export type UploadTarget =
  | { kind: "thread"; threadId: string; messageId?: string }
  | { kind: "album"; albumId?: string | null }
  | { kind: "memory"; memoryId: string };

function extOf(file: File): string {
  const fromName = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (fromName && fromName.length <= 5) return fromName;
  const t = file.type;
  return t.includes("png") ? "png" : t.includes("webp") ? "webp" : t.includes("gif") ? "gif" : t.includes("mp4") ? "mp4"
    : t.includes("quicktime") ? "mov" : t.includes("webm") ? "webm" : t.includes("ogg") ? "ogg" : t.includes("mpeg") ? "mp3" : "jpg";
}

export function kindOf(file: File): "photo" | "video" | "voice" {
  return file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "voice" : "photo";
}

/** How long a video or voice note is, in seconds (null if the device can't tell) */
export function mediaDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
    const url = URL.createObjectURL(file);
    el.preload = "metadata";
    el.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(el.duration) ? el.duration : null); };
    el.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    el.src = url;
  });
}

/** A small preview picture: a shrunk copy of a photo, or the first frame of a video */
async function makeThumb(file: File): Promise<{ blob: Blob; width?: number; height?: number } | null> {
  try {
    if (file.type.startsWith("image/")) {
      const bmp = await createImageBitmap(file);
      const size = { width: bmp.width, height: bmp.height };
      bmp.close();
      return { blob: await fitJpeg(file, 480), ...size };
    }
    if (file.type.startsWith("video/")) {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
      await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error("video")); setTimeout(() => rej(new Error("timeout")), 8000); });
      v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
      await new Promise<void>((res) => { v.onseeked = () => res(); setTimeout(res, 2000); });
      const scale = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.8));
      return blob ? { blob, width: v.videoWidth, height: v.videoHeight } : null;
    }
  } catch { /* no preview: the original still shows */ }
  return null;
}

/**
 * Upload one original (never shrunk) plus a small preview, then record it.
 * Throws a plain-English error the screen can show next to a "Try again" button.
 */
export async function uploadMedia(
  familyId: string,
  file: File,
  target: UploadTarget,
  extra: { kind?: Media["kind"]; caption?: string; people?: string[]; durationS?: number | null } = {},
): Promise<Media> {
  const kind = extra.kind ?? kindOf(file);
  const duration = extra.durationS ?? (kind === "video" || kind === "voice" ? await mediaDuration(file) : null);
  if (kind === "video" && (duration ?? 0) > VIDEO_MAX_SECONDS) throw new Error("Videos can be up to 3 minutes long");
  if (file.size > 50 * 1024 * 1024) throw new Error("That file is too big (50 MB at most)");
  const folder =
    target.kind === "thread" ? `${familyId}/board/t/${target.threadId}`
    : target.kind === "memory" ? `${familyId}/board/m/${target.memoryId}`
    : `${familyId}/board/a`;
  const id = crypto.randomUUID();
  const path = `${folder}/${id}.${extOf(file)}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) {
    const m = upErr.message.toLowerCase();
    if (m.includes("policy") || m.includes("row-level")) throw new Error("Upload refused. Your family may have used all its space");
    if (m.includes("size") || m.includes("too large")) throw new Error("That file is too big (50 MB at most)");
    if (m.includes("mime") || m.includes("type")) throw new Error("That kind of file can't be added");
    throw new Error("Upload failed. Check your signal and try again");
  }
  let thumbPath: string | null = null;
  let width: number | undefined; let height: number | undefined;
  if (kind !== "voice") {
    const t = await makeThumb(file);
    if (t) {
      width = t.width; height = t.height;
      const tp = `${folder}/${id}.thumb.jpg`;
      const { error } = await supabase.storage.from(BUCKET).upload(tp, t.blob, { contentType: "image/jpeg" });
      if (!error) thumbPath = tp;
    }
  }
  const { data, error } = await supabase.from("board_media").insert({
    family_id: familyId,
    thread_id: target.kind === "thread" ? target.threadId : null,
    message_id: target.kind === "thread" ? target.messageId ?? null : null,
    album_id: target.kind === "album" ? target.albumId ?? null : null,
    memory_id: target.kind === "memory" ? target.memoryId : null,
    path, thumb_path: thumbPath, kind, mime: file.type || "application/octet-stream",
    width: width ?? null, height: height ?? null,
    duration_s: duration != null ? Math.round(duration * 10) / 10 : null,
    caption: extra.caption ?? "", people: extra.people ?? [],
  }).select("*").single();
  if (error) throw new Error(error.message.includes("switched") ? error.message : "Saved the file but couldn't add it. Try again");
  return data as Media;
}

/** Save the original to the device */
export async function downloadOriginal(path: string, name?: string) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("Couldn't download it. Try again");
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url; a.download = name ?? path.split("/").pop() ?? "luex-photo";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** iPhone videos (HEVC .mov) don't play in some browsers: true when this device probably can't play it */
export function cantPlay(mime: string): boolean {
  const v = document.createElement("video");
  return v.canPlayType(mime) === "";
}

// ---------------------------------------------------------------- lists, notes, goals, memories, prompts

export function useLists() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: boardKey(family.id, "lists"),
    queryFn: async () => {
      const [lists, items] = await Promise.all([
        rows<BoardList>(supabase.from("board_lists").select("*").eq("family_id", family.id).is("archived_at", null).order("position").order("created_at")),
        rows<ListItem>(supabase.from("board_list_items").select("*").eq("family_id", family.id).order("position").order("created_at")),
      ]);
      return { lists, items };
    },
  });
}

export function useNotes() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: boardKey(family.id, "notes"),
    queryFn: () => rows<Note>(supabase.from("board_notes").select("*").eq("family_id", family.id).is("deleted_at", null).order("created_at", { ascending: false })),
  });
}

export function useGoals() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: boardKey(family.id, "goals"),
    queryFn: async () => {
      const [goals, steps] = await Promise.all([
        rows<Goal>(supabase.from("board_goals").select("*").eq("family_id", family.id).is("archived_at", null).order("created_at", { ascending: false })),
        rows<GoalStep>(supabase.from("board_goal_steps").select("*").eq("family_id", family.id).order("position")),
      ]);
      return { goals, steps };
    },
  });
}

export function useMemories() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: boardKey(family.id, "memories"),
    queryFn: () => rows<Memory>(supabase.from("board_memories").select("*").eq("family_id", family.id).is("deleted_at", null).order("happened_on", { ascending: false }).order("created_at", { ascending: false })),
  });
}

export function usePrompts() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: boardKey(family.id, "prompts"),
    queryFn: () => rows<Prompt>(supabase.from("board_prompts").select("*").is("archived_at", null).order("created_at")),
    staleTime: 10 * 60_000,
  });
}

export function useTodaysPrompt() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: boardKey(family.id, "todays-prompt"),
    queryFn: async () => (await rows<{ prompt_id: string; text: string }>(supabase.rpc("board_todays_prompt")))[0] ?? null,
  });
}

// ---------------------------------------------------------------- small helpers

/** Age in whole years on a date (for milestones) */
export function ageOn(birthday: string | null, onDay: string): string | null {
  if (!birthday) return null;
  const [by, bm, bd] = birthday.split("-").map(Number);
  const [y, m, d] = onDay.split("-").map(Number);
  let years = y - by;
  let months = m - bm;
  if (d < bd) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years < 0) return null;
  if (years < 2) { const total = years * 12 + months; return total <= 0 ? "newborn" : `${total} month${total === 1 ? "" : "s"}`; }
  return `${years}`;
}

export function bytesText(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** A new id for a message, so a message re-sent after a lost signal is only saved once */
export function clientId(): string {
  return crypto.randomUUID();
}
