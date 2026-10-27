// Adding a payment without a signal: it waits on this device and sends when the signal comes back.
// Each waiting payment carries a one-off key, so a retry after a lost reply can never save it twice.
import type { Database } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

const KEY = "luex.life.money.outbox";

export type PaymentDraft = Database["public"]["Tables"]["money_payments"]["Insert"];
export type OutboxJob = { key: string; payment: PaymentDraft };

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
    if (jobs.length) localStorage.setItem(KEY, JSON.stringify(jobs.slice(-200)));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage not available */
  }
}

/** Save a payment now, or keep it for later when there's no signal. Returns "saved" or "waiting". */
export async function addPayment(p: PaymentDraft): Promise<"saved" | "waiting"> {
  const key = `device:${crypto.randomUUID()}`;
  const payment = { ...p, import_key: p.import_key ?? key };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    writeOutbox([...readOutbox(), { key, payment }]);
    return "waiting";
  }
  const { error } = await supabase.from("money_payments").insert(payment);
  if (!error) return "saved";
  if (/fetch|network/i.test(error.message)) {
    writeOutbox([...readOutbox(), { key, payment }]);
    return "waiting";
  }
  throw error;
}

/** Send what's waiting. Returns how many were sent. Stops at the first network failure. */
export async function flushOutbox(): Promise<number> {
  const jobs = readOutbox();
  let sent = 0;
  const left: OutboxJob[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const { error } = await supabase.from("money_payments").insert(jobs[i].payment);
    if (!error || error.code === "23505") { sent++; continue; } // 23505: already saved by an earlier try
    if (/fetch|network/i.test(error.message)) { left.push(...jobs.slice(i)); break; }
    // refused by the database (e.g. the account was removed): drop it
  }
  writeOutbox(left);
  return sent;
}
