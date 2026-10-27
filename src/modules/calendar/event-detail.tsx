import { useQueryClient } from "@tanstack/react-query";
import {
  Bell, Camera, Car, Check, Copy, ExternalLink, FileText, Gift, History, Link2, Loader2, Lock, MapPin, Paperclip, Pencil,
  Repeat, Send, Ticket, Trash2, Undo2, X,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useExtra } from "@/lib/extras";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { fitJpeg } from "@/lib/image";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

import {
  FIELD_NAMES, prefsOf, refreshCalendar, saveEventChanges, useComments, useEvent, useEventLog, useFiles, useFileUrl,
  type CalEvent, type CalFile, type Comment,
} from "./data";
import type { Occ } from "./occurrences";
import { describeRule, untilBefore } from "./recurrence";
import { dayKey, longDate, relativeDays, shortDate, timeOf, todayKey } from "./time";
import { reminderLabel, typeInfo } from "./types";
import { Sheet } from "./ui";
import { occTime, PeopleStack, TypeDot } from "./views";
import { useWeather, weatherLook } from "./weather";

export function canEditEvent(ev: CalEvent, meId: string, isParent: boolean) {
  return ev.source === "manual" && ev.version > 0 && (isParent || ev.created_by_member === meId);
}

type Props = {
  occ: Occ;
  onEdit: (occ: Occ, series: CalEvent) => void;
  onCopy: (ev: CalEvent) => void;
  onWishList: (memberId: string | null, occasion: "birthday" | "christmas", year: number) => void;
  onClosed?: () => void;
};

