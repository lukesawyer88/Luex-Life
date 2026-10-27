// Luex Life push sender. Runs every minute from the database schedule.
// 1. creates reminder and "leave now" notifications that are due
// 2. on Sunday at 18:00 (family time) creates the weekly summary
// 3. sends every waiting notification to the person's devices
// It uses the full-access key, so it checks who may see each event itself.
import webpush from "npm:web-push@3.6.7";

import { fromSchedule, json, serviceClient } from "../_shared/http.ts";
import { expandStarts, type EventLike } from "../_shared/recurrence.ts";
import { addDays, atTime, dayKey, dayName, daysBetween, parts, splitKey, timeOf, weekdayOf } from "../_shared/time.ts";

type Ev = EventLike & {
  family_id: string; title: string; people: string[]; visibility: string; viewers: string[]; created_by_member: string | null;
  driver: string | null; reminders: number[]; travel_minutes: number | null; location: string | null; type: string;
};
type Member = { id: string; family_id: string; user_id: string | null; display_name: string; birthday: string | null };
type Prefs = { member_id: string; reminders: boolean; weekly: boolean };
type NewNote = { family_id: string; member_id: string; kind: string; title: string; body: string; link: string | null; group_key?: string | null };

const EV_COLS =
  "id, family_id, title, type, all_day, starts_at, ends_at, rrule, exdates, recurrence_of, recurrence_date, people, visibility, viewers, created_by_member, driver, reminders, travel_minutes, location, deleted_at";

const sees = (ev: Ev, m: string) => ev.visibility === "all" || ev.created_by_member === m || ev.viewers.includes(m);

