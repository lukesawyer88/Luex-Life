// A small, forgiving iCalendar (.ics) reader for calendar imports (Google, Apple, Outlook).
// It turns each VEVENT into what the cal_events table needs, in the family's time zone.
import { addDays, dayStart, fromWall, keyOf, pad, parts, validZone } from "./time.ts";

export type IcsEvent = {
  uid: string;
  /** set on a changed single date of a repeating event */
  recurrenceId: Date | null;
  cancelled: boolean;
  title: string;
  allDay: boolean;
  start: Date;
  /** timed: the end instant; all day: 00:00 on the last day it covers (inclusive) */
  end: Date;
  rrule: string | null;
  /** the last date the rule allows, if any (for skipping old series) */
  until: Date | null;
  exdates: Date[];
  location: string | null;
  description: string | null;
};

type Prop = { name: string; params: Record<string, string>; value: string };

const WINDOWS_ZONES: Record<string, string> = {
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris",
  "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": "Europe/Warsaw",
  "E. Europe Standard Time": "Europe/Bucharest",
  "FLE Standard Time": "Europe/Kiev",
  "GTB Standard Time": "Europe/Athens",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "India Standard Time": "Asia/Kolkata",
  "China Standard Time": "Asia/Shanghai",
  "Tokyo Standard Time": "Asia/Tokyo",
  "UTC": "UTC",
  "Coordinated Universal Time": "UTC",
};

export function zoneFor(tzid: string | undefined, fallback: string): string {
  if (!tzid) return fallback;
  const z = tzid.replace(/^"|"$/g, "").replace(/^\/.*?\//, "").trim(); // some feeds prefix /mozilla.org/...
  if (WINDOWS_ZONES[z]) return WINDOWS_ZONES[z];
  return validZone(z) ? z : fallback;
}

function unfold(text: string): string[] {
  const raw = text.replace(/\r\n|\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) out[out.length - 1] += line.slice(1);
    else if (line.length) out.push(line);
  }
  return out;
}

function parseLine(line: string): Prop | null {
  // name;param=value;param="quoted:value":value
  let i = 0;
  let inQ = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ":" && !inQ) break;
  }
  if (i >= line.length) return null;
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const segs: string[] = [];
  let cur = "";
  inQ = false;
  for (const c of head) {
    if (c === '"') inQ = !inQ;
    if (c === ";" && !inQ) { segs.push(cur); cur = ""; } else cur += c;
  }
  segs.push(cur);
  const params: Record<string, string> = {};
  for (const s of segs.slice(1)) {
    const eq = s.indexOf("=");
    if (eq > 0) params[s.slice(0, eq).toUpperCase()] = s.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: segs[0].toUpperCase(), params, value };
}

export function unescapeText(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_m, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

type When = { allDay: boolean; date: Date; dayK: string | null };

/** One date or date-time value -> an instant (all-day values become 00:00 in the family zone) */
export function parseWhen(value: string, params: Record<string, string>, familyTz: string): When | null {
  const v = value.trim();
  const dm = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dm || params.VALUE === "DATE") {
    const m = dm ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    const k = keyOf(+m[1], +m[2], +m[3]);
    return { allDay: true, date: dayStart(k, familyTz), dayK: k };
  }
  const t = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!t) return null;
  const [y, mo, d, h, mi, s] = [+t[1], +t[2], +t[3], +t[4], +t[5], +(t[6] ?? 0)];
  if (t[7]) return { allDay: false, date: new Date(Date.UTC(y, mo - 1, d, h, mi, s)), dayK: null };
  const zone = zoneFor(params.TZID, familyTz);
  return { allDay: false, date: fromWall(y, mo, d, h, mi, zone, s), dayK: null };
}

function parseDuration(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const secs = (+(m[2] ?? 0)) * 604800 + (+(m[3] ?? 0)) * 86400 + (+(m[4] ?? 0)) * 3600 + (+(m[5] ?? 0)) * 60 + (+(m[6] ?? 0));
  return sign * secs * 1000;
}

const RULE_RE = /^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,+\-]+)*$/;

