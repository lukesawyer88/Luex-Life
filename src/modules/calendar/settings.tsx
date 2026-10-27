import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Check, Download, Home, Loader2, MapPin, Palette, RefreshCw, School, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ColourPicker } from "@/components/colour-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { pushState, turnPushOff, turnPushOn, type PushState } from "@/lib/push";
import { supabase } from "@/lib/supabase";

import { prefsOf, saveNotifPrefs, useFeeds, useNotifPrefs, usePlaces, useTerms, type Feed, type NotifPrefs, type Place, type Term } from "./data";
import { dayKey, relativeDays, shortDate, todayKey } from "./time";
import { EVENT_TYPES, typeInfo, type CalendarPrefs, type EventType } from "./types";
import { Chip, Field, PeoplePicker, Sheet, Tabs } from "./ui";
import { findTown, type Place as Town } from "./weather";

type Section = "alerts" | "look" | "home" | "terms" | "places" | "imports";

const SELECT = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";

export function CalendarSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { isParent } = useFamilyState();
  const [section, setSection] = useState<Section>("alerts");
  const items: { key: Section; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "alerts", label: "Notifications", icon: Bell },
    { key: "look", label: "Colours and names", icon: Palette },
    ...(isParent ? [{ key: "home" as const, label: "Home town", icon: Home }] : []),
    { key: "terms", label: "School terms", icon: School },
    { key: "places", label: "Places", icon: MapPin },
    ...(isParent ? [{ key: "imports" as const, label: "Import calendars", icon: Download }] : []),
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Calendar settings" wide>
      <div className="space-y-5">
        <Tabs<Section> value={section} onChange={setSection} items={items} />
        {section === "alerts" ? <AlertsSection /> : null}
        {section === "look" ? <LookSection /> : null}
        {section === "home" && isParent ? <HomeSection /> : null}
        {section === "terms" ? <TermsSection /> : null}
        {section === "places" ? <PlacesSection /> : null}
        {section === "imports" && isParent ? <ImportsSection /> : null}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- notifications

