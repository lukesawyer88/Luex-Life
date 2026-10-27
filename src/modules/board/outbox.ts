// Messages written without a signal wait here and are sent when the signal comes back.
// Each one carries its own id (client_id), so a message that did get through is never saved twice.
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

const KEY = "luex.life.board.outbox";
const EVENT = "luex-board-outbox";

export type Pending = {
  clientId: string;
  familyId: string;
  threadId: string;
  authorId: string;
  body: string;
  mentions: string[];
  replyTo: string | null;
  createdAt: string;
};

function load(): Pending[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as Pending[]) : [];
  } catch {
    return [];
  }
}

function save(list: Pending[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable: messages stay in memory only */ }
  window.dispatchEvent(new Event(EVENT));
}

function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const m = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
  return /failed to fetch|network|load failed|fetch failed|timeout/i.test(m);
}

/** Try once to save a text message. Already saved (same client_id) counts as sent. */
async function trySend(p: Pending): Promise<"sent" | "offline"> {
  try {
    const { error } = await supabase.from("board_messages").insert({
      family_id: p.familyId, thread_id: p.threadId, kind: "text", body: p.body,
      mentions: p.mentions, reply_to: p.replyTo, client_id: p.clientId,
    });
    if (!error) return "sent";
    if (error.code === "23505") return "sent";
    if (isNetworkError(error)) return "offline";
    throw error;
  } catch (e) {
    if (isNetworkError(e)) return "offline";
    throw e;
  }
}

/** Send a text message now, or keep it until there's a signal. Throws on a real refusal. */
export async function sendText(p: Pending): Promise<"sent" | "queued"> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    save([...load(), p]);
    return "queued";
  }
  const r = await trySend(p);
  if (r === "offline") {
    save([...load(), p]);
    return "queued";
  }
  return "sent";
}

let flushing = false;
/** Send everything waiting. Returns how many went. Messages the database refuses are dropped. */
export async function flushOutbox(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const p of load()) {
      let r: "sent" | "offline" | "refused";
      try { r = await trySend(p); } catch { r = "refused"; }
      if (r === "offline") break;
      save(load().filter((x) => x.clientId !== p.clientId));
      if (r === "sent") sent++;
    }
  } finally {
    flushing = false;
  }
  return sent;
}

export function removePending(clientId: string) {
  save(load().filter((x) => x.clientId !== clientId));
}

/** Messages still waiting for this chat */
export function usePending(threadId: string | null): Pending[] {
  const [list, setList] = useState<Pending[]>(() => load());
  useEffect(() => {
    const on = () => setList(load());
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return threadId ? list.filter((p) => p.threadId === threadId) : list;
}

/** Send waiting messages when the app opens and whenever the signal comes back */
export function useOutboxFlush(onSent: () => void) {
  useEffect(() => {
    const go = () => { void flushOutbox().then((n) => { if (n) onSent(); }); };
    go();
    window.addEventListener("online", go);
    return () => window.removeEventListener("online", go);
  }, [onSent]);
}
