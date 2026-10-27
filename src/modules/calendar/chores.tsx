import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Bath, BedDouble, BookOpen, Camera, Car, Check, Dog, Fish, Flower2, Hourglass, Loader2, Pencil, Plus, Shirt, ShoppingBasket, Sofa,
  Sparkles, Star, Trash2, Undo2, Users, Utensils, WashingMachine, type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useExtra } from "@/lib/extras";
import { friendlyError, type Member } from "@/lib/family";
import { fitJpeg } from "@/lib/image";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { removeProofPhoto, uploadProofPhoto, useRewardPhotoUrls } from "@/modules/rewards/data";

import { useChoreDone, useChores, useStars, type Chore, type ChoreDone } from "./data";
import { countBefore, datesBetween } from "./recurrence";
import { addDays, shortDate, shortDay, todayKey, weekdayOf, weekStart } from "./time";
import { Chip, Empty, Field, PeoplePicker, Sheet, Tabs } from "./ui";

// ---------------------------------------------------------------- icons (stored by name)

export const CHORE_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles, bed: BedDouble, utensils: Utensils, bin: Trash2, shirt: Shirt, dog: Dog, fish: Fish,
  flower: Flower2, bath: Bath, book: BookOpen, shopping: ShoppingBasket, car: Car, sofa: Sofa, washing: WashingMachine,
};
export function choreIcon(name: string): LucideIcon {
  return CHORE_ICONS[name] ?? Sparkles;
}

// ---------------------------------------------------------------- who does it on a day

/** Who a chore is for on a day: 'each' = everyone listed, 'rotate' = whose turn it is, 'anyone' = null (first to do it) */
export function choreAssignees(c: Chore, k: string): string[] | null {
  if (c.mode === "anyone") return null;
  if (!c.people.length) return [];
  if (c.mode === "rotate") return [c.people[countBefore(c.rrule, c.starts_on, k) % c.people.length]];
  return c.people;
}

function isDue(c: Chore, k: string) {
  return c.active && k >= c.starts_on && datesBetween(c.rrule, c.starts_on, k, k).length > 0;
}

const PART_LABEL: Record<string, string> = { morning: "Morning", afternoon: "After school", evening: "Evening", any: "Any time" };

type Job = { chore: Chore; forMember: string | null; done: ChoreDone | undefined };

// ---------------------------------------------------------------- the tab

