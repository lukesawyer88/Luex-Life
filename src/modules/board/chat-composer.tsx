// Writing in a chat: words, @names, photos and videos, voice notes, stickers, polls, "Where are you?",
// shout-outs and announcements. The Send button is big on purpose.
import { useQueryClient } from "@tanstack/react-query";
import {
  AtSign, BarChart3, Camera, Check, Loader2, MapPin, Megaphone, Mic, Plus, RotateCcw, Send, Smile, Square, Star, Trash2, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useExtra } from "@/lib/extras";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { friendlyError, type Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, PeoplePicker, Sheet } from "@/modules/calendar/ui";
import { useDesktop } from "@/lib/use-desktop";

import { STICKERS, kindWord } from "./chat-message";
import {
  clientId, kindOf, mediaDuration, refreshBoard, uploadMedia, useAllowed, VIDEO_MAX_SECONDS, type Message, type ThreadInfo,
} from "./data";
import { sendText } from "./outbox";

type Upload = { id: string; name: string; status: "uploading" | "done" | "failed"; error?: string; file: File; messageId: string };

export function Composer({
  thread, people, replyTo, onClearReply, onSent,
}: {
  thread: ThreadInfo; people: Member[]; replyTo: Message | null; onClearReply: () => void; onSent: () => void;
}) {
  const { me, family, isParent, members } = useFamilyState();
  const qc = useQueryClient();
  const desktop = useDesktop();
  const canPhotos = useAllowed("photos");
  const canVoice = useAllowed("voice");
  const canLocation = useAllowed("location");
  const stickersOn = useExtra("board.stickers");
  const kudosOn = useExtra("board.kudos");
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [sheet, setSheet] = useState<null | "mention" | "sticker" | "poll" | "ask" | "kudos" | "announce">(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [recording, setRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const others = people.filter((p) => p.id !== me.id && p.user_id);
  const family_chat = thread.kind === "family";
  const refresh = () => { void refreshBoard(qc, family.id); onSent(); };

  useEffect(() => { if (replyTo) boxRef.current?.focus(); }, [replyTo]);

  async function insert(row: { kind: Message["kind"]; body?: string; sticker?: string; ask_member?: string; kudos_to?: string; mentions?: string[] }) {
    const { data, error } = await supabase.from("board_messages").insert({
      family_id: family.id, thread_id: thread.id, kind: row.kind, body: row.body ?? "", sticker: row.sticker ?? null,
      ask_member: row.ask_member ?? null, kudos_to: row.kudos_to ?? null, mentions: row.mentions ?? [],
      reply_to: replyTo?.id ?? null, client_id: clientId(),
    }).select("id").single();
    if (error) { toast.error(friendlyError(error)); return null; }
    onClearReply();
    refresh();
    return data.id as string;
  }

  async function send() {
    const body = text.trim();
    if (!body) return;
    const used = mentions.filter((id) => body.includes(`@${members.find((m) => m.id === id)?.display_name ?? "\u0000"}`));
    setText(""); setMentions([]);
    try {
      const r = await sendText({
        clientId: clientId(), familyId: family.id, threadId: thread.id, authorId: me.id, body, mentions: used,
        replyTo: replyTo?.id ?? null, createdAt: new Date().toISOString(),
      });
      onClearReply();
      if (r === "queued") toast("No signal. It will send when you're back online");
      refresh();
    } catch (e) {
      setText(body);
      toast.error(friendlyError(e));
    }
  }

  // ---------------------------------------------------------------- photos and videos

  async function pickFiles(list: FileList | null) {
    const files = [...(list ?? [])].slice(0, 20);
    if (!files.length) return;
    for (const f of files) {
      if (kindOf(f) === "video") {
        const d = await mediaDuration(f);
        if (d != null && d > VIDEO_MAX_SECONDS) { toast.error(`${f.name}: videos can be up to 3 minutes long`); return; }
      }
      if (f.size > 50 * 1024 * 1024) { toast.error(`${f.name} is too big (50 MB at most)`); return; }
    }
    const caption = text.trim();
    const messageId = await insert({ kind: "photo", body: caption });
    if (!messageId) return;
    setText("");
    const added = files.map((file) => ({ id: crypto.randomUUID(), name: file.name, status: "uploading" as const, file, messageId }));
    setUploads((u) => [...u, ...added]);
    await Promise.all(added.map((u) => runUpload(u)));
  }

  async function runUpload(u: Upload) {
    setUploads((list) => list.map((x) => (x.id === u.id ? { ...x, status: "uploading", error: undefined } : x)));
    try {
      await uploadMedia(family.id, u.file, { kind: "thread", threadId: thread.id, messageId: u.messageId });
      setUploads((list) => list.map((x) => (x.id === u.id ? { ...x, status: "done" } : x)));
      void refreshBoard(qc, family.id);
      setTimeout(() => setUploads((list) => list.filter((x) => x.id !== u.id)), 2500);
    } catch (e) {
      setUploads((list) => list.map((x) => (x.id === u.id ? { ...x, status: "failed", error: friendlyError(e) } : x)));
    }
  }

  async function sendVoice(file: File, seconds: number) {
    const messageId = await insert({ kind: "voice" });
    if (!messageId) return;
    const u: Upload = { id: crypto.randomUUID(), name: "Voice note", status: "uploading", file, messageId };
    setUploads((list) => [...list, u]);
    try {
      await uploadMedia(family.id, file, { kind: "thread", threadId: thread.id, messageId }, { kind: "voice", durationS: seconds });
      setUploads((list) => list.map((x) => (x.id === u.id ? { ...x, status: "done" } : x)));
      setTimeout(() => setUploads((list) => list.filter((x) => x.id !== u.id)), 2500);
      void refreshBoard(qc, family.id);
    } catch (e) {
      setUploads((list) => list.map((x) => (x.id === u.id ? { ...x, status: "failed", error: friendlyError(e) } : x)));
    }
  }

  function addMention(m: Member) {
    setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}@${m.display_name} `);
    setMentions((x) => (x.includes(m.id) ? x : [...x, m.id]));
    setSheet(null);
    boxRef.current?.focus();
  }

  return (
    <div className="border-t border-[var(--surface-border)] pt-2">
      {uploads.length ? (
        <ul className="mb-2 space-y-1">
          {uploads.map((u) => (
            <li key={u.id} className="flex items-center gap-2 rounded-xl bg-[var(--surface)] px-3 py-1.5 text-sm">
              {u.status === "uploading" ? <Loader2 className="size-4 animate-spin" /> : u.status === "done" ? <Check className="size-4 text-[var(--status-green)]" /> : <X className="size-4 text-[var(--status-red)]" />}
              <span className="min-w-0 flex-1 truncate">{u.status === "failed" ? `${u.name}: ${u.error}` : u.status === "done" ? `${u.name} sent` : `Sending ${u.name}…`}</span>
              {u.status === "failed" ? (
                <>
                  <Button size="sm" variant="outline" className="h-9 rounded-full" onClick={() => void runUpload(u)}><RotateCcw className="size-4" /> Try again</Button>
                  <Button size="icon" variant="ghost" className="size-9 rounded-full" aria-label="Give up" onClick={() => setUploads((l) => l.filter((x) => x.id !== u.id))}><Trash2 className="size-4" /></Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {replyTo ? (
        <div className="mb-2 flex items-center gap-2 rounded-xl border-l-4 border-[var(--status-blue)] bg-[var(--surface)] px-3 py-1.5 text-sm">
          <span className="min-w-0 flex-1 truncate">Replying to <strong>{members.find((m) => m.id === replyTo.author)?.display_name ?? "someone"}</strong>: {replyTo.body || kindWord(replyTo.kind)}</span>
          <Button size="icon" variant="ghost" className="size-9 rounded-full" aria-label="Stop replying" onClick={onClearReply}><X className="size-4" /></Button>
        </div>
      ) : null}

      {recording ? (
        <VoiceRecorder onCancel={() => setRecording(false)} onDone={(f, s) => { setRecording(false); void sendVoice(f, s); }} />
      ) : (
        <div className="flex items-end gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="size-11 shrink-0 rounded-full" aria-label="Add something"><Plus className="size-5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-60">
              {canPhotos ? <DropdownMenuItem onSelect={() => fileRef.current?.click()}><Camera className="mr-2 size-4" /> Photo or video</DropdownMenuItem> : null}
              {stickersOn ? <DropdownMenuItem onSelect={() => setSheet("sticker")}><Smile className="mr-2 size-4" /> Sticker</DropdownMenuItem> : null}
              <DropdownMenuItem onSelect={() => setSheet("poll")}><BarChart3 className="mr-2 size-4" /> Poll</DropdownMenuItem>
              {others.length ? <DropdownMenuItem onSelect={() => setSheet("mention")}><AtSign className="mr-2 size-4" /> Mention someone</DropdownMenuItem> : null}
              {canLocation && others.length ? <DropdownMenuItem onSelect={() => setSheet("ask")}><MapPin className="mr-2 size-4" /> Where are you?</DropdownMenuItem> : null}
              {family_chat && kudosOn ? <DropdownMenuItem onSelect={() => setSheet("kudos")}><Star className="mr-2 size-4" /> Shout-out</DropdownMenuItem> : null}
              {family_chat && isParent ? <DropdownMenuItem onSelect={() => setSheet("announce")}><Megaphone className="mr-2 size-4" /> Announcement</DropdownMenuItem> : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { void pickFiles(e.target.files); e.target.value = ""; }} />
          <Textarea
            ref={boxRef}
            value={text}
            onChange={(e) => {
              const v = e.target.value;
              if (v.endsWith("@") && !text.endsWith("@") && others.length) { setText(v.slice(0, -1)); setSheet("mention"); return; }
              setText(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && desktop) { e.preventDefault(); void send(); }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Write a message"
            aria-label="Write a message"
            className="max-h-36 min-h-11 flex-1 resize-none rounded-3xl bg-[var(--surface)] px-4 py-2.5 text-base"
          />
          {text.trim() || !canVoice ? (
            <Button className="h-11 shrink-0 rounded-full px-5 text-base font-semibold" disabled={!text.trim()} onClick={() => void send()}>
              <Send className="size-5" /> Send
            </Button>
          ) : (
            <Button className="h-11 shrink-0 rounded-full px-4 font-semibold" onClick={() => setRecording(true)} aria-label="Record a voice note">
              <Mic className="size-5" /> Voice
            </Button>
          )}
        </div>
      )}

      <Sheet open={sheet === "mention"} onOpenChange={(o) => !o && setSheet(null)} title="Mention someone">
        <ul className="space-y-1">
          {others.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => addMention(m)} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-2 text-left hover:bg-muted">
                <MemberAvatar member={m} size="sm" className="ring-1 ring-offset-1" /><span className="font-medium">{m.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={sheet === "sticker"} onOpenChange={(o) => !o && setSheet(null)} title="Send a sticker">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {Object.entries(STICKERS).map(([key, e]) => (
            <button key={key} type="button" aria-label={`Sticker ${key}`} className="grid aspect-square place-items-center rounded-2xl text-5xl hover:bg-muted"
              onClick={() => { setSheet(null); void insert({ kind: "sticker", sticker: key }); }}>{e}</button>
          ))}
        </div>
      </Sheet>

      <PollSheet open={sheet === "poll"} onClose={() => setSheet(null)} threadId={thread.id} onDone={() => { onClearReply(); refresh(); }} />
      <PersonSheet
        open={sheet === "ask"} onClose={() => setSheet(null)} title="Where are you?" people={others}
        hint="They'll get a notification and can share where they are with one tap. It disappears after an hour."
        button="Ask" onPick={(id) => { setSheet(null); void insert({ kind: "location_request", ask_member: id }); }}
      />
      <KudosSheet open={sheet === "kudos"} onClose={() => setSheet(null)} people={members.filter((m) => m.id !== me.id)}
        onSend={(to, body) => { setSheet(null); void insert({ kind: "kudos", kudos_to: to, body }); }} />
      <AnnounceSheet open={sheet === "announce"} onClose={() => setSheet(null)} onSend={(body) => { setSheet(null); void insert({ kind: "announcement", body }); }} />
    </div>
  );
}

// ---------------------------------------------------------------- voice notes

function VoiceRecorder({ onCancel, onDone }: { onCancel: () => void; onDone: (f: File, seconds: number) => void }) {
  const [secs, setSecs] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const cancelled = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let tick: ReturnType<typeof setInterval> | undefined;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"].find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
        const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
        rec.current = r;
        r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
        r.onstop = () => {
          stream?.getTracks().forEach((t) => t.stop());
          if (cancelled.current) return;
          const mime = (r.mimeType || type || "audio/webm").split(";")[0];
          const seconds = Math.min(180, (Date.now() - started.current) / 1000);
          const ext = mime.includes("mp4") ? "m4a" : mime.includes("aac") ? "aac" : "webm";
          onDone(new File(chunks.current, `voice.${ext}`, { type: mime === "audio/x-m4a" ? "audio/mp4" : mime }), seconds);
        };
        started.current = Date.now();
        r.start(1000);
        tick = setInterval(() => {
          const s = Math.floor((Date.now() - started.current) / 1000);
          setSecs(s);
          if (s >= 179 && r.state === "recording") r.stop();
        }, 250);
      } catch {
        setFailed("The microphone wasn't allowed. You can allow it in your device settings");
      }
    })();
    return () => {
      clearInterval(tick);
      if (rec.current?.state === "recording") { cancelled.current = true; rec.current.stop(); }
      stream?.getTracks().forEach((t) => t.stop());
    };
    // the recorder runs once per opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="flex-1">{failed}</span>
        <Button variant="outline" className="h-11 rounded-full" onClick={onCancel}>Close</Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" className="h-11 rounded-full" onClick={() => { cancelled.current = true; rec.current?.stop(); onCancel(); }}><Trash2 className="size-4" /> Cancel</Button>
      <span className="flex flex-1 items-center gap-2 text-sm font-semibold">
        <span className="size-3 animate-pulse rounded-full bg-[var(--status-red)]" />
        Recording {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")} <span className="font-normal text-muted-foreground">(3 min at most)</span>
      </span>
      <Button className="h-11 rounded-full px-5 font-semibold" onClick={() => rec.current?.stop()}><Square className="size-4" /> Send</Button>
    </div>
  );
}

// ---------------------------------------------------------------- polls

function PollSheet({ open, onClose, threadId, onDone }: { open: boolean; onClose: () => void; threadId: string; onDone: () => void }) {
  const [question, setQuestion] = useState("");
  const [kind, setKind] = useState<"choice" | "date">("choice");
  const dateOn = useExtra("board.datepoll");
  const [multi, setMulti] = useState(false);
  const [answers, setAnswers] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setQuestion(""); setKind("choice"); setMulti(false); setAnswers(["", ""]); } }, [open]);

  const filled = answers.map((a) => a.trim()).filter(Boolean);
  async function create() {
    setBusy(true);
    const options = kind === "date"
      ? filled.map((d) => ({ label: new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00`)), on_date: d }))
      : filled.map((label) => ({ label }));
    const { error } = await supabase.rpc("board_create_poll", {
      p_thread: threadId, p_question: question.trim(), p_kind: kind, p_multi: kind === "date" ? true : multi, p_options: options, p_client_id: clientId(),
    });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    onClose(); onDone();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="New poll"
      footer={<Button className="h-11 flex-1 rounded-full" disabled={busy || !question.trim() || filled.length < 2} onClick={() => void create()}>Send poll</Button>}>
      <div className="space-y-4">
        {dateOn ? (
          <div className="flex flex-wrap gap-2">
            <Chip on={kind === "choice"} onClick={() => { setKind("choice"); setAnswers(["", ""]); }}>Choices</Chip>
            <Chip on={kind === "date"} onClick={() => { setKind("date"); setAnswers(["", ""]); }}>Pick a date</Chip>
          </div>
        ) : null}
        <label className="block space-y-1">
          <span className="text-sm font-semibold">Question</span>
          <Input value={question} maxLength={200} onChange={(e) => setQuestion(e.target.value)} placeholder={kind === "date" ? "Which Saturday for Gran's visit?" : "Pizza or curry tonight?"} className="h-11" data-autofocus />
        </label>
        <div className="space-y-2">
          <span className="text-sm font-semibold">{kind === "date" ? "Dates" : "Answers"}</span>
          {answers.map((a, i) => (
            <div key={i} className="flex gap-2">
              <Input type={kind === "date" ? "date" : "text"} value={a} maxLength={100} className="h-11"
                onChange={(e) => setAnswers((x) => x.map((y, j) => (j === i ? e.target.value : y)))} aria-label={`Answer ${i + 1}`} />
              {answers.length > 2 ? <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label="Remove answer" onClick={() => setAnswers((x) => x.filter((_, j) => j !== i))}><X className="size-4" /></Button> : null}
            </div>
          ))}
          {answers.length < 12 ? <Button variant="outline" className="h-10 rounded-full" onClick={() => setAnswers((x) => [...x, ""])}><Plus className="size-4" /> Add {kind === "date" ? "a date" : "an answer"}</Button> : null}
        </div>
        {kind === "choice" ? <Chip on={multi} onClick={() => setMulti(!multi)}>People can pick more than one</Chip>
          : <p className="text-xs text-muted-foreground">Everyone ticks the dates that suit them. When you close the poll you can add the winning date to the calendar.</p>}
      </div>
    </Sheet>
  );
}

