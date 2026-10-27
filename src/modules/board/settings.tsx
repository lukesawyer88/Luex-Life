// Board settings: my notifications and quiet hours; for parents, each child's switches.
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, HardDrive, Loader2, Moon, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useExtra } from "@/lib/extras";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { friendlyError, type Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { pushState, turnPushOff, turnPushOn, type PushState } from "@/lib/push";
import { supabase } from "@/lib/supabase";
import { Chip, Field, Sheet } from "@/modules/calendar/ui";

import { ALLOWANCE_WARN, boardKey, bytesText, useBoardSettings, useStorageUse, type BoardSettings } from "./data";

type Patch = Partial<Pick<BoardSettings,
  "chat" | "private_chats" | "photos" | "voice" | "location" | "parents_can_read" | "journal_prompts" | "journal_time"
  | "journal_parents_see" | "quiet_from" | "quiet_to" | "alerts">>;

function useSave() {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  return async (memberId: string, patch: Patch) => {
    const { error } = await supabase.from("board_settings").update(patch).eq("member_id", memberId);
    if (error) toast.error(friendlyError(error));
    await qc.invalidateQueries({ queryKey: boardKey(family.id, "settings") });
  };
}

const hm = (t: string | null) => (t ? t.slice(0, 5) : "");

export function BoardSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { me, members, isParent, role } = useFamilyState();
  const settings = useBoardSettings();
  const mine = settings.data?.find((s) => s.member_id === me.id);
  const children = members.filter((m) => m.role === "child" && !m.archived_at);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Board settings" wide>
      <div className="space-y-6">
        <PushBox />
        {settings.isLoading ? <Loader2 className="size-5 animate-spin" /> : null}
        {mine ? <MySection s={mine} isChild={role === "child"} /> : null}
        {isParent ? (
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-base font-bold"><ShieldCheck className="size-5" /> Children</h3>
            {children.length === 0 ? <p className="text-sm text-muted-foreground">No children in the family yet.</p> : null}
            {children.map((c) => {
              const s = settings.data?.find((x) => x.member_id === c.id);
              return s ? <ChildSection key={c.id} child={c} s={s} /> : null;
            })}
          </section>
        ) : null}
        <StorageBox />
      </div>
    </Sheet>
  );
}

function PushBox() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void pushState().then(setState).catch(() => setState("unsupported")); }, []);
  async function toggle() {
    setBusy(true);
    try {
      if (state === "on") await turnPushOff(); else await turnPushOn();
      setState(await pushState());
      toast.success(state === "on" ? "Notifications are off on this device" : "Notifications are on for this device");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="glass-tile space-y-2 p-4">
      <p className="flex items-center gap-2 font-semibold">{state === "on" ? <Bell className="size-5" /> : <BellOff className="size-5" />} Notifications on this device</p>
      {state === null ? <p className="text-sm text-muted-foreground">Checking…</p> : null}
      {state === "on" ? <p className="text-sm text-muted-foreground">This device gets new messages and alerts.</p> : null}
      {state === "off" ? <p className="text-sm text-muted-foreground">Turn them on to hear about new messages.</p> : null}
      {state === "needs-home-screen" ? <p className="text-sm">On an iPhone or iPad, first add Luex Life to your home screen: tap the Share button, then "Add to Home Screen". Open it from there and turn notifications on.</p> : null}
      {state === "blocked" ? <p className="text-sm">Notifications are blocked for Luex Life. Allow them in your browser or phone settings, then come back here.</p> : null}
      {state === "unsupported" ? <p className="text-sm">This browser can't show notifications. Try Chrome, Edge, Firefox or Safari on a phone.</p> : null}
      {state === "on" || state === "off" ? (
        <Button className="h-11 rounded-full" variant={state === "on" ? "outline" : "default"} onClick={toggle} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : state === "on" ? "Turn off on this device" : "Turn on notifications"}
        </Button>
      ) : null}
    </div>
  );
}

function MySection({ s, isChild }: { s: BoardSettings; isChild: boolean }) {
  const save = useSave();
  return (
    <section className="space-y-4">
      <Field label="Tell me about">
        <div className="flex flex-wrap gap-1.5">
          <Chip on={s.alerts === "all"} onClick={() => save(s.member_id, { alerts: "all" })}>Every new message</Chip>
          <Chip on={s.alerts === "mentions"} onClick={() => save(s.member_id, { alerts: "mentions" })}>Only when I'm mentioned</Chip>
          <Chip on={s.alerts === "off"} onClick={() => save(s.member_id, { alerts: "off" })}>Nothing</Chip>
        </div>
        <p className="text-xs text-muted-foreground">Messages are grouped, so you get one alert instead of lots. You can also mute a single chat.</p>
      </Field>
      {isChild ? (
        <div className="space-y-1 text-sm">
          <p className="flex items-center gap-2 font-semibold"><Moon className="size-4" /> Quiet hours</p>
          <p className="text-muted-foreground">{s.quiet_from ? `${hm(s.quiet_from)} to ${hm(s.quiet_to)}` : "None"} · Set by a parent</p>
          <p className="font-semibold">{s.parents_can_read ? "Your parents can read your chats." : "Your parents can't read your private chats."}</p>
        </div>
      ) : (
        <QuietHours s={s} />
      )}
    </section>
  );
}

