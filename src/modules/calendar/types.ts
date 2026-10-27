import {
  Bell,
  Briefcase,
  Cake,
  CalendarDays,
  GraduationCap,
  PartyPopper,
  Plane,
  Stethoscope,
  Trophy,
  type LucideIcon,
} from "lucide-react";

export type EventType = "birthday" | "school" | "activity" | "appointment" | "social" | "trip" | "work" | "reminder" | "other";

export type TypeInfo = { key: EventType; label: string; icon: LucideIcon; colour: string };

/** The event types. Families can rename them and change the colour; the icon always stays, so colour is never the only clue. */
export const EVENT_TYPES: TypeInfo[] = [
  { key: "birthday", label: "Birthday", icon: Cake, colour: "var(--ev-birthday)" },
  { key: "school", label: "School", icon: GraduationCap, colour: "var(--ev-school)" },
  { key: "activity", label: "Clubs and sport", icon: Trophy, colour: "var(--ev-activity)" },
  { key: "appointment", label: "Appointment", icon: Stethoscope, colour: "var(--ev-appointment)" },
  { key: "social", label: "Party or visit", icon: PartyPopper, colour: "var(--ev-social)" },
  { key: "trip", label: "Trip or holiday", icon: Plane, colour: "var(--ev-trip)" },
  { key: "work", label: "Work", icon: Briefcase, colour: "var(--ev-work)" },
  { key: "reminder", label: "Reminder", icon: Bell, colour: "var(--ev-reminder)" },
  { key: "other", label: "Other", icon: CalendarDays, colour: "var(--ev-other)" },
];

export type CalendarPrefs = {
  /** renamed labels or new colours per type */
  types?: Partial<Record<EventType, { label?: string; colour?: string }>>;
  /** show Christmas with its wish list button (default yes) */
  christmas?: boolean;
  /** week starts on Monday (1) or Sunday (7) */
  weekStart?: 1 | 7;
};

export function typeInfo(t: string, prefs?: CalendarPrefs | null): TypeInfo {
  const base = EVENT_TYPES.find((x) => x.key === t) ?? EVENT_TYPES[EVENT_TYPES.length - 1];
  const o = prefs?.types?.[base.key];
  return o ? { ...base, label: o.label?.trim() || base.label, colour: o.colour || base.colour } : base;
}

export function allTypes(prefs?: CalendarPrefs | null): TypeInfo[] {
  return EVENT_TYPES.map((t) => typeInfo(t.key, prefs));
}

/** Reminder lead times people can pick (minutes before) */
export const REMINDER_CHOICES: { minutes: number; label: string }[] = [
  { minutes: 0, label: "At the time" },
  { minutes: 10, label: "10 minutes before" },
  { minutes: 30, label: "30 minutes before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 120, label: "2 hours before" },
  { minutes: 1440, label: "1 day before" },
  { minutes: 2880, label: "2 days before" },
  { minutes: 10080, label: "1 week before" },
];

export function reminderLabel(m: number): string {
  return REMINDER_CHOICES.find((x) => x.minutes === m)?.label ?? (m % 1440 === 0 ? `${m / 1440} days before` : m % 60 === 0 ? `${m / 60} hours before` : `${m} minutes before`);
}
