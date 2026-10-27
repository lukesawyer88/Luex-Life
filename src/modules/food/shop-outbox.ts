// Shopping without a signal: adds and ticks wait on this device and send when the signal comes back.
import { supabase } from "@/lib/supabase";

const KEY = "luex.life.food.outbox";

export type OutboxJob =
  | { kind: "add"; id: string; list_id: string; family_id: string; name: string; quantity: number | null; unit: string | null; note: string }
  | { kind: "tick"; id: string; item_id: string; done: boolean };

export function readOutbox(): OutboxJob[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OutboxJob[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(jobs: OutboxJob[]) {
  try {
    if (jobs.length) localStorage.setItem(KEY, JSON.stringify(jobs.slice(-300)));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage not available: nothing to do */
  }
}

export function queueJob(job: OutboxJob) {
  writeOutbox([...readOutbox(), job]);
}

/** Send what's waiting. Returns how many were sent. Stops at the first network failure. */
export async function flushOutbox(): Promise<number> {
  const jobs = readOutbox();
  let sent = 0;
  const left: OutboxJob[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    try {
      if (j.kind === "add") {
        const { error } = await supabase.from("food_list_items").insert({
          list_id: j.list_id, family_id: j.family_id, name: j.name, quantity: j.quantity, unit: j.unit, note: j.note,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("food_list_items").update({ done_at: j.done ? new Date().toISOString() : null }).eq("id", j.item_id);
        if (error) throw error;
      }
      sent++;
    } catch (e) {
      const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? "");
      if (/fetch|network/i.test(m)) { left.push(...jobs.slice(i)); break; }
      // refused by the database (e.g. the list was removed): drop it
    }
  }
  writeOutbox(left);
  return sent;
}