export function ChoresTab() {
  const { family, me, members, role, isParent } = useFamilyState();
  const qc = useQueryClient();
  const tz = family.timezone;
  const today = todayKey(tz);
  const [view, setView] = useState<"today" | "rota" | "manage">("today");
  const [day, setDay] = useState(today);
  const chores = useChores();
  const doneQ = useChoreDone(addDays(today, -14), addDays(today, 14));
  const wk = weekStart(today);
  const stars = useStars(wk);
  const [editing, setEditing] = useState<Chore | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // a chore that needs a photo waits here while the camera is open
  const [photoFor, setPhotoFor] = useState<Job | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  // a parent checks the photo before confirming
  const [checking, setChecking] = useState<ChoreDone | null>(null);
  const checkUrls = useRewardPhotoUrls([checking?.photo_path]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["cal", family.id] });

  const jobs = useMemo(() => {
    const done = doneQ.data ?? [];
    const out: Job[] = [];
    for (const c of chores.data ?? []) {
      if (!isDue(c, day)) continue;
      const who = choreAssignees(c, day);
      if (who === null) {
        out.push({ chore: c, forMember: null, done: done.find((d) => d.chore_id === c.id && d.due_on === day) });
      } else {
        for (const m of who) out.push({ chore: c, forMember: m, done: done.find((d) => d.chore_id === c.id && d.due_on === day && d.for_member === m) });
      }
    }
    if (role === "child") {
      return out.filter((j) => j.forMember === me.id || (j.forMember === null && (j.chore.people.length === 0 || j.chore.people.includes(me.id))));
    }
    return out;
  }, [chores.data, doneQ.data, day, role, me.id]);

  const groups = useMemo(() => {
    const g: { member: Member | null; jobs: Job[] }[] = [];
    for (const m of members) {
      const list = jobs.filter((j) => j.forMember === m.id);
      if (list.length) g.push({ member: m, jobs: list });
    }
    const anyone = jobs.filter((j) => j.forMember === null);
    if (anyone.length) g.push({ member: null, jobs: anyone });
    return g;
  }, [jobs, members]);

  async function tick(j: Job, photo?: File) {
    if (j.chore.needs_photo && !isParent && !photo) {
      setPhotoFor(j);
      photoInput.current?.click();
      return;
    }
    setBusy(j.chore.id + (j.forMember ?? ""));
    try {
      const photo_path = photo ? await uploadProofPhoto(family.id, me.id, await fitJpeg(photo, 1280)) : null;
      const { error } = await supabase.from("chore_done").insert({ family_id: family.id, chore_id: j.chore.id, due_on: day, for_member: j.forMember ?? me.id, photo_path });
      if (error) { void removeProofPhoto(photo_path); throw error; }
      // nobody needs to check it, so the photo isn't kept
      if (photo_path && !j.chore.needs_confirm) void removeProofPhoto(photo_path);
      await refresh();
      if (j.chore.needs_confirm && !isParent) toast.success("Done! A parent will check it");
      else toast.success("Done!");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }
  async function untick(d: ChoreDone) {
    setBusy(d.id);
    try {
      const { error, count } = await supabase.from("chore_done").delete({ count: "exact" }).eq("id", d.id);
      if (error) throw error;
      if (count === 0) throw new Error("Only a parent can undo that now");
      await refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }
  async function confirm(d: ChoreDone) {
    if (d.photo_path && checking?.id !== d.id) { setChecking(d); return; }
    setBusy(d.id);
    try {
      const { error } = await supabase.from("chore_done").update({ confirmed_at: new Date().toISOString() }).eq("id", d.id);
      if (error) throw error;
      setChecking(null);
      void removeProofPhoto(d.photo_path);
      await refresh();
      toast.success("Checked");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  const name = (id: string | null | undefined) => members.find((m) => m.id === id)?.display_name ?? "Someone";

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={view}
            onChange={setView}
            items={[
              { key: "today", label: "Jobs" },
              { key: "rota", label: "Cleaning rota" },
              ...(isParent ? [{ key: "manage" as const, label: "Set up chores" }] : []),
            ]}
          />
          {view === "manage" && isParent ? (
            <Button className="ml-auto h-10 rounded-full" onClick={() => setEditing("new")}><Plus className="size-4" /> New chore</Button>
          ) : null}
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
          {view === "today" ? (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                <Chip on={day === today} onClick={() => setDay(today)}>Today</Chip>
                <Chip on={day === addDays(today, -1)} onClick={() => setDay(addDays(today, -1))}>Yesterday</Chip>
              </div>
              {chores.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
              {!chores.isLoading && !groups.length ? (
                <Empty icon={Sparkles} title={day === today ? "No chores today" : "No chores that day"}>
                  {isParent ? "Set up chores and a cleaning rota in “Set up chores”." : "Nothing to do. Enjoy!"}
                </Empty>
              ) : null}
              <div className="space-y-4">
                {groups.map((g) => (
                  <section key={g.member?.id ?? "anyone"}>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                      {g.member ? <MemberAvatar member={g.member} size="sm" className="ring-0 ring-offset-0" /> : <span className="grid size-8 place-items-center rounded-full bg-[var(--surface)]"><Users className="size-4" /></span>}
                      {g.member ? (g.member.id === me.id ? "You" : g.member.display_name) : "Anyone can do these"}
                    </h3>
                    <div className="space-y-2">
                      {g.jobs.map((j) => {
                        const Icon = choreIcon(j.chore.icon);
                        const d = j.done;
                        const waiting = d && !d.confirmed_at;
                        const canUntick = d && (isParent || (d.done_by === me.id && !(d.confirmed_by && d.confirmed_by !== me.id)));
                        const canTick = !d && (isParent || j.forMember === me.id || j.forMember === null);
                        const key = j.chore.id + (j.forMember ?? "");
                        return (
                          <div key={key} className={cn("glass-tile flex min-h-16 items-center gap-3 px-3 py-2", d && !waiting && "opacity-70")}>
                            <span className="grid size-11 shrink-0 place-items-center rounded-full text-white" style={{ background: "var(--ev-chore)" }}><Icon className="size-6" /></span>
                            <div className="min-w-0 flex-1">
                              <p className={cn("truncate text-base font-semibold", d && !waiting && "line-through")}>{j.chore.title}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {PART_LABEL[j.chore.part_of_day]}
                                {j.chore.stars ? ` · ${j.chore.stars} ${j.chore.stars === 1 ? "star" : "stars"}` : ""}
                                {Number(j.chore.money) > 0 ? ` · £${Number(j.chore.money).toFixed(2)}` : ""}
                                {j.chore.needs_photo && !d ? " · needs a photo" : ""}
                                {j.forMember === null && d ? ` · done by ${d.for_member === me.id ? "you" : name(d.for_member)}` : ""}
                                {waiting ? " · waiting for a parent to check" : ""}
                              </p>
                            </div>
                            {waiting ? <Hourglass className="size-5 shrink-0 text-[var(--status-amber)]" aria-label="Waiting for a parent" /> : null}
                            {waiting && isParent ? (
                              <Button className="h-11 rounded-full" disabled={busy === d.id} onClick={() => confirm(d)}>Confirm</Button>
                            ) : null}
                            {d ? (
                              canUntick ? (
                                <Button variant="ghost" size="icon" className="size-11 shrink-0 rounded-full" aria-label="Not done yet" disabled={busy === d.id} onClick={() => untick(d)}>
                                  <Undo2 className="size-5" />
                                </Button>
                              ) : null
                            ) : canTick ? (
                              <button
                                type="button"
                                aria-label={`Mark ${j.chore.title} done`}
                                disabled={busy === key}
                                onClick={() => tick(j)}
                                className="grid size-14 shrink-0 place-items-center rounded-full border-2 border-[var(--ev-chore)] text-[var(--ev-chore)] transition hover:bg-[var(--ev-chore)] hover:text-white"
                              >
                                {busy === key ? <Loader2 className="size-6 animate-spin" /> : <Check className="size-7" />}
                              </button>
                            ) : null}
                            {d && !waiting ? <Check className="size-6 shrink-0 text-[var(--status-green)]" aria-label="Done" /> : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </>
          ) : null}

          {view === "rota" ? <Rota /> : null}

          {view === "manage" && isParent ? (
            <div className="space-y-2">
              {!(chores.data ?? []).length ? <Empty icon={Sparkles} title="No chores yet">Add jobs like “Feed the fish” or a cleaning rota that takes turns by itself.</Empty> : null}
              {(chores.data ?? []).map((c) => {
                const Icon = choreIcon(c.icon);
                return (
                  <button key={c.id} type="button" onClick={() => setEditing(c)} className={cn("glass-tile flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left", !c.active && "opacity-50")}>
                    <span className="grid size-9 shrink-0 place-items-center rounded-full text-white" style={{ background: "var(--ev-chore)" }}><Icon className="size-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{c.title}{c.is_cleaning ? " · cleaning rota" : ""}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {describeRepeat(c.rrule, c.starts_on)} · {c.mode === "rotate" ? "takes turns" : c.mode === "anyone" ? "anyone" : "everyone listed"}
                        {c.people.length ? ` · ${c.people.map(name).join(", ")}` : ""}{!c.active ? " · paused" : ""}
                      </span>
                    </span>
                    <Pencil className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </RecordsWindow>

      <DetailWindow>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Star className="size-4" /> Stars this week</h3>
        <div className="space-y-2">
          {members.filter((m) => role !== "child" || m.id === me.id).map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-white/50 px-3 py-2 dark:bg-black/20">
              <MemberAvatar member={m} size="sm" className="ring-0 ring-offset-0" />
              <span className="flex-1 font-medium">{m.id === me.id ? "You" : m.display_name}</span>
              <span className="inline-flex items-center gap-1 text-lg font-bold"><Star className="size-4 fill-current text-[var(--gold)]" /> {stars.data?.get(m.id) ?? 0}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs opacity-75">Stars come from chores and routines once they're checked. <Link to="/m/$key" params={{ key: "pocket" }} className="font-semibold underline">Spend stars in Rewards</Link></p>
      </DetailWindow>

      {isParent ? <ChoreEditor chore={editing} onClose={() => setEditing(null)} /> : null}
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="chore-photo-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const j = photoFor;
          setPhotoFor(null);
          if (file && j) void tick(j, file);
        }}
      />
      <Sheet
        open={!!checking}
        onOpenChange={(o) => !o && setChecking(null)}
        title="Check the photo"
        footer={
          <>
            <Button className="h-11 flex-1 rounded-full sm:flex-none" disabled={!checking || busy === checking.id} onClick={() => checking && confirm(checking)}>Looks good, confirm</Button>
            <Button variant="ghost" className="h-11 rounded-full" onClick={() => setChecking(null)}>Not yet</Button>
          </>
        }
      >
        {checking?.photo_path && checkUrls.data?.get(checking.photo_path) ? (
          <img src={checkUrls.data.get(checking.photo_path)} alt="Proof photo" className="max-h-[60dvh] w-full rounded-2xl object-contain" />
        ) : <p className="text-sm text-muted-foreground">{checkUrls.isError ? "The photo couldn't open." : "Loading the photo…"}</p>}
        <p className="mt-2 text-xs text-muted-foreground">The photo is deleted once you confirm.</p>
      </Sheet>
    </Windows>
  );
}

// ---------------------------------------------------------------- cleaning rota

function Rota() {
  const { family, members, me } = useFamilyState();
  const today = todayKey(family.timezone);
  const chores = useChores();
  const rota = (chores.data ?? []).filter((c) => c.is_cleaning && c.active);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const name = (id: string) => (id === me.id ? "You" : members.find((m) => m.id === id)?.display_name ?? "Someone");
  if (!rota.length) return <Empty icon={Sparkles} title="No cleaning rota yet">A parent can tick “Part of the cleaning rota” on any chore. Choose “Take turns” and it rotates by itself.</Empty>;
  return (
    <div className="space-y-2">
      {days.map((k) => {
        const due = rota.filter((c) => isDue(c, k));
        if (!due.length) return null;
        return (
          <section key={k} className="glass-tile px-3 py-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{k === today ? "Today" : k === addDays(today, 1) ? "Tomorrow" : shortDate(k)}</h3>
            <ul className="mt-1 space-y-1">
              {due.map((c) => {
                const who = choreAssignees(c, k);
                const Icon = choreIcon(c.icon);
                return (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <Icon className="size-4 shrink-0" />
                    <span className="flex-1 font-medium">{c.title}</span>
                    <span className="flex items-center gap-1.5">
                      {who === null ? "Anyone" : who.map((id) => {
                        const m = members.find((x) => x.id === id);
                        return m ? <span key={id} className="inline-flex items-center gap-1"><MemberAvatar member={m} size="sm" className="size-6 text-[10px] ring-0 ring-offset-0" />{name(id)}</span> : null;
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- repeat choices for chores

type Repeat = "daily" | "weekdays" | "days" | "weekly" | "monthly";
const BY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

function toRule(r: Repeat, days: number[], startK: string): string {
  if (r === "daily") return "FREQ=DAILY";
  if (r === "weekdays") return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
  if (r === "weekly") return `FREQ=WEEKLY;BYDAY=${BY[weekdayOf(startK) - 1]}`;
  if (r === "monthly") return "FREQ=MONTHLY";
  const ds = (days.length ? days : [weekdayOf(startK)]).slice().sort();
  return `FREQ=WEEKLY;BYDAY=${ds.map((d) => BY[d - 1]).join(",")}`;
}
function fromRule(rule: string, startK: string): { r: Repeat; days: number[] } {
  if (rule === "FREQ=DAILY") return { r: "daily", days: [] };
  if (rule === "FREQ=MONTHLY") return { r: "monthly", days: [] };
  if (rule === "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR") return { r: "weekdays", days: [1, 2, 3, 4, 5] };
  const m = /BYDAY=([A-Z,]+)/.exec(rule);
  const days = m ? m[1].split(",").map((x) => BY.indexOf(x) + 1).filter((x) => x > 0) : [];
  if (days.length === 1 && days[0] === weekdayOf(startK)) return { r: "weekly", days };
  return { r: "days", days };
}
function describeRepeat(rule: string, startK: string) {
  const { r, days } = fromRule(rule, startK);
  if (r === "daily") return "Every day";
  if (r === "weekdays") return "Weekdays";
  if (r === "monthly") return "Every month";
  return `Every ${days.map(shortDay).join(", ")}`;
}

// ---------------------------------------------------------------- add / change a chore

function ChoreEditor({ chore, onClose }: { chore: Chore | "new" | null; onClose: () => void }) {
  const { family, members } = useFamilyState();
  const photosOn = useExtra("rewards.photos");
  const qc = useQueryClient();
  const today = todayKey(family.timezone);
  const open = chore !== null;
  const existing = chore && chore !== "new" ? chore : null;
  const blank = () => ({
    title: "", icon: "sparkles", startsOn: today, repeat: "daily" as Repeat, days: [] as number[], mode: "each" as Chore["mode"],
    people: [] as string[], part: "any" as Chore["part_of_day"], confirm: false, stars: 1, notes: "", cleaning: false, active: true,
    money: "", photo: false,
  });
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      const rr = fromRule(existing.rrule, existing.starts_on);
      setF({
        title: existing.title, icon: existing.icon, startsOn: existing.starts_on, repeat: rr.r, days: rr.days, mode: existing.mode,
        people: existing.people, part: existing.part_of_day, confirm: existing.needs_confirm, stars: existing.stars,
        notes: existing.notes ?? "", cleaning: existing.is_cleaning, active: existing.active,
        money: Number(existing.money) > 0 ? Number(existing.money).toFixed(2) : "", photo: existing.needs_photo,
      });
    } else setF(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.id]);

  const set = <K extends keyof ReturnType<typeof blank>>(k: K, v: ReturnType<typeof blank>[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    if (!f.title.trim()) return void toast.error("Give the chore a name");
    const pay = f.money.trim() ? Math.round(Number(f.money.replace(/[£,\s]/g, "")) * 100) / 100 : 0;
    if (!Number.isFinite(pay) || pay < 0 || pay >= 1000) return void toast.error("Type an amount like 0.50");
    setBusy(true);
    try {
      const row = {
        title: f.title.trim(), icon: f.icon, rrule: toRule(f.repeat, f.days, f.startsOn), starts_on: f.startsOn, mode: f.mode,
        people: f.people, part_of_day: f.part, needs_confirm: f.confirm, stars: Math.max(0, Math.min(10, f.stars)),
        notes: f.notes.trim() || null, is_cleaning: f.cleaning, active: f.active,
        // only sent when used or already set, so saving a plain chore never depends on the pay and photo columns
        ...(pay > 0 || Number(existing?.money ?? 0) > 0 ? { money: pay } : {}),
        ...((photosOn && f.photo) || existing?.needs_photo ? { needs_photo: photosOn ? f.photo : false } : {}),
      };
      const { error } = existing
        ? await supabase.from("chores").update(row).eq("id", existing.id)
        : await supabase.from("chores").insert({ ...row, family_id: family.id });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["cal", family.id] });
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!existing || !window.confirm(`Remove “${existing.title}”? Its ticks and stars go too.`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("chores").delete().eq("id", existing.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["cal", family.id] });
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const ordered = f.people.map((id) => members.find((m) => m.id === id)).filter(Boolean) as Member[];

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "Change chore" : "New chore"}
      footer={
        <>
          <Button className="h-11 flex-1 rounded-full px-6 sm:flex-none" disabled={busy || !f.title.trim()} onClick={save}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}</Button>
          <Button variant="ghost" className="h-11 rounded-full" onClick={onClose}>Cancel</Button>
          {existing ? <Button variant="ghost" className="ml-auto h-11 rounded-full text-destructive" disabled={busy} onClick={remove}><Trash2 className="size-4" /> Remove</Button> : null}
        </>
      }
    >
      <div className="space-y-5">
        <Input data-autofocus autoFocus={!existing} value={f.title} maxLength={80} placeholder="e.g. Feed the fish, Hoover the stairs" aria-label="Name" className="h-12 text-base font-semibold" onChange={(e) => set("title", e.target.value)} />

        <Field label="Picture">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(CHORE_ICONS).map(([k, Icon]) => (
              <button key={k} type="button" aria-pressed={f.icon === k} aria-label={k} onClick={() => set("icon", k)}
                className={cn("grid size-11 place-items-center rounded-full border", f.icon === k ? "border-transparent bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "border-[var(--surface-border)] bg-[var(--surface)]")}>
                <Icon className="size-5" />
              </button>
            ))}
          </div>
        </Field>

        <Field label="How often">
          <div className="flex flex-wrap gap-1.5">
            {([["daily", "Every day"], ["weekdays", "Weekdays"], ["weekly", "Once a week"], ["days", "Chosen days"], ["monthly", "Once a month"]] as [Repeat, string][]).map(([k, l]) => (
              <Chip key={k} on={f.repeat === k} onClick={() => set("repeat", k)}>{l}</Chip>
            ))}
          </div>
          {f.repeat === "days" ? (
            <div className="flex flex-wrap gap-1 pt-2">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <Chip key={d} className="min-w-11 justify-center px-2" on={f.days.includes(d)} onClick={() => set("days", f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d])}>{shortDay(d)}</Chip>
              ))}
            </div>
          ) : null}
        </Field>

        <Field label="Starts on" hint={f.repeat === "weekly" ? `Happens every ${shortDay(weekdayOf(f.startsOn))}.` : f.repeat === "monthly" ? `Happens on the ${Number(f.startsOn.slice(8))} of each month.` : undefined}>
          <Input type="date" value={f.startsOn} onChange={(e) => e.target.value && set("startsOn", e.target.value)} className="h-11 w-auto" />
        </Field>

        <Field label="Who does it?">
          <div className="flex flex-wrap gap-1.5 pb-2">
            <Chip on={f.mode === "each"} onClick={() => set("mode", "each")}>Everyone I pick</Chip>
            <Chip on={f.mode === "rotate"} onClick={() => set("mode", "rotate")}>Take turns</Chip>
            <Chip on={f.mode === "anyone"} onClick={() => set("mode", "anyone")}>First to do it</Chip>
          </div>
          <PeoplePicker members={members} value={f.people} onChange={(v) => set("people", v)} />
          {f.mode === "rotate" && ordered.length > 1 ? (
            <div className="mt-2 rounded-2xl bg-muted/60 p-3 text-sm">
              <p className="mb-1 font-semibold">Order of turns</p>
              <ol className="space-y-1">
                {ordered.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <span className="w-5 text-muted-foreground">{i + 1}.</span>
                    <span className="flex-1">{m.display_name}</span>
                    <Button type="button" size="sm" variant="ghost" className="h-8" disabled={i === 0} onClick={() => { const p = [...f.people]; [p[i - 1], p[i]] = [p[i], p[i - 1]]; set("people", p); }}>Up</Button>
                    <Button type="button" size="sm" variant="ghost" className="h-8" disabled={i === ordered.length - 1} onClick={() => { const p = [...f.people]; [p[i + 1], p[i]] = [p[i], p[i + 1]]; set("people", p); }}>Down</Button>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {f.mode === "each" ? "Each person picked gets their own tick." : f.mode === "rotate" ? "One person each time, taking turns in this order." : f.people.length ? "Only the people picked can do it. The first to tick it gets the stars." : "Anyone in the family can do it. The first to tick it gets the stars."}
          </p>
        </Field>

        <Field label="Time of day">
          <div className="flex flex-wrap gap-1.5">
            {(["morning", "afternoon", "evening", "any"] as const).map((p) => <Chip key={p} on={f.part === p} onClick={() => set("part", p)}>{PART_LABEL[p]}</Chip>)}
          </div>
        </Field>

        <Field label="Stars for doing it">
          <div className="flex flex-wrap gap-1.5">
            {[0, 1, 2, 3, 5, 10].map((n) => <Chip key={n} on={f.stars === n} onClick={() => set("stars", n)}>{n === 0 ? "None" : n}</Chip>)}
          </div>
        </Field>

        <Field label="Pays money" hint="Paid into their pocket money when it's done (and checked, if a parent checks it). Leave empty for none.">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">£</span>
            <Input data-testid="chore-money" inputMode="decimal" value={f.money} placeholder="0.00" className="h-11 w-32" onChange={(e) => set("money", e.target.value)} />
          </div>
        </Field>

        {photosOn ? (
        <label className="flex min-h-10 items-center justify-between gap-3 text-sm font-semibold">
          <span className="flex items-center gap-2"><Camera className="size-4" /> Needs a photo to show it's done</span>
          <Switch data-testid="chore-photo" checked={f.photo} onCheckedChange={(v) => set("photo", v)} />
        </label>
        ) : null}
        <label className="flex min-h-10 items-center justify-between gap-3 text-sm font-semibold">
          A parent checks it before it counts
          <Switch checked={f.confirm} onCheckedChange={(v) => set("confirm", v)} />
        </label>
        <label className="flex min-h-10 items-center justify-between gap-3 text-sm font-semibold">
          Part of the cleaning rota
          <Switch checked={f.cleaning} onCheckedChange={(v) => set("cleaning", v)} />
        </label>
        {existing ? (
          <label className="flex min-h-10 items-center justify-between gap-3 text-sm font-semibold">
            Switched on
            <Switch checked={f.active} onCheckedChange={(v) => set("active", v)} />
          </label>
        ) : null}

        <Field label="Notes">
          <Textarea value={f.notes} maxLength={500} rows={2} placeholder="How to do it, where things are" onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}
