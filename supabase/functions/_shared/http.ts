// Shared bits for the Luex Life server functions.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.116.0";

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing setting ${name}`);
  return v;
}

/** Constant-time comparison so the secret can't be guessed one character at a time */
export function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

let cronSecret: string | null = null;

/** True when the request comes from the database's own schedule (its secret lives only in the database) */
export async function fromSchedule(req: Request, db: SupabaseClient): Promise<boolean> {
  const got = req.headers.get("x-cron-secret");
  if (!got) return false;
  if (!cronSecret) {
    const { data } = await db.rpc("server_setting", { p_name: "cron_secret" });
    cronSecret = typeof data === "string" ? data : null;
  }
  return !!cronSecret && cronSecret.length >= 32 && sameSecret(got, cronSecret);
}

/** Full-access client: ignores row security, so every caller of it must check who may see what */
export function serviceClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Client acting as the signed-in person who called the function (row security applies) */
export function callerClient(req: Request): SupabaseClient | null {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