const BUDGET_MS = 45_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (!fromSchedule(req)) return json({ error: "Not allowed" }, 401);
  const began = Date.now();
  const db = serviceClient();
  const now = new Date();
  const counts = { reminders: 0, leave: 0, weekly: 0, sent: 0, devicesGone: 0, failed: 0 };

  try {
    // ---------------------------------------------------------------- who is who
    const [{ data: fams, error: fe }, { data: mems, error: me }, { data: prefs, error: pe }] = await Promise.all([
      db.from("families").select("id, timezone").is("archived_at", null),
      db.from("family_members").select("id, family_id, user_id, display_name, birthday").is("archived_at", null),
      db.from("notification_prefs").select("member_id, reminders, weekly"),
    ]);
    if (fe || me || pe) throw fe ?? me ?? pe;
    const tzOf = new Map((fams ?? []).map((f) => [f.id as string, (f.timezone as string) || "Europe/London"]));
    const members = (mems ?? []) as Member[];
    const byFamily = new Map<string, Member[]>();
    for (const m of members) {
      if (!byFamily.has(m.family_id)) byFamily.set(m.family_id, []);
      byFamily.get(m.family_id)!.push(m);
    }
    const loginIds = new Set(members.filter((m) => m.user_id).map((m) => m.id));
    const pref = new Map(((prefs ?? []) as Prefs[]).map((p) => [p.member_id, p]));
    const wantsReminders = (m: string) => pref.get(m)?.reminders !== false;
    const wantsWeekly = (m: string) => pref.get(m)?.weekly !== false;

    // ---------------------------------------------------------------- reminders and "leave now"
    const lookFrom = new Date(now.getTime() - 10 * 60_000 - 86_400_000);
    const lookTo = new Date(now.getTime() + 8 * 86_400_000);
    const { data: withAlerts, error: ae } = await db
      .from("cal_events")
      .select(EV_COLS)
      .is("deleted_at", null)
      .lt("starts_at", lookTo.toISOString())
      // (has a reminder or a journey time) and (repeats or hasn't finished yet)
      .or(`and(or(reminders.neq.{},travel_minutes.not.is.null),or(rrule.not.is.null,ends_at.gte.${lookFrom.toISOString()}))`)
      .limit(5000);
    if (ae) throw ae;
    const masters = ((withAlerts ?? []) as Ev[]).filter((e) => e.rrule && !e.recurrence_of).map((e) => e.id);
    // changed single dates of those series, so a moved date reminds at its new time (or not at all)
    let overrides: Ev[] = [];
    for (let i = 0; i < masters.length; i += 200) {
      const { data, error } = await db.from("cal_events").select(EV_COLS).is("deleted_at", null).in("recurrence_of", masters.slice(i, i + 200));
      if (error) throw error;
      overrides = overrides.concat((data ?? []) as Ev[]);
    }
    const all = new Map<string, Ev>();
    for (const e of [...((withAlerts ?? []) as Ev[]), ...overrides]) all.set(e.id, e);
    const evsByFamily = new Map<string, Ev[]>();
    for (const e of all.values()) {
      if (!evsByFamily.has(e.family_id)) evsByFamily.set(e.family_id, []);
      evsByFamily.get(e.family_id)!.push(e);
    }

    type Due = { claim: { event_id: string; occurrence_at: string; kind: string; minutes: number }; notes: NewNote[] };
    const due: Due[] = [];
    const windowStart = now.getTime() - 10 * 60_000;
    for (const [fid, evs] of evsByFamily) {
      const tz = tzOf.get(fid);
      if (!tz) continue;
      const fam = byFamily.get(fid) ?? [];
      for (const o of expandStarts(evs, lookFrom, lookTo, tz)) {
        const ev = o.event;
        const startK = o.startDay;
        const link = `/m/calendar?event=${o.seriesId}`;
        // people to remind: who it's for (with a login) plus whoever added it; for family-wide things, everyone
        const base = ev.people.length
          ? [...ev.people, ...(ev.created_by_member ? [ev.created_by_member] : [])]
          : fam.map((m) => m.id);
        const audience = [...new Set(base)].filter((m) => loginIds.has(m) && sees(ev, m) && wantsReminders(m));

        for (const minutes of ev.reminders ?? []) {
          let fire: Date;
          if (o.allDay) {
            if (minutes === 0) fire = atTime(startK, 7, 0, tz);
            else if (minutes % 1440 === 0) fire = atTime(addDays(startK, -minutes / 1440), 18, 0, tz);
            else fire = new Date(o.start.getTime() - minutes * 60_000);
          } else fire = new Date(o.start.getTime() - minutes * 60_000);
          if (fire.getTime() <= windowStart || fire > now) continue;
          if (!audience.length) continue;
          const fireK = dayKey(fire, tz);
          const gap = daysBetween(fireK, startK);
          const when = o.allDay
            ? gap === 0 ? "All day today" : gap === 1 ? "Tomorrow" : gap < 7 ? `On ${dayName(weekdayOf(startK))}` : `On ${Number(startK.slice(8))}/${Number(startK.slice(5, 7))}`
            : gap === 0 ? `Starts at ${timeOf(o.start, tz)}` : gap === 1 ? `Tomorrow at ${timeOf(o.start, tz)}` : `${dayName(weekdayOf(startK))} at ${timeOf(o.start, tz)}`;
          due.push({
            claim: { event_id: o.seriesId, occurrence_at: o.originalStart.toISOString(), kind: "reminder", minutes },
            notes: audience.map((m) => ({ family_id: fid, member_id: m, kind: "reminder", title: ev.title.slice(0, 120), body: (when + (ev.location ? ` · ${ev.location}` : "")).slice(0, 300), link })),
          });
        }

        if (!o.allDay && ev.travel_minutes) {
          const fire = new Date(o.start.getTime() - (ev.travel_minutes + 5) * 60_000);
          if (fire.getTime() > windowStart && fire <= now) {
            let who = ev.driver && loginIds.has(ev.driver) && sees(ev, ev.driver) ? [ev.driver] : ev.people.filter((m) => loginIds.has(m) && sees(ev, m));
            if (!who.length && ev.created_by_member && loginIds.has(ev.created_by_member)) who = [ev.created_by_member];
            who = who.filter(wantsReminders);
            if (who.length) {
              due.push({
                claim: { event_id: o.seriesId, occurrence_at: o.originalStart.toISOString(), kind: "leave", minutes: ev.travel_minutes },
                notes: who.map((m) => ({
                  family_id: fid, member_id: m, kind: "leave", title: `Leave now for ${ev.title}`.slice(0, 120),
                  body: `${ev.travel_minutes} min journey, starts at ${timeOf(o.start, tz)}${ev.location ? ` · ${ev.location}` : ""}`.slice(0, 300), link,
                })),
              });
            }
          }
        }
      }
    }

    // claim each one first, so two runs at once can never send it twice
    for (const d of due) {
      const { data, error } = await db
        .from("reminder_sends")
        .upsert(d.claim, { onConflict: "event_id,occurrence_at,kind,minutes", ignoreDuplicates: true })
        .select("event_id");
      if (error) { counts.failed++; continue; }
      if (!data?.length) continue;
      const { error: ie } = await db.from("notifications").insert(d.notes);
      if (ie) counts.failed++;
      else if (d.claim.kind === "leave") counts.leave += d.notes.length;
      else counts.reminders += d.notes.length;
    }

    // ---------------------------------------------------------------- Sunday 18:00: next week's summary
    for (const [fid, tz] of tzOf) {
      if (Date.now() - began > BUDGET_MS / 2) break;
      const p = parts(now, tz);
      if (p.wd !== 7 || p.h !== 18) continue;
      const fam = (byFamily.get(fid) ?? []).filter((m) => m.user_id && wantsWeekly(m.id));
      if (!fam.length) continue;
      const todayK = dayKey(now, tz);
      const monK = addDays(todayK, 1);
      const sunK = addDays(monK, 6);
      const key = `weekly:${monK}`;
      const { data: sent } = await db.from("notifications").select("member_id").eq("family_id", fid).eq("group_key", key);
      const already = new Set((sent ?? []).map((x) => x.member_id as string));
      const todo = fam.filter((m) => !already.has(m.id));
      if (!todo.length) continue;
      const from = atTime(monK, 0, 0, tz);
      const to = atTime(addDays(sunK, 1), 0, 0, tz);
      const { data: wevs, error: we } = await db
        .from("cal_events").select(EV_COLS).eq("family_id", fid).is("deleted_at", null)
        .lt("starts_at", to.toISOString()).or(`rrule.not.is.null,ends_at.gte.${from.toISOString()},recurrence_of.not.is.null`).limit(3000);
      if (we) { counts.failed++; continue; }
      const occs = expandStarts((wevs ?? []) as Ev[], from, to, tz).filter((o) => o.event.type !== "reminder");
      const bdays = (byFamily.get(fid) ?? [])
        .filter((m) => m.birthday)
        .map((m) => {
          const [, bm, bd] = splitKey(m.birthday!);
          for (let k = monK; k <= sunK; k = addDays(k, 1)) if (Number(k.slice(5, 7)) === bm && Number(k.slice(8)) === bd) return { name: m.display_name, k };
          return null;
        })
        .filter((x): x is { name: string; k: string } => !!x);
      const rows: NewNote[] = todo.map((m) => {
        const n = occs.filter((o) => sees(o.event, m.id)).length + bdays.length;
        const b = bdays[0];
        const body = n === 0
          ? "Nothing on the calendar next week yet."
          : `${n} ${n === 1 ? "thing" : "things"} next week${b ? `, including ${b.name}'s birthday on ${dayName(weekdayOf(b.k))}` : ""}.`;
        return { family_id: fid, member_id: m.id, kind: "weekly", title: "Your week ahead", body, link: "/m/calendar", group_key: key };
      });
      for (const r of rows) {
        const { error } = await db.from("notifications").insert(r);
        if (!error) counts.weekly++;
      }
    }

    // ---------------------------------------------------------------- send what's waiting
    const pub = Deno.env.get("VAPID_PUBLIC_KEY");
    const priv = Deno.env.get("VAPID_PRIVATE_KEY");
    const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@luexgroup.com";
    if (!pub || !priv) throw new Error("Push keys are not set");
    webpush.setVapidDetails(subject, pub, priv);

    while (Date.now() - began < BUDGET_MS) {
      const { data: waiting, error: we } = await db
        .from("notifications").select("id").is("pushed_at", null).lte("send_after", new Date().toISOString())
        .order("send_after").limit(200);
      if (we) throw we;
      if (!waiting?.length) break;
      // claim them (marked as pushed before sending, so they are never sent twice)
      const { data: mine, error: ce } = await db
        .from("notifications").update({ pushed_at: new Date().toISOString() })
        .in("id", waiting.map((w) => w.id)).is("pushed_at", null)
        .select("id, member_id, title, body, link, group_key, count");
      if (ce) throw ce;
      if (!mine?.length) continue;
      const memberIds = [...new Set(mine.map((n) => n.member_id as string))];
      const { data: subs, error: se } = await db.from("push_subscriptions").select("id, member_id, endpoint, p256dh, auth").in("member_id", memberIds);
      if (se) throw se;
      const subsOf = new Map<string, { id: string; endpoint: string; p256dh: string; auth: string }[]>();
      for (const s of subs ?? []) {
        if (!subsOf.has(s.member_id as string)) subsOf.set(s.member_id as string, []);
        subsOf.get(s.member_id as string)!.push(s as never);
      }
      const jobs: Promise<void>[] = [];
      const gone = new Set<string>();
      for (const n of mine) {
        const payload = JSON.stringify({ title: n.title, body: n.body, link: n.link ?? "/m/calendar", tag: (n.group_key as string | null) ?? (n.id as string) });
        for (const s of subsOf.get(n.member_id as string) ?? []) {
          jobs.push(
            webpush
              .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: "normal" })
              .then(() => { counts.sent++; })
              .catch((e: { statusCode?: number }) => {
                if (e?.statusCode === 404 || e?.statusCode === 410) gone.add(s.id);
                else counts.failed++;
              }),
          );
          if (jobs.length >= 25) { await Promise.all(jobs.splice(0)); }
        }
      }
      await Promise.all(jobs);
      if (gone.size) {
        await db.from("push_subscriptions").delete().in("id", [...gone]);
        counts.devicesGone += gone.size;
      }
      if (mine.length < 200) break;
    }

    console.log(JSON.stringify({ ok: true, ms: Date.now() - began, ...counts }));
    return json({ ok: true, ...counts });
  } catch (e) {
    console.error(JSON.stringify({ ok: false, ms: Date.now() - began, error: (e as Error)?.message?.slice(0, 200), ...counts }));
    return json({ ok: false }, 500);
  }
});
