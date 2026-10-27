// Luex Life calendar import (import only: Google, Apple, Outlook secret iCal links).
// Two ways in:
//   - the database schedule (x-cron-secret): refreshes feeds not synced for 25 minutes
//   - a signed-in parent pressing "Sync now": body { feedId }; the feed is read through row security as that parent
// Feed links are secrets: never logged.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.116.0";

import { callerClient, CORS, fromSchedule, json, serviceClient } from "../_shared/http.ts";
import { parseIcs, type IcsEvent } from "../_shared/ics.ts";
import { FeedError, safeFetchText } from "../_shared/safe-fetch.ts";

type Feed = {
  id: string; family_id: string; url: string; type: string; people: string[]; visibility: string; viewers: string[];
  created_by_member: string | null; active: boolean; last_synced_at: string | null;
};
const FEED_COLS = "id, family_id, url, type, people, visibility, viewers, created_by_member, active, last_synced_at";
const BUDGET_MS = 45_000;
const DAY = 86_400_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Not allowed" }, 405);
  const db = serviceClient();

  // ---------------------------------------------------------------- the schedule
  if (fromSchedule(req)) {
    const began = Date.now();
    const cutoff = new Date(Date.now() - 25 * 60_000).toISOString();
    const { data, error } = await db
      .from("cal_feeds").select(FEED_COLS).eq("active", true)
      .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`)
      .order("last_synced_at", { ascending: true, nullsFirst: true }).limit(30);
    if (error) return json({ ok: false }, 500);
    let ok = 0, failed = 0;
    for (const f of (data ?? []) as Feed[]) {
      if (Date.now() - began > BUDGET_MS) break;
      const r = await syncFeed(db, f);
      if (r.ok) ok++; else failed++;
    }
    console.log(JSON.stringify({ mode: "schedule", ok, failed, ms: Date.now() - began }));
    return json({ ok: true, synced: ok, failed });
  }

  // ---------------------------------------------------------------- "Sync now" from the app
  const me = callerClient(req);
  if (!me) return json({ ok: false, error: "Please sign in" }, 401);
  let feedId = "";
  try {
    feedId = String(((await req.json()) as { feedId?: unknown }).feedId ?? "");
  } catch { /* empty body */ }
  if (!/^[0-9a-f-]{36}$/i.test(feedId)) return json({ ok: false, error: "Choose a calendar to sync" }, 400);
  // row security decides: only a parent who can see this import gets a row back
  const { data: feed, error } = await me.from("cal_feeds").select(FEED_COLS).eq("id", feedId).maybeSingle();
  if (error || !feed) return json({ ok: false, error: "That calendar isn't available" }, 404);
  if (feed.last_synced_at && Date.now() - Date.parse(feed.last_synced_at) < 60_000) {
    return json({ ok: false, error: "It was synced a moment ago. Try again in a minute" }, 429);
  }
  const r = await syncFeed(db, feed as Feed);
  return json(r, r.ok ? 200 : 422);
});

async function syncFeed(db: SupabaseClient, feed: Feed): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    const { data: fam } = await db.from("families").select("timezone, archived_at").eq("id", feed.family_id).maybeSingle();
    if (!fam || fam.archived_at) throw new FeedError("This family is no longer active");
    const tz = (fam.timezone as string) || "Europe/London";
    const text = await safeFetchText(feed.url);
    const parsed = parseIcs(text, tz);
    const count = await save(db, feed, parsed);
    await db.from("cal_feeds").update({ last_synced_at: new Date().toISOString(), last_error: null, event_count: count }).eq("id", feed.id);
    return { ok: true, count };
  } catch (e) {
    const msg = e instanceof FeedError ? e.message : "Couldn't bring that calendar in. Try again later";
    if (!(e instanceof FeedError)) console.error(JSON.stringify({ feed: feed.id, error: (e as Error)?.message?.slice(0, 200) }));
    await db.from("cal_feeds").update({ last_synced_at: new Date().toISOString(), last_error: msg.slice(0, 200) }).eq("id", feed.id);
    return { ok: false, error: msg };
  }
}

function base(feed: Feed, e: IcsEvent) {
  return {
    family_id: feed.family_id,
    title: e.title,
    type: feed.type,
    all_day: e.allDay,
    starts_at: e.start.toISOString(),
    ends_at: (e.end < e.start ? e.start : e.end).toISOString(),
    people: feed.people,
    visibility: feed.visibility,
    viewers: feed.visibility === "selected" ? feed.viewers : [],
    created_by_member: feed.created_by_member,
    source: "import",
    feed_id: feed.id,
    location: e.location,
    notes: e.description,
    deleted_at: null,
  };
}

const keyFor = (uid: string, rid?: Date | null) => (rid ? `${uid.slice(0, 500)}|${rid.toISOString()}` : uid.slice(0, 590));

/** Write the feed's events: series first, then changed single dates; remove what's no longer in the file */
export async function save(db: SupabaseClient, feed: Feed, events: IcsEvent[]): Promise<number> {
  const now = Date.now();
  const from = new Date(now - 60 * DAY);
  const to = new Date(now + 730 * DAY);

  const masters = new Map<string, IcsEvent>();
  const overrides: IcsEvent[] = [];
  for (const e of events) {
    if (e.recurrenceId) overrides.push(e);
    else if (!masters.has(e.uid)) masters.set(e.uid, e);
  }
  // a cancelled single date removes that date from its series
  for (const o of overrides) {
    const m = masters.get(o.uid);
    if (o.cancelled && m?.rrule && m.exdates.length < 500) m.exdates.push(o.recurrenceId!);
  }
  const keepMaster = (e: IcsEvent) =>
    !e.cancelled && e.start <= to && (e.rrule ? !e.until || e.until >= from : e.end >= from || e.start >= from);

  const masterRows = [...masters.values()].filter(keepMaster).map((e) => ({
    ...base(feed, e), rrule: e.rrule, exdates: e.rrule ? e.exdates.slice(-500).map((d) => d.toISOString()) : [],
    recurrence_of: null, recurrence_date: null, external_key: keyFor(e.uid),
  }));
  const idOf = new Map<string, string>();
  for (let i = 0; i < masterRows.length; i += 200) {
    const { data, error } = await db.from("cal_events").upsert(masterRows.slice(i, i + 200), { onConflict: "feed_id,external_key" }).select("id, external_key");
    if (error) throw error;
    for (const r of data ?? []) idOf.set(r.external_key as string, r.id as string);
  }

  const overrideRows = overrides
    .filter((o) => !o.cancelled && o.start <= to && o.end >= from)
    .map((o) => {
      const masterId = masters.get(o.uid)?.rrule ? idOf.get(keyFor(o.uid)) : undefined;
      return {
        ...base(feed, o), rrule: null, exdates: [],
        // a changed date whose series wasn't brought in stands on its own
        recurrence_of: masterId ?? null, recurrence_date: masterId ? o.recurrenceId!.toISOString() : null,
        external_key: keyFor(o.uid, o.recurrenceId),
      };
    });
  for (let i = 0; i < overrideRows.length; i += 200) {
    const { data, error } = await db.from("cal_events").upsert(overrideRows.slice(i, i + 200), { onConflict: "feed_id,external_key" }).select("id, external_key");
    if (error) throw error;
    for (const r of data ?? []) idOf.set(r.external_key as string, r.id as string);
  }

  // remove events that have gone from the file
  const keep = new Set(idOf.values());
  const { data: existing, error: ee } = await db.from("cal_events").select("id").eq("feed_id", feed.id);
  if (ee) throw ee;
  const stale = (existing ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
  for (let i = 0; i < stale.length; i += 200) {
    const { error } = await db.from("cal_events").delete().in("id", stale.slice(i, i + 200));
    if (error) throw error;
  }
  return masterRows.length + overrideRows.length;
}