function AlertsSection() {
  const { family, me, isParent } = useFamilyState();
  const qc = useQueryClient();
  const prefsQ = useNotifPrefs();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pushState().then(setState).catch(() => setState("unsupported"));
  }, []);

  async function togglePush() {
    setBusy(true);
    try {
      if (state === "on") await turnPushOff();
      else await turnPushOn();
      setState(await pushState());
      toast.success(state === "on" ? "Notifications are off on this device" : "Notifications are on for this device");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function update(patch: Partial<Pick<NotifPrefs, "changes" | "reminders" | "weekly" | "wishlists">>) {
    const cur = prefsQ.data;
    if (!cur) return;
    try {
      await saveNotifPrefs(me.id, family.id, { changes: cur.changes, reminders: cur.reminders, weekly: cur.weekly, wishlists: cur.wishlists, ...patch });
      await qc.invalidateQueries({ queryKey: ["cal", family.id, "prefs", me.id] });
    } catch (err) {
      toast.error(friendlyError(err));
    }
  }

  const p = prefsQ.data;
  return (
    <div className="space-y-5">
      <div className="glass-tile space-y-2 p-4">
        <p className="flex items-center gap-2 font-semibold">{state === "on" ? <Bell className="size-5" /> : <BellOff className="size-5" />} Notifications on this device</p>
        {state === null ? <p className="text-sm text-muted-foreground">Checking…</p> : null}
        {state === "on" ? <p className="text-sm text-muted-foreground">This device gets your reminders and alerts.</p> : null}
        {state === "off" ? <p className="text-sm text-muted-foreground">Turn them on to get reminders, "leave now" alerts and changes.</p> : null}
        {state === "needs-home-screen" ? (
          <p className="text-sm">On an iPhone or iPad, first add Luex Life to your home screen: tap the Share button, then "Add to Home Screen". Open it from there and turn notifications on.</p>
        ) : null}
        {state === "blocked" ? <p className="text-sm">Notifications are blocked for Luex Life. Allow them in your browser or phone settings, then come back here.</p> : null}
        {state === "unsupported" ? <p className="text-sm">This browser can't show notifications. Try Chrome, Edge, Firefox or Safari on a phone.</p> : null}
        {state === "on" || state === "off" ? (
          <Button className="h-11 rounded-full" variant={state === "on" ? "outline" : "default"} onClick={togglePush} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : state === "on" ? "Turn off on this device" : "Turn on notifications"}
          </Button>
        ) : null}
      </div>

      {p ? (
        <>
          <Field label="When someone changes the calendar">
            <div className="flex flex-wrap gap-1.5">
              <Chip on={p.changes === "all"} onClick={() => update({ changes: "all" })}>Tell me about everything</Chip>
              <Chip on={p.changes === "mine"} onClick={() => update({ changes: "mine" })}>Only things for me</Chip>
              <Chip on={p.changes === "off"} onClick={() => update({ changes: "off" })}>Don't tell me</Chip>
            </div>
          </Field>
          <Toggle label="Event reminders and leave-now alerts" checked={p.reminders} onChange={(v) => update({ reminders: v })} />
          <Toggle label="A summary of the week on Sunday evening" checked={p.weekly} onChange={(v) => update({ weekly: v })} />
          {isParent ? <Toggle label="When someone changes their wish list" checked={p.wishlists} onChange={(v) => update({ wishlists: v })} /> : null}
          <p className="text-xs text-muted-foreground">Changes are grouped, so you get one alert instead of lots.</p>
        </>
      ) : (
        <Loader2 className="size-5 animate-spin" />
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

// ---------------------------------------------------------------- colours and names

function LookSection() {
  const { family, isParent } = useFamilyState();
  const qc = useQueryClient();
  const saved = prefsOf(family);
  const [prefs, setPrefs] = useState<CalendarPrefs>(saved);
  const [picking, setPicking] = useState<EventType | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setPrefs(prefsOf(family)), [family]);

  function setType(k: EventType, patch: { label?: string; colour?: string }) {
    setPrefs((p) => ({ ...p, types: { ...(p.types ?? {}), [k]: { ...(p.types?.[k] ?? {}), ...patch } } }));
  }

  async function save() {
    setBusy(true);
    try {
      const clean: CalendarPrefs = { ...prefs, types: {} };
      for (const t of EVENT_TYPES) {
        const o = prefs.types?.[t.key];
        const label = o?.label?.trim().slice(0, 30);
        const colour = o?.colour && /^#[0-9a-fA-F]{6}$/.test(o.colour) ? o.colour : undefined;
        if ((label && label !== t.label) || colour) clean.types![t.key] = { ...(label && label !== t.label ? { label } : {}), ...(colour ? { colour } : {}) };
      }
      const { error } = await supabase.from("families").update({ calendar_prefs: clean }).eq("id", family.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["family", family.id] });
      toast.success("Saved");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {!isParent ? <p className="text-sm text-muted-foreground">Only a parent can change these.</p> : null}
      <div className="space-y-2">
        {EVENT_TYPES.map((t) => {
          const info = typeInfo(t.key, prefs);
          const Icon = info.icon;
          return (
            <div key={t.key} className="glass-tile space-y-2 p-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!isParent}
                  onClick={() => setPicking(picking === t.key ? null : t.key)}
                  className="grid size-11 shrink-0 place-items-center rounded-full text-white"
                  style={{ background: info.colour }}
                  aria-label={`Change the colour for ${info.label}`}
                >
                  <Icon className="size-5" />
                </button>
                <Input
                  value={prefs.types?.[t.key]?.label ?? t.label}
                  maxLength={30}
                  disabled={!isParent}
                  onChange={(e) => setType(t.key, { label: e.target.value })}
                  className="h-11"
                  aria-label={`Name for ${t.label}`}
                />
              </div>
              {picking === t.key && isParent ? (
                <div className="flex flex-wrap items-center gap-2">
                  <ColourPicker value={prefs.types?.[t.key]?.colour ?? ""} onChange={(c) => setType(t.key, { colour: c })} />
                  <Button variant="ghost" className="h-11 rounded-full" onClick={() => setType(t.key, { colour: undefined })}>Original colour</Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <Toggle label="Show Christmas with its wish list button" checked={prefs.christmas !== false} onChange={(v) => setPrefs((p) => ({ ...p, christmas: v }))} disabled={!isParent} />
      <Field label="The week starts on">
        <div className="flex gap-1.5">
          <Chip on={(prefs.weekStart ?? 1) === 1} disabled={!isParent} onClick={() => setPrefs((p) => ({ ...p, weekStart: 1 }))}>Monday</Chip>
          <Chip on={prefs.weekStart === 7} disabled={!isParent} onClick={() => setPrefs((p) => ({ ...p, weekStart: 7 }))}>Sunday</Chip>
        </div>
      </Field>
      {isParent ? (
        <Button className="h-11 rounded-full px-6" onClick={save} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}</Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- home town and time zone

const ZONES = [
  ["Europe/London", "UK"],
  ["Europe/Dublin", "Ireland"],
  ["Europe/Paris", "France, Belgium"],
  ["Europe/Madrid", "Spain"],
  ["Europe/Berlin", "Germany, Netherlands"],
  ["Europe/Lisbon", "Portugal"],
  ["America/New_York", "US Eastern"],
  ["America/Chicago", "US Central"],
  ["America/Los_Angeles", "US Pacific"],
  ["Australia/Sydney", "Sydney"],
  ["Asia/Dubai", "Dubai"],
] as const;

function HomeSection() {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Town[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(e: FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      setFound(await findTown(q));
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function save(patch: { weather_place?: string | null; weather_lat?: number | null; weather_lon?: number | null; timezone?: string }) {
    try {
      const { error } = await supabase.from("families").update(patch).eq("id", family.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["family", family.id] });
      toast.success("Saved");
    } catch (err) {
      toast.error(friendlyError(err));
    }
  }

  return (
    <div className="space-y-5">
      <Field label="Home town" hint="Used to show the weather on each day.">
        {family.weather_place ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="glass-tile inline-flex min-h-11 items-center gap-2 px-3 font-medium"><MapPin className="size-4" /> {family.weather_place}</span>
            <Button variant="ghost" className="h-11 rounded-full" onClick={() => save({ weather_place: null, weather_lat: null, weather_lon: null })}>Remove</Button>
          </div>
        ) : null}
        <form onSubmit={search} className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type your town" className="h-11" aria-label="Town" maxLength={80} />
          <Button type="submit" className="h-11 rounded-full" disabled={busy || q.trim().length < 2}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Find"}</Button>
        </form>
        {found ? (
          <div className="mt-2 space-y-1.5">
            {found.length === 0 ? <p className="text-sm text-muted-foreground">No towns found. Check the spelling.</p> : null}
            {found.map((t) => (
              <button
                key={`${t.lat},${t.lon}`}
                type="button"
                className="glass-tile flex min-h-12 w-full items-center gap-2 px-3 text-left text-sm"
                onClick={() => { void save({ weather_place: t.name.slice(0, 80), weather_lat: Number(t.lat.toFixed(5)), weather_lon: Number(t.lon.toFixed(5)) }); setFound(null); setQ(""); }}
              >
                <MapPin className="size-4" /> <b>{t.name}</b> <span className="text-muted-foreground">{t.detail}</span>
              </button>
            ))}
          </div>
        ) : null}
      </Field>
      <Field label="Time zone" hint="Everyone in the family sees times in this zone.">
        <select value={family.timezone} onChange={(e) => save({ timezone: e.target.value })} className={SELECT} aria-label="Time zone">
          {ZONES.some(([z]) => z === family.timezone) ? null : <option value={family.timezone}>{family.timezone}</option>}
          {ZONES.map(([z, label]) => <option key={z} value={z}>{label} ({z.split("/")[1].replace("_", " ")})</option>)}
        </select>
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------- school terms

const KIND_LABEL = { term: "Term time", holiday: "Holiday", inset: "Inset day" } as const;
const KIND_BG = { term: "var(--ev-term)", holiday: "var(--ev-holiday)", inset: "var(--ev-inset)" } as const;

function TermsSection() {
  const { family, isParent } = useFamilyState();
  const qc = useQueryClient();
  const q = useTerms();
  const [edit, setEdit] = useState<Partial<Term> | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayKey(family.timezone);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit?.name?.trim() || !edit.starts_on || !edit.ends_on) return;
    setBusy(true);
    try {
      const row = { name: edit.name.trim(), kind: edit.kind ?? "holiday", label: edit.label?.trim() || null, starts_on: edit.starts_on, ends_on: edit.ends_on < edit.starts_on ? edit.starts_on : edit.ends_on };
      const { error } = edit.id
        ? await supabase.from("cal_terms").update(row).eq("id", edit.id)
        : await supabase.from("cal_terms").insert({ ...row, family_id: family.id });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["cal", family.id] });
      setEdit(null);
      toast.success("Saved");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: Term) {
    if (!window.confirm(`Remove ${t.name}?`)) return;
    const { error } = await supabase.from("cal_terms").delete().eq("id", t.id);
    if (error) return void toast.error(friendlyError(error));
    await qc.invalidateQueries({ queryKey: ["cal", family.id] });
  }

  const list = (q.data ?? []).filter((t) => t.ends_on >= today);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Terms and holidays show as a coloured strip across the days.</p>
      {list.length === 0 && !q.isLoading ? <p className="text-sm">No school dates yet.</p> : null}
      <div className="space-y-1.5">
        {list.map((t) => (
          <div key={t.id} className="glass-tile flex min-h-12 items-center gap-3 px-3 py-2">
            <span className="h-8 w-2 shrink-0 rounded-full" style={{ background: KIND_BG[t.kind as keyof typeof KIND_BG] }} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{t.name}{t.label ? <span className="font-normal text-muted-foreground"> · {t.label}</span> : null}</p>
              <p className="text-xs text-muted-foreground">{KIND_LABEL[t.kind as keyof typeof KIND_LABEL]}: {t.starts_on === t.ends_on ? shortDate(t.starts_on) : `${shortDate(t.starts_on)} to ${shortDate(t.ends_on)}`}</p>
            </div>
            {isParent ? (
              <>
                <Button variant="ghost" className="h-10 rounded-full" onClick={() => setEdit(t)}>Change</Button>
                <Button variant="ghost" size="icon" className="size-10 rounded-full text-destructive" onClick={() => remove(t)} aria-label="Remove"><Trash2 className="size-4" /></Button>
              </>
            ) : null}
          </div>
        ))}
      </div>
      {isParent && !edit ? <Button className="h-11 rounded-full" onClick={() => setEdit({ kind: "holiday", starts_on: today, ends_on: today })}>Add school dates</Button> : null}
      {edit ? (
        <form onSubmit={save} className="glass-tile space-y-3 p-4">
          <Field label="Name"><Input value={edit.name ?? ""} maxLength={60} placeholder="e.g. October half term" onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="h-11" /></Field>
          <Field label="What is it?">
            <div className="flex flex-wrap gap-1.5">
              {(["term", "holiday", "inset"] as const).map((k) => <Chip key={k} on={(edit.kind ?? "holiday") === k} onClick={() => setEdit({ ...edit, kind: k })}>{KIND_LABEL[k]}</Chip>)}
            </div>
          </Field>
          <Field label="School (optional)" hint="Useful if your children go to different schools."><Input value={edit.label ?? ""} maxLength={60} onChange={(e) => setEdit({ ...edit, label: e.target.value })} className="h-11" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="First day"><Input type="date" value={edit.starts_on ?? ""} onChange={(e) => setEdit({ ...edit, starts_on: e.target.value })} className="h-11" /></Field>
            <Field label="Last day"><Input type="date" min={edit.starts_on} value={edit.ends_on ?? ""} onChange={(e) => setEdit({ ...edit, ends_on: e.target.value })} className="h-11" /></Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="h-11 rounded-full px-6" disabled={busy || !edit.name?.trim()}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}</Button>
            <Button type="button" variant="ghost" className="h-11 rounded-full" onClick={() => setEdit(null)}>Cancel</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- places

function PlacesSection() {
  const { family, role, isParent } = useFamilyState();
  const qc = useQueryClient();
  const q = usePlaces();
  const [edit, setEdit] = useState<Partial<Place> | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdult = role !== "child";

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit?.name?.trim()) return;
    setBusy(true);
    try {
      const row = { name: edit.name.trim(), address: edit.address?.trim() || null, travel_minutes: edit.travel_minutes ?? null };
      const { error } = edit.id
        ? await supabase.from("cal_places").update(row).eq("id", edit.id)
        : await supabase.from("cal_places").insert({ ...row, family_id: family.id });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["cal", family.id] });
      setEdit(null);
      toast.success("Saved");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: Place) {
    if (!window.confirm(`Remove ${p.name}? Events keep their place name.`)) return;
    const { error } = await supabase.from("cal_places").delete().eq("id", p.id);
    if (error) return void toast.error(friendlyError(error));
    await qc.invalidateQueries({ queryKey: ["cal", family.id] });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Save the places you go often with how long it takes to get there. The calendar then tells you when to leave.</p>
      <div className="space-y-1.5">
        {(q.data ?? []).map((p) => (
          <div key={p.id} className="glass-tile flex min-h-12 items-center gap-3 px-3 py-2">
            <MapPin className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{p.name}</p>
              <p className="truncate text-xs text-muted-foreground">{p.travel_minutes != null ? `${p.travel_minutes} minutes away` : "No journey time"}{p.address ? ` · ${p.address}` : ""}</p>
            </div>
            {isAdult ? <Button variant="ghost" className="h-10 rounded-full" onClick={() => setEdit(p)}>Change</Button> : null}
            {isParent ? <Button variant="ghost" size="icon" className="size-10 rounded-full text-destructive" onClick={() => remove(p)} aria-label="Remove"><Trash2 className="size-4" /></Button> : null}
          </div>
        ))}
        {q.data && !q.data.length ? <p className="text-sm">No places saved yet.</p> : null}
      </div>
      {isAdult && !edit ? <Button className="h-11 rounded-full" onClick={() => setEdit({})}>Add a place</Button> : null}
      {edit ? (
        <form onSubmit={save} className="glass-tile space-y-3 p-4">
          <Field label="Name"><Input value={edit.name ?? ""} maxLength={80} placeholder="e.g. School, Swimming pool, Gran's" onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="h-11" /></Field>
          <Field label="Address (optional)"><Input value={edit.address ?? ""} maxLength={200} onChange={(e) => setEdit({ ...edit, address: e.target.value })} className="h-11" /></Field>
          <Field label="How many minutes to get there?">
            <Input type="number" inputMode="numeric" min={0} max={600} value={edit.travel_minutes ?? ""} onChange={(e) => setEdit({ ...edit, travel_minutes: e.target.value === "" ? null : Math.max(0, Math.min(600, Number(e.target.value))) })} className="h-11 w-32" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" className="h-11 rounded-full px-6" disabled={busy || !edit.name?.trim()}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}</Button>
            <Button type="button" variant="ghost" className="h-11 rounded-full" onClick={() => setEdit(null)}>Cancel</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- import calendars (parents)

type FeedDraft = { id?: string; name: string; url: string; type: EventType; people: string[]; visibility: "all" | "selected"; viewers: string[] };

function ImportsSection() {
  const { family, me, members } = useFamilyState();
  const qc = useQueryClient();
  const q = useFeeds(true);
  const [edit, setEdit] = useState<FeedDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const tz = family.timezone;
  const today = todayKey(tz);
  const refresh = () => qc.invalidateQueries({ queryKey: ["cal", family.id] });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const url = edit.url.trim();
    if (!/^(https|webcal):\/\//i.test(url)) return void toast.error("The link should start with https:// or webcal://");
    setBusy(true);
    try {
      const row = {
        name: edit.name.trim(), url, type: edit.type, people: edit.people, visibility: edit.visibility,
        viewers: edit.visibility === "selected" ? edit.viewers.filter((v) => v !== me.id) : [],
      };
      if (edit.id) {
        const { error } = await supabase.from("cal_feeds").update(row).eq("id", edit.id);
        if (error) throw error;
        setEdit(null);
        await refresh();
        toast.success("Saved");
      } else {
        const { data, error } = await supabase.from("cal_feeds").insert({ ...row, family_id: family.id }).select("id").single();
        if (error) throw error;
        setEdit(null);
        await refresh();
        await syncNow(data.id as string);
      }
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function syncNow(feedId: string) {
    setSyncing(feedId);
    try {
      const { data, error } = await supabase.functions.invoke("import-feeds", { body: { feedId } });
      if (error) throw error;
      const r = data as { ok?: boolean; count?: number; error?: string } | null;
      if (r?.error) toast.error(r.error);
      else toast.success(`Brought in ${r?.count ?? 0} events`);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSyncing(null);
      await refresh();
    }
  }

  async function setActive(f: Feed, active: boolean) {
    const { error } = await supabase.from("cal_feeds").update({ active }).eq("id", f.id);
    if (error) return void toast.error(friendlyError(error));
    await refresh();
  }

  async function remove(f: Feed) {
    if (!window.confirm(`Remove ${f.name}? Everything it brought in will be removed from the calendar.`)) return;
    const { error } = await supabase.from("cal_feeds").delete().eq("id", f.id);
    if (error) return void toast.error(friendlyError(error));
    await refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Bring in a work, school or club calendar. It refreshes about every 30 minutes. Imported events can only be changed in the calendar they come from.
      </p>
      <div className="space-y-1.5">
        {(q.data ?? []).map((f) => (
          <div key={f.id} className="glass-tile space-y-2 px-3 py-2.5">
            <div className="flex items-center gap-3">
              <Download className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{f.name}{f.visibility === "selected" ? <span className="font-normal text-muted-foreground"> · private</span> : null}</p>
                <p className="text-xs text-muted-foreground">
                  {f.last_synced_at ? `Last updated ${relativeDays(today, dayKey(new Date(f.last_synced_at), tz))} · ${f.event_count} events` : "Not brought in yet"}
                  {!f.active ? " · paused" : ""}
                </p>
                {f.last_error ? <p className="text-xs text-destructive">Last try failed: {f.last_error}</p> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="outline" className="h-10 rounded-full" onClick={() => syncNow(f.id)} disabled={syncing === f.id || !f.active}>
                {syncing === f.id ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Update now
              </Button>
              <Button variant="ghost" className="h-10 rounded-full" onClick={() => setEdit({ id: f.id, name: f.name, url: f.url, type: f.type as EventType, people: f.people, visibility: f.visibility as "all" | "selected", viewers: f.viewers })}>Change</Button>
              <label className="flex min-h-10 items-center gap-2 px-2 text-sm">On <Switch checked={f.active} onCheckedChange={(v) => setActive(f, v)} /></label>
              <Button variant="ghost" size="icon" className="size-10 rounded-full text-destructive" onClick={() => remove(f)} aria-label="Remove"><Trash2 className="size-4" /></Button>
            </div>
          </div>
        ))}
        {q.data && !q.data.length ? <p className="text-sm">No calendars brought in yet.</p> : null}
      </div>
      {!edit ? <Button className="h-11 rounded-full" onClick={() => setEdit({ name: "", url: "", type: "work", people: [], visibility: "all", viewers: [] })}>Import a calendar</Button> : null}
      {edit ? (
        <form onSubmit={save} className="glass-tile space-y-4 p-4">
          <Field label="Name"><Input value={edit.name} maxLength={60} placeholder="e.g. Dad's work, Football club" onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="h-11" /></Field>
          <Field
            label="Calendar link"
            hint={
              <span className="block space-y-1">
                <span className="block"><b>Google:</b> Settings, pick the calendar, then copy "Secret address in iCal format".</span>
                <span className="block"><b>Apple:</b> in the Calendar app, share the calendar as a "Public calendar" and copy the link.</span>
                <span className="block"><b>Outlook:</b> Settings, Shared calendars, Publish a calendar, then copy the "ICS" link.</span>
                <span className="block">Keep this link private: anyone with it can see that calendar.</span>
              </span>
            }
          >
            <Input value={edit.url} maxLength={1000} inputMode="url" placeholder="https:// or webcal://" onChange={(e) => setEdit({ ...edit, url: e.target.value })} className="h-11" />
          </Field>
          <Field label="Show its events as">
            <select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as EventType })} className={SELECT}>
              {EVENT_TYPES.map((t) => <option key={t.key} value={t.key}>{typeInfo(t.key, prefsOf(family)).label}</option>)}
            </select>
          </Field>
          <Field label="Who is it for?" hint="Leave empty if it's for the whole family.">
            <PeoplePicker members={members} value={edit.people} onChange={(v) => setEdit({ ...edit, people: v })} />
          </Field>
          <Field label="Who can see it?">
            <div className="flex flex-wrap gap-1.5">
              <Chip on={edit.visibility === "all"} onClick={() => setEdit({ ...edit, visibility: "all" })}>Everyone</Chip>
              <Chip on={edit.visibility === "selected"} onClick={() => setEdit({ ...edit, visibility: "selected" })}>Only people I pick</Chip>
            </div>
            {edit.visibility === "selected" ? (
              <div className="pt-2"><PeoplePicker members={members.filter((m) => m.id !== me.id && m.user_id)} value={edit.viewers} onChange={(v) => setEdit({ ...edit, viewers: v })} /></div>
            ) : null}
          </Field>
          <div className="flex gap-2">
            <Button type="submit" className="h-11 rounded-full px-6" disabled={busy || !edit.name.trim() || !edit.url.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <><Check className="size-4" /> {edit.id ? "Save" : "Bring it in"}</>}
            </Button>
            <Button type="button" variant="ghost" className="h-11 rounded-full" onClick={() => setEdit(null)}>Cancel</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
