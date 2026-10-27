// Local self-check (not part of the app tests): npx -y tsx --tsconfig supabase/functions/_shared/tsconfig.check.json supabase/functions/_shared/ics.check.ts
import { parseIcs, normaliseRule } from "./ics.ts";
import { expandStarts } from "./recurrence.ts";
import { dayKey, fromWall, timeOf } from "./time.ts";
import { isPrivateAddress } from "./safe-fetch.ts";

let fails = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { fails++; console.log(`FAIL ${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); }
};
const TZ = "Europe/London";

const ics = [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
  "BEGIN:VTIMEZONE", "TZID:Europe/London", "BEGIN:STANDARD", "DTSTART:19701025T020000", "END:STANDARD", "END:VTIMEZONE",
  "BEGIN:VEVENT", "DTSTART;TZID=Europe/London:20261019T170000", "DTEND;TZID=Europe/London:20261019T180000",
  "RRULE:FREQ=WEEKLY;WKST=MO;UNTIL=20261130T235959Z;BYDAY=MO", "EXDATE;TZID=Europe/London:20261026T170000",
  "UID:swim@google.com", "SUMMARY:Swimming\\, lessons", "LOCATION:Leisure centre", "DESCRIPTION:Bring goggles\\nand towel",
  "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:This is an event reminder", "END:VALARM", "END:VEVENT",
  "BEGIN:VEVENT", "DTSTART;TZID=Europe/London:20261109T183000", "DTEND;TZID=Europe/London:20261109T193000",
  "RECURRENCE-ID;TZID=Europe/London:20261109T170000", "UID:swim@google.com", "SUMMARY:Swimming (late)", "END:VEVENT",
  "BEGIN:VEVENT", "RECURRENCE-ID;TZID=Europe/London:20261116T170000", "DTSTART;TZID=Europe/London:20261116T170000",
  "UID:swim@google.com", "STATUS:CANCELLED", "SUMMARY:Swimming", "END:VEVENT",
  "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20261030", "DTEND;VALUE=DATE:20261102", "UID:trip-1", "SUMMARY:Half term trip", "END:VEVENT",
  "BEGIN:VEVENT", "DTSTART:20261028T090000Z", "DURATION:PT45M", "UID:gp", "SUMMARY:GP", "END:VEVENT",
  "BEGIN:VEVENT", "DTSTART;TZID=GMT Standard Time:20261201T100000", "DTEND;TZID=GMT Standard Time:20261201T110000",
  "UID:outlook-1", "SUMMARY:Outlook thing", "RRULE:FREQ=MONTHLY;BYDAY=1TU;X-FOO=1", "END:VEVENT",
  "BEGIN:VEVENT", "DTSTART:20261201T100000Z", "UID:weird", "RRULE:FREQ=HOURLY", "SUMMARY:Hourly", "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n").replace("Bring goggles\\nand towel", "Bring goggles\\nand\r\n  towel");

const evs = parseIcs(ics, TZ);
eq(evs.length, 7, "event count");
const swim = evs.find((e) => e.uid === "swim@google.com" && !e.recurrenceId)!;
eq(swim.title, "Swimming, lessons", "unescape");
eq(swim.description, "Bring goggles\nand towel", "unfold + newline");
eq(timeOf(swim.start, TZ), "17:00", "start time");
eq(swim.rrule, "FREQ=WEEKLY;WKST=MO;UNTIL=20261130T235959Z;BYDAY=MO", "rule kept, until in wall time");
eq(swim.exdates.map((d) => dayKey(d, TZ)), ["2026-10-26"], "exdate");
const late = evs.find((e) => e.recurrenceId && !e.cancelled)!;
eq(timeOf(late.recurrenceId!, TZ), "17:00", "recurrence id");
eq(evs.filter((e) => e.cancelled).length, 1, "cancelled");
const trip = evs.find((e) => e.uid === "trip-1")!;
eq([trip.allDay, dayKey(trip.start, TZ), dayKey(trip.end, TZ)], [true, "2026-10-30", "2026-11-01"], "all-day span (end inclusive)");
const gp = evs.find((e) => e.uid === "gp")!;
eq((gp.end.getTime() - gp.start.getTime()) / 60000, 45, "duration");
const ol = evs.find((e) => e.uid === "outlook-1")!;
eq([timeOf(ol.start, TZ), ol.rrule], ["10:00", "FREQ=MONTHLY;BYDAY=1TU"], "windows zone, X- part dropped");
eq(evs.find((e) => e.uid === "weird")!.rrule, null, "unsupported rule dropped");
eq(normaliseRule("FREQ=DAILY;UNTIL=20261231", TZ).rule, "FREQ=DAILY;UNTIL=20261231T235959Z", "date until");

// expansion: Mondays 19 Oct to 30 Nov, minus 26 Oct, 9 Nov moved to 18:30
const rows = [
  { id: "m", starts_at: swim.start.toISOString(), ends_at: swim.end.toISOString(), all_day: false, rrule: swim.rrule, exdates: swim.exdates.map((d) => d.toISOString()), recurrence_of: null, recurrence_date: null },
  { id: "o", starts_at: late.start.toISOString(), ends_at: late.end.toISOString(), all_day: false, rrule: null, exdates: [], recurrence_of: "m", recurrence_date: late.recurrenceId!.toISOString() },
];
const occ = expandStarts(rows, fromWall(2026, 10, 1, 0, 0, TZ), fromWall(2027, 1, 1, 0, 0, TZ), TZ);
eq(occ.map((o) => `${o.startDay} ${timeOf(o.start, TZ)}`), ["2026-10-19 17:00", "2026-11-02 17:00", "2026-11-09 18:30", "2026-11-16 17:00", "2026-11-23 17:00", "2026-11-30 17:00"], "expand across clock change");

eq([isPrivateAddress("10.1.2.3"), isPrivateAddress("169.254.169.254"), isPrivateAddress("100.64.0.1"), isPrivateAddress("8.8.8.8")], [true, true, true, false], "v4 private");
eq([isPrivateAddress("::1"), isPrivateAddress("fd00::1"), isPrivateAddress("fe80::1"), isPrivateAddress("::ffff:127.0.0.1"), isPrivateAddress("2a00:1450::1")], [true, true, true, true, false], "v6 private");

console.log(fails ? `${fails} FAILED` : "ALL ICS CHECKS PASSED");
if (fails) process.exit(1);
