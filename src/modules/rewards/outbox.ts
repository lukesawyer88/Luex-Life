// Ticks and money records without a signal: they wait on this device and send when the signal comes back.
// Habit ticks are "set this day to this count" (safe to send twice); money records carry a one-off key so a retry
// after a lost reply never saves them twice.
import type { Database } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

const KEY = "luex.life.rewards.outbox";

export type PocketDraft = Omit<Database["public"]["Tables"]["pocket_entries"]["Insert"], "source_key">;
export type HabitTick = { family_id: string; habit_id: string; member_id: string; day: string; count: number; skipped: boolean };
type Job = { kind: "habit"; tick: HabitTick } | { kind: "pocket"; row: PocketDraft & { source_key: string } };

function read(): Job[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Job[]) : [];
  } catch {
    return [];
  }
}
function write(jobs: Job[]) {
  try {
    if (jobs.length) localStorage.setItem(KEY, JSON.stringify(jobs.slice(-300)));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage not available */
  }
}
export function waitingCount(): number {
  return read().length;
}

const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;
const isNetwork = (m: string) => /fetch|network/i.test(m);

async function sendTick(t: HabitTick) {
  // a tick sets the day's count; an existing day is changed rather than added
  const { data, error } = await supabase.from("habit_logs").select("id").eq("habit_id", t.habit_id).eq("day", t.day).maybeSingle();
  if (error) throw error;
  if (data) {
    const r = await supabase.from("habit_logs").update({ count: t.count, skipped: t.skipped }).eq("id", (data as { id: string }).id);
    if (r.error) throw r.error;
  } else {
    const r = await supabase.from("habit_logs").insert(t);
    if (r.error && r.error.code !== "23505") throw r.error;
    if (r.error) {
      const u = await supabase.from("habit_logs").update({ count: t.count, skipped: t.skipped }).eq("habit_id", t.habit_id).eq("day", t.day);
      if (u.error) throw u.error;
    }
  }
}

/** Set a habit's count for a day (now, or later with no signal) */
export async function tickHabit(t: HabitTick): Promise<"saved" | "waiting"> {
  if (offline()) { write([...read().filter((j) => !(j.kind === "habit" && j.tick.habit_id === t.habit_id && j.tick.day === t.day)), { kind: "habit", tick: t }]); return "waiting"; }
  try {
    await sendTick(t);
    return "saved";
  } catch (e) {
    const m = String((e as { message?: string })?.message ?? e);
    if (isNetwork(m)) { write([...read(), { kind: "habit", tick: t }]); return "waiting"; }
    throw e;
  }
}

/** Add a money record (now, or later with no signal) */
export async function addPocket(p: PocketDraft): Promise<"saved" | "waiting"> {
  const row = { ...p, source_key: `device:${crypto.randomUUID()}` };
  if (offline()) { write([...read(), { kind: "pocket", row }]); return "waiting"; }
  const { error } = await supabase.from("pocket_entries").insert(row);
  if (!error) return "saved";
  if (isNetwork(error.message)) { write([...read(), { kind: "pocket", row }]); return "waiting"; }
  throw error;
}

/** Send what's waiting; stops at the first network failure. Returns how many were sent. */
export async function flushOutbox(): Promise<number> {
  const jobs = read();
  const left: Job[] = [];
  let sent = 0;
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    try {
      if (j.kind === "habit") await sendTick(j.tick);
      else {
        const { error } = await supabase.from("pocket_entries").insert(j.row);
        if (error && error.code !== "23505") throw error;
      }
      sent++;
    } catch (e) {
      const m = String((e as { message?: string })?.message ?? e);
      if (isNetwork(m)) { left.push(...jobs.slice(i)); break; }
      // refused by the database: drop it
    }
  }
  write(left);
  return sent;
}