/** Everything about one event. Used in the cream detail window on big screens and in a sheet on phones. */
export function EventDetail({ occ, onEdit, onCopy, onWishList, onClosed }: Props) {
  const { family, me, members, isParent } = useFamilyState();
  const qc = useQueryClient();
  const tz = family.timezone;
  const prefs = prefsOf(family);
  const ev = occ.event;
  const info = typeInfo(ev.type, prefs);
  const seriesQ = useEvent(ev.recurrence_of);
  const series: CalEvent = ev.recurrence_of ? (seriesQ.data ?? ev) : ev;
  const editable = !occ.virtual && canEditEvent(series, me.id, isParent) && canEditEvent(ev, me.id, isParent);
  const weather = useWeather(family.weather_lat, family.weather_lon, tz);
  const w = weather.data?.get(occ.startDay);
  const showHistory = useExtra("cal.history");
  const showComments = useExtra("cal.comments");
  const showTickets = true; // booking references and links are standard (Bookings lists them)
  const showCountdown = true; // countdowns on events are standard (trips use them)
  const [askDelete, setAskDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = todayKey(tz);
  const name = (id: string | null | undefined) => members.find((m) => m.id === id)?.display_name ?? "Someone";
  const travel = ev.travel_minutes;
  const leaveBy = !occ.allDay && travel ? timeOf(new Date(occ.start.getTime() - travel * 60000), tz) : null;

  // ---------------------------------------------------------------- remove (with undo)
  async function remove(scope: "one" | "after" | "all" | null) {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      let undo: () => Promise<unknown>;
      if (!series.rrule || scope === null) {
        const saved = await saveEventChanges(ev, { deleted_at: now }, true);
        undo = () => saveEventChanges(saved, { deleted_at: null }, true);
      } else if (scope === "one") {
        const before = series.exdates;
        const saved = await saveEventChanges(series, { exdates: [...before, occ.originalStart.toISOString()] }, true);
        if (ev.id !== series.id) await supabase.from("cal_events").update({ deleted_at: now }).eq("id", ev.id);
        undo = async () => {
          await saveEventChanges(saved, { exdates: before }, true);
          if (ev.id !== series.id) await supabase.from("cal_events").update({ deleted_at: null }).eq("id", ev.id);
        };
      } else if (scope === "after" && occ.originalStart.getTime() > new Date(series.starts_at).getTime()) {
        const before = series.rrule;
        const saved = await saveEventChanges(series, { rrule: untilBefore(series.rrule, occ.originalStart, tz) }, true);
        undo = () => saveEventChanges(saved, { rrule: before }, true);
      } else {
        const saved = await saveEventChanges(series, { deleted_at: now }, true);
        undo = () => saveEventChanges(saved, { deleted_at: null }, true);
      }
      await refreshCalendar(qc, family.id);
      setAskDelete(false);
      onClosed?.();
      toast.success(`${ev.title} removed`, {
        action: {
          label: "Undo",
          onClick: () => {
            void undo().then(() => refreshCalendar(qc, family.id)).catch((e) => toast.error(friendlyError(e)));
          },
        },
        duration: 8000,
      });
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleDone() {
    try {
      await saveEventChanges(ev, { done_at: ev.done_at ? null : new Date().toISOString() }, true);
      await refreshCalendar(qc, family.id);
    } catch (err) {
      toast.error(friendlyError(err));
    }
  }

  const wishOwner = occ.virtual?.kind === "birthday" ? occ.virtual.memberId ?? null : ev.type === "birthday" && ev.people.length === 1 ? ev.people[0] : null;
  const wishYear = Number(occ.startDay.slice(0, 4));

  return (
    <div className="space-y-4">
      {/* heading */}
      <div className="flex items-start gap-3">
        <TypeDot occ={occ} prefs={prefs} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className={cn("text-lg font-bold leading-tight", ev.done_at && "line-through opacity-60")}>{ev.title}</h2>
          <p className="text-sm opacity-75">{occ.virtual?.kind === "christmas" ? "Christmas" : info.label}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        {occ.repeats && !occ.virtual ? <Badge icon={Repeat}>{describeRule(series.rrule, dayKey(new Date(series.starts_at), tz))}</Badge> : null}
        {ev.visibility === "selected" ? <Badge icon={Lock}>Only {[ev.created_by_member, ...ev.viewers].filter(Boolean).map((id) => (id === me.id ? "you" : name(id))).join(", ")} can see this</Badge> : null}
        {ev.source === "import" ? <Badge icon={Link2}>From another calendar. Change it there</Badge> : null}
        {ev.recurrence_of ? <Badge icon={Pencil}>Changed for this date only</Badge> : null}
      </div>

      {/* when */}
      <Section>
        <p className="font-semibold">{occ.startDay === occ.endDay ? longDate(occ.startDay) : `${shortDate(occ.startDay)} to ${shortDate(occ.endDay)}`}</p>
        <p className="text-sm opacity-80">
          {occTime(occ, tz)} · {relativeDays(today, occ.startDay)}
          {showCountdown && ev.countdown && occ.startDay > today ? ` · ${countdownText(today, occ.startDay)}` : ""}
        </p>
        {w ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm opacity-80">
            {(() => { const { icon: I, label } = weatherLook(w.code); return <><I className="size-4" /> {label}, {w.min}° to {w.max}°{w.rain >= 30 ? `, ${w.rain}% chance of rain` : ""}</>; })()}
          </p>
        ) : null}
      </Section>

      {ev.people.length || ev.driver ? (
        <Section>
          {ev.people.length ? (
            <div className="flex items-center gap-2 text-sm">
              <PeopleStack ids={ev.people} members={members} max={6} />
              <span>For {ev.people.map((id) => (id === me.id ? "you" : name(id))).join(", ")}</span>
            </div>
          ) : null}
          {ev.driver ? <p className="mt-1.5 flex items-center gap-2 text-sm"><Car className="size-4" /> {ev.driver === me.id ? "You're" : `${name(ev.driver)} is`} taking them</p> : null}
        </Section>
      ) : null}

      {ev.location || leaveBy ? (
        <Section>
          {ev.location ? <p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="size-4" /> {ev.location}</p> : null}
          {leaveBy ? <p className="mt-0.5 text-sm opacity-80">{travel} minutes away. Leave by <b>{leaveBy}</b>.</p> : null}
          {ev.location ? (
            <a className="mt-1 inline-flex items-center gap-1 text-sm underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}`} target="_blank" rel="noreferrer">
              Open in maps <ExternalLink className="size-3" />
            </a>
          ) : null}
        </Section>
      ) : null}

      {ev.reminders.length ? (
        <Section>
          <p className="flex items-start gap-2 text-sm"><Bell className="mt-0.5 size-4" /> {ev.reminders.slice().sort((a, b) => b - a).map(reminderLabel).join(", ")}</p>
        </Section>
      ) : null}

      {ev.notes || (showTickets && (ev.booking_ref || ev.link)) ? (
        <Section>
          {ev.notes ? <p className="whitespace-pre-wrap text-sm">{ev.notes}</p> : null}
          {showTickets && ev.booking_ref ? <p className="mt-1.5 flex items-center gap-2 text-sm"><Ticket className="size-4" /> Reference: <b className="select-all">{ev.booking_ref}</b></p> : null}
          {showTickets && ev.link ? <a className="mt-1.5 flex items-center gap-2 break-all text-sm underline" href={ev.link} target="_blank" rel="noreferrer noopener"><Link2 className="size-4 shrink-0" /> {ev.link.replace(/^https?:\/\//, "")}</a> : null}
        </Section>
      ) : null}

      {/* actions */}
      <div className="flex flex-wrap gap-2">
        {ev.type === "reminder" && editable ? (
          <Button className="h-11 rounded-full" variant={ev.done_at ? "outline" : "default"} onClick={toggleDone}>
            <Check className="size-4" /> {ev.done_at ? "Not done yet" : "Mark as done"}
          </Button>
        ) : null}
        {wishOwner || occ.virtual?.kind === "christmas" ? (
          <Button className="h-11 rounded-full" onClick={() => onWishList(occ.virtual?.kind === "christmas" ? me.id : wishOwner, occ.virtual?.kind === "christmas" ? "christmas" : "birthday", wishYear)}>
            <Gift className="size-4" /> {occ.virtual?.kind === "christmas" ? "Christmas wish lists" : wishOwner === me.id ? "My wish list" : `${name(wishOwner)}'s wish list`}
          </Button>
        ) : null}
        {editable ? (
          <Button variant="outline" className="h-11 rounded-full" onClick={() => onEdit(occ, series)}><Pencil className="size-4" /> Change</Button>
        ) : null}
        {!occ.virtual && ev.source === "manual" ? (
          <Button variant="outline" className="h-11 rounded-full" onClick={() => onCopy(ev)}><Copy className="size-4" /> Copy</Button>
        ) : null}
        {editable ? (
          <Button variant="ghost" className="h-11 rounded-full text-destructive" onClick={() => (series.rrule ? setAskDelete(true) : void remove(null))} disabled={busy}>
            <Trash2 className="size-4" /> Remove
          </Button>
        ) : null}
      </div>
      {occ.virtual?.kind === "birthday" ? <p className="text-xs opacity-70">Birthdays come from each person's profile in Family.</p> : null}

      {!occ.virtual ? (
        <>
          <Files eventId={ev.id} />
          {showComments ? <Comments eventId={ev.id} /> : null}
          {showHistory ? <EventHistory eventId={ev.id} /> : (
            ev.created_by_member ? <p className="text-xs opacity-70">Added by {ev.created_by_member === me.id ? "you" : name(ev.created_by_member)}</p> : null
          )}
        </>
      ) : null}

      <Sheet open={askDelete} onOpenChange={setAskDelete} title="This event repeats" description="Which dates should be removed?">
        <div className="grid gap-2">
          <Button variant="destructive" className="h-12 rounded-full" disabled={busy} onClick={() => remove("one")}>Just {shortDate(occ.startDay)}</Button>
          <Button variant="outline" className="h-12 rounded-full" disabled={busy} onClick={() => remove("after")}>This date and all after it</Button>
          <Button variant="outline" className="h-12 rounded-full" disabled={busy} onClick={() => remove("all")}>Every date</Button>
        </div>
      </Sheet>
    </div>
  );
}

export function countdownText(today: string, k: string) {
  const n = Math.round((Date.parse(k) - Date.parse(today)) / 86400000);
  return n === 1 ? "1 sleep to go" : `${n} sleeps to go`;
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-white/45 p-3 dark:bg-black/15">{children}</div>;
}
function Badge({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-white/55 px-2.5 py-1 font-medium dark:bg-black/20"><Icon className="size-3.5" /> {children}</span>;
}

// ---------------------------------------------------------------- photos and files

function Files({ eventId }: { eventId: string }) {
  const { family, me, isParent } = useFamilyState();
  const qc = useQueryClient();
  const q = useFiles(eventId);
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function add(file: File) {
    setBusy(true);
    try {
      const isPdf = file.type === "application/pdf";
      if (!isPdf && !file.type.startsWith("image/")) throw new Error("Please choose a photo or a PDF");
      const blob = isPdf ? file : await fitJpeg(file);
      if (blob.size > 5 * 1024 * 1024) throw new Error("That file is too big (5 MB at most)");
      const path = `${family.id}/events/${eventId}/${crypto.randomUUID()}.${isPdf ? "pdf" : "jpg"}`;
      const up = await supabase.storage.from("family-files").upload(path, blob, { contentType: isPdf ? "application/pdf" : "image/jpeg" });
      if (up.error) throw up.error;
      const { error } = await supabase.from("cal_files").insert({
        family_id: family.id, event_id: eventId, path, name: (file.name || "Photo").slice(0, 120), mime: isPdf ? "application/pdf" : "image/jpeg", size_bytes: blob.size,
      });
      if (error) {
        await supabase.storage.from("family-files").remove([path]);
        throw error;
      }
      await qc.invalidateQueries({ queryKey: ["cal", family.id, "files", eventId] });
      toast.success("Added");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(f: CalFile) {
    if (!window.confirm("Remove this file?")) return;
    const { error } = await supabase.from("cal_files").delete().eq("id", f.id);
    if (error) return void toast.error(friendlyError(error));
    await supabase.storage.from("family-files").remove([f.path]);
    await qc.invalidateQueries({ queryKey: ["cal", family.id, "files", eventId] });
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-sm font-bold">Photos, letters and tickets</h3>
        <input ref={ref} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void add(f); }} />
        <Button size="sm" variant="outline" className="h-9 rounded-full" disabled={busy} onClick={() => ref.current?.click()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />} Add
        </Button>
      </div>
      {q.data?.length ? (
        <div className="grid grid-cols-3 gap-2">
          {q.data.map((f) => <FileTile key={f.id} f={f} canRemove={isParent || f.created_by_member === me.id} onRemove={() => removeFile(f)} />)}
        </div>
      ) : (
        <p className="text-xs opacity-70">Take a photo of the school letter or add the tickets here.</p>
      )}
    </div>
  );
}

function FileTile({ f, canRemove, onRemove }: { f: CalFile; canRemove: boolean; onRemove: () => void }) {
  const url = useFileUrl(f.path);
  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl bg-white/50 dark:bg-black/20">
      <a href={url.data} target="_blank" rel="noreferrer" className="grid size-full place-items-center" aria-label={`Open ${f.name}`}>
        {f.mime.startsWith("image/") && url.data ? <img src={url.data} alt={f.name} className="size-full object-cover" /> : <span className="grid place-items-center gap-1 p-1 text-center text-[11px]"><FileText className="size-6" />{f.name}</span>}
      </a>
      {canRemove ? (
        <button type="button" onClick={onRemove} className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/60 text-white" aria-label="Remove file"><X className="size-4" /></button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- comments

function Comments({ eventId }: { eventId: string }) {
  const { family, me, members, isParent } = useFamilyState();
  const qc = useQueryClient();
  const q = useComments(eventId);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["cal", family.id, "comments", eventId] });

  async function send(photo?: File) {
    if (!text.trim() && !photo) return;
    setBusy(true);
    try {
      let photo_path: string | null = null;
      if (photo) {
        if (!photo.type.startsWith("image/")) throw new Error("Please choose a photo");
        const blob = await fitJpeg(photo, 1280);
        photo_path = `${family.id}/events/${eventId}/c-${crypto.randomUUID()}.jpg`;
        const up = await supabase.storage.from("family-files").upload(photo_path, blob, { contentType: "image/jpeg" });
        if (up.error) throw up.error;
      }
      const { error } = await supabase.from("cal_comments").insert({ family_id: family.id, event_id: eventId, body: text.trim() || null, photo_path });
      if (error) throw error;
      setText("");
      await refresh();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeComment(c: Comment) {
    const { error } = await supabase.from("cal_comments").update({ deleted_at: new Date().toISOString() }).eq("id", c.id);
    if (error) return void toast.error(friendlyError(error));
    await refresh();
  }

  return (
    <div>
      <h3 className="mb-1.5 text-sm font-bold">Comments</h3>
      <div className="space-y-2">
        {q.data?.map((c) => {
          const m = members.find((x) => x.id === c.member_id);
          return (
            <div key={c.id} className="flex gap-2">
              {m ? <MemberAvatar member={m} size="sm" className="ring-0 ring-offset-0" /> : <span className="size-8" />}
              <div className="min-w-0 flex-1 rounded-2xl bg-white/55 px-3 py-2 text-sm dark:bg-black/20">
                <p className="text-xs font-semibold">{m?.display_name ?? "Someone"} <span className="font-normal opacity-60">· {shortDate(dayKey(new Date(c.created_at), family.timezone))} {timeOf(new Date(c.created_at), family.timezone)}</span></p>
                {c.body ? <p className="whitespace-pre-wrap">{c.body}</p> : null}
                {c.photo_path ? <CommentPhoto path={c.photo_path} /> : null}
              </div>
              {c.member_id === me.id || isParent ? (
                <button type="button" onClick={() => removeComment(c)} className="grid size-8 shrink-0 place-items-center rounded-full opacity-60 hover:opacity-100" aria-label="Remove comment"><X className="size-4" /></button>
              ) : null}
            </div>
          );
        })}
      </div>
      <form className="mt-2 flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input ref={ref} type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send(f); }} />
        <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 rounded-full" onClick={() => ref.current?.click()} aria-label="Add a photo" disabled={busy}><Camera className="size-5" /></Button>
        <Input value={text} maxLength={1000} placeholder="Write a comment" onChange={(e) => setText(e.target.value)} className="h-11 rounded-full bg-white/70 dark:bg-black/20" aria-label="Comment" />
        <Button type="submit" size="icon" className="size-11 shrink-0 rounded-full" disabled={busy || !text.trim()} aria-label="Send">{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</Button>
      </form>
    </div>
  );
}

function CommentPhoto({ path }: { path: string }) {
  const url = useFileUrl(path);
  return url.data ? <a href={url.data} target="_blank" rel="noreferrer"><img src={url.data} alt="" className="mt-1.5 max-h-56 rounded-xl object-cover" /></a> : null;
}

// ---------------------------------------------------------------- who changed what

function EventHistory({ eventId }: { eventId: string }) {
  const { family, members } = useFamilyState();
  const [open, setOpen] = useState(false);
  const q = useEventLog(open ? eventId : null);
  const verb: Record<string, string> = { added: "added it", changed: "changed", deleted: "removed it", restored: "put it back", done: "marked it done" };
  return (
    <div>
      <button type="button" onClick={() => setOpen((x) => !x)} className="flex min-h-10 items-center gap-2 text-sm font-semibold">
        <History className="size-4" /> {open ? "Hide history" : "Who changed what"}
      </button>
      {open ? (
        <ul className="space-y-1 text-sm">
          {q.isLoading ? <li className="opacity-70">Loading…</li> : null}
          {q.data?.map((l) => (
            <li key={l.id} className="flex gap-2">
              <span className="opacity-60">{shortDate(dayKey(new Date(l.at), family.timezone))} {timeOf(new Date(l.at), family.timezone)}</span>
              <span>
                <b>{members.find((m) => m.id === l.member_id)?.display_name ?? "Imported"}</b> {verb[l.action] ?? l.action}
                {l.action === "changed" && l.fields.length ? ` the ${[...new Set(l.fields.map((x) => FIELD_NAMES[x] ?? x))].join(", ")}` : ""}
              </span>
            </li>
          ))}
          {q.data && !q.data.length ? <li className="opacity-70">No changes yet.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

export { Undo2 };