/** Keep only rules the app understands; UNTIL becomes wall-clock time in the family zone, as the app expects */
export function normaliseRule(rule: string, familyTz: string): { rule: string | null; until: Date | null } {
  const pieces = rule.split(";").map((p) => p.trim()).filter(Boolean);
  const map = new Map<string, string>();
  for (const p of pieces) {
    const eq = p.indexOf("=");
    if (eq < 1) continue;
    const k = p.slice(0, eq).toUpperCase();
    if (k.startsWith("X-")) continue;
    map.set(k, p.slice(eq + 1).toUpperCase());
  }
  const freq = map.get("FREQ");
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return { rule: null, until: null };
  let until: Date | null = null;
  const u = map.get("UNTIL");
  if (u) {
    const w = parseWhen(u, /^\d{8}$/.test(u) ? { VALUE: "DATE" } : {}, familyTz);
    if (!w) return { rule: null, until: null };
    if (w.allDay && w.dayK) {
      until = new Date(dayStart(addDays(w.dayK, 1), familyTz).getTime() - 1000);
      map.set("UNTIL", `${w.dayK.replace(/-/g, "")}T235959Z`);
    } else {
      until = w.date;
      const p = parts(w.date, familyTz);
      map.set("UNTIL", `${p.y}${pad(p.m)}${pad(p.d)}T${pad(p.h)}${pad(p.mi)}59Z`);
    }
  }
  const out = ["FREQ=" + freq, ...[...map.entries()].filter(([k]) => k !== "FREQ").map(([k, v]) => `${k}=${v}`)].join(";");
  if (!RULE_RE.test(out) || out.length > 300) return { rule: null, until: null };
  return { rule: out, until };
}

export function parseIcs(text: string, familyTz: string): IcsEvent[] {
  const lines = unfold(text);
  const out: IcsEvent[] = [];
  let cur: Prop[] | null = null;
  let depth = 0; // skip VALARM and other blocks inside VEVENT
  for (const line of lines) {
    const up = line.toUpperCase();
    if (up === "BEGIN:VEVENT") { cur = []; depth = 0; continue; }
    if (!cur) continue;
    if (up.startsWith("BEGIN:")) { depth++; continue; }
    if (up.startsWith("END:") && depth > 0) { depth--; continue; }
    if (up === "END:VEVENT") {
      const ev = build(cur, familyTz);
      if (ev) out.push(ev);
      cur = null;
      continue;
    }
    if (depth > 0) continue;
    const p = parseLine(line);
    if (p) cur.push(p);
  }
  return out;
}

function build(props: Prop[], tz: string): IcsEvent | null {
  const get = (n: string) => props.find((p) => p.name === n);
  const uid = get("UID")?.value.trim();
  const ds = get("DTSTART");
  if (!uid || !ds) return null;
  const start = parseWhen(ds.value, ds.params, tz);
  if (!start) return null;
  let end: Date;
  const de = get("DTEND");
  const dur = get("DURATION");
  if (start.allDay) {
    // DTEND is the day after the last day
    let lastK = start.dayK!;
    if (de) {
      const e = parseWhen(de.value, { ...de.params, VALUE: "DATE" }, tz);
      if (e?.dayK && e.dayK > start.dayK!) lastK = addDays(e.dayK, -1);
    } else if (dur) {
      const ms = parseDuration(dur.value);
      if (ms && ms > 86400000) lastK = addDays(start.dayK!, Math.round(ms / 86400000) - 1);
    }
    end = dayStart(lastK, tz);
  } else {
    const e = de ? parseWhen(de.value, de.params, tz) : null;
    const ms = dur ? parseDuration(dur.value) : null;
    end = e && !e.allDay ? e.date : ms != null ? new Date(start.date.getTime() + ms) : start.date;
    if (end < start.date) end = start.date;
  }
  // the table allows events up to 400 days long
  if (end.getTime() - start.date.getTime() > 399 * 86400000) end = new Date(start.date.getTime() + 399 * 86400000);

  const rr = get("RRULE");
  const norm = rr ? normaliseRule(rr.value, tz) : { rule: null, until: null };
  const exdates: Date[] = [];
  for (const p of props.filter((x) => x.name === "EXDATE")) {
    for (const v of p.value.split(",")) {
      const w = parseWhen(v, start.allDay ? { ...p.params, VALUE: "DATE" } : p.params, tz);
      if (w) exdates.push(w.date);
    }
  }
  const rid = get("RECURRENCE-ID");
  const ridW = rid ? parseWhen(rid.value, rid.params, tz) : null;
  const title = unescapeText(get("SUMMARY")?.value ?? "").trim() || "(No title)";
  const loc = unescapeText(get("LOCATION")?.value ?? "").trim();
  const desc = unescapeText(get("DESCRIPTION")?.value ?? "").trim();
  return {
    uid,
    recurrenceId: ridW?.date ?? null,
    cancelled: (get("STATUS")?.value ?? "").trim().toUpperCase() === "CANCELLED",
    title: title.slice(0, 120),
    allDay: start.allDay,
    start: start.date,
    end,
    rrule: ridW ? null : norm.rule,
    until: norm.until,
    exdates: exdates.slice(-500),
    location: loc ? loc.slice(0, 200) : null,
    description: desc ? desc.slice(0, 4000) : null,
  };
}