function QuietHours({ s }: { s: BoardSettings }) {
  const save = useSave();
  const on = !!s.quiet_from;
  const [from, setFrom] = useState(hm(s.quiet_from) || "21:00");
  const [to, setTo] = useState(hm(s.quiet_to) || "07:00");
  useEffect(() => { if (s.quiet_from) { setFrom(hm(s.quiet_from)); setTo(hm(s.quiet_to)); } }, [s.quiet_from, s.quiet_to]);
  const apply = (f: string, t: string) => { if (f && t && f !== t) void save(s.member_id, { quiet_from: f, quiet_to: t }); };
  return (
    <div className="space-y-2">
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium">
        <span className="flex items-center gap-2"><Moon className="size-4" /> Quiet hours (alerts wait until they end)</span>
        <Switch checked={on} onCheckedChange={(v) => save(s.member_id, v ? { quiet_from: from, quiet_to: to } : { quiet_from: null, quiet_to: null })} />
      </label>
      {on ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          From <Input type="time" value={from} onChange={(e) => setFrom(e.target.value)} onBlur={() => apply(from, to)} className="h-11 w-32" aria-label="Quiet from" />
          to <Input type="time" value={to} onChange={(e) => setTo(e.target.value)} onBlur={() => apply(from, to)} className="h-11 w-32" aria-label="Quiet until" />
        </div>
      ) : null}
    </div>
  );
}

function ChildSection({ child, s }: { child: Member; s: BoardSettings }) {
  const journalOn = useExtra("board.journal");
  const save = useSave();
  const [time, setTime] = useState(hm(s.journal_time));
  useEffect(() => setTime(hm(s.journal_time)), [s.journal_time]);
  const toggle = (label: string, key: keyof Patch, value: boolean, hint?: string) => (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium">
      <span>{label}{hint ? <span className="block text-xs font-normal text-muted-foreground">{hint}</span> : null}</span>
      <Switch checked={value} onCheckedChange={(v) => save(child.id, { [key]: v } as Patch)} />
    </label>
  );
  return (
    <div className="space-y-2 rounded-2xl bg-[var(--surface)] p-4">
      <p className="flex items-center gap-2 font-bold"><MemberAvatar member={child} size="sm" className="size-8 ring-0 ring-offset-0" /> {child.display_name}</p>
      {!child.user_id ? <p className="text-xs text-muted-foreground">{child.display_name} doesn't have their own login yet, so these apply once they do.</p> : null}
      {toggle("Chat", "chat", s.chat, "Off hides all chats from them")}
      {toggle("Private chats", "private_chats", s.private_chats, "Chats with one person or a small group")}
      {toggle("Photos and videos", "photos", s.photos)}
      {toggle("Voice notes", "voice", s.voice)}
      {toggle("Location sharing", "location", s.location, "Answering \"Where are you?\" (always one tap, never automatic)")}
      {toggle("Parents can read their chats", "parents_can_read", s.parents_can_read,
        `On by default for under-13s. ${child.display_name} can always see whether this is on.`)}
      <QuietHours s={s} />
      {journalOn ? toggle("Daily journal questions", "journal_prompts", s.journal_prompts) : null}
      {journalOn && s.journal_prompts ? (
        <div className="flex items-center gap-2 text-sm">
          Send at <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} onBlur={() => time && save(child.id, { journal_time: time })} className="h-11 w-32" aria-label="Journal question time" />
        </div>
      ) : null}
      {journalOn ? toggle("Parents can see their journal", "journal_parents_see", s.journal_parents_see, "Private journal entries") : null}
    </div>
  );
}

function StorageBox() {
  const use = useStorageUse();
  if (!use.data) return null;
  const { used, allowance } = use.data;
  const ratio = allowance ? used / allowance : 0;
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-base font-bold"><HardDrive className="size-5" /> Family photo space</h3>
      <div className="h-3 overflow-hidden rounded-full bg-[var(--surface-border)]">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(ratio * 100))}%`, background: ratio >= ALLOWANCE_WARN ? "var(--status-amber)" : "var(--status-green)" }} />
      </div>
      <p className="text-sm text-muted-foreground">{bytesText(used)} of {bytesText(allowance)} used{ratio >= ALLOWANCE_WARN ? ". You're nearly full" : ""}.</p>
    </section>
  );
}