function PersonSheet({ open, onClose, title, hint, people, button, onPick }: { open: boolean; onClose: () => void; title: string; hint: string; people: Member[]; button: string; onPick: (id: string) => void }) {
  const [who, setWho] = useState<string[]>([]);
  useEffect(() => { if (open) setWho(people.length === 1 ? [people[0].id] : []); }, [open, people]);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={title}
      footer={<Button className="h-11 flex-1 rounded-full" disabled={!who.length} onClick={() => onPick(who[0])}>{button}</Button>}>
      <p className="mb-3 text-sm text-muted-foreground">{hint}</p>
      <PeoplePicker members={people} value={who} onChange={setWho} single />
    </Sheet>
  );
}

function KudosSheet({ open, onClose, people, onSend }: { open: boolean; onClose: () => void; people: Member[]; onSend: (to: string, body: string) => void }) {
  const [who, setWho] = useState<string[]>([]);
  const [body, setBody] = useState("");
  useEffect(() => { if (open) { setWho([]); setBody(""); } }, [open]);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Shout-out"
      footer={<Button className="h-11 flex-1 rounded-full" disabled={!who.length || !body.trim()} onClick={() => onSend(who[0], body.trim())}><Star className="size-4" /> Send shout-out</Button>}>
      <div className="space-y-4">
        <div className="space-y-2"><span className="text-sm font-semibold">Who for?</span><PeoplePicker members={people} value={who} onChange={setWho} single /></div>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">What for?</span>
          <Textarea value={body} maxLength={500} onChange={(e) => setBody(e.target.value)} placeholder="Well done for tidying your room!" className="min-h-24" />
        </label>
      </div>
    </Sheet>
  );
}

function AnnounceSheet({ open, onClose, onSend }: { open: boolean; onClose: () => void; onSend: (body: string) => void }) {
  const [body, setBody] = useState("");
  useEffect(() => { if (open) setBody(""); }, [open]);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Announcement" description="Everyone gets a notification and taps “Got it” so you know they've seen it."
      footer={<Button className="h-11 flex-1 rounded-full" disabled={!body.trim()} onClick={() => onSend(body.trim())}><Megaphone className="size-4" /> Send to everyone</Button>}>
      <Textarea value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} placeholder="School is closed on Friday" className={cn("min-h-32 text-base")} data-autofocus />
    </Sheet>
  );
}
