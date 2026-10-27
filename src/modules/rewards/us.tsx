// Together: shared rewards everyone puts stars towards, up-for-grabs jobs anyone can claim, and (for grown-ups who
// aren't parents) a way to give a child some money.
import { useQueryClient } from "@tanstack/react-query";
import { Archive, BriefcaseBusiness, Camera, Check, Gift, Hand, Loader2, Pencil, Plus, Star, Trophy, Undo2, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Database } from "@/lib/database.types";
import type { Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { fitJpeg } from "@/lib/image";
import { supabase } from "@/lib/supabase";
import { Chip, Empty, Field, PeoplePicker, Sheet } from "@/modules/calendar/ui";

import {
  errMsg, money, refreshRewards, removeProofPhoto, uploadProofPhoto, useBalances, useJobs, useRewardPhotoUrls, useRewards,
  type Reward, type RewardGive, type RewardJob,
} from "./data";
import type { TabProps } from "./rewards-page";

/** "£1.50" from what someone typed; null when it isn't a sensible amount */
function readMoney(s: string, max = 10000): number | null {
  const t = s.replace(/[£,\s]/g, "");
  if (!t) return 0;
  const v = Math.round(Number(t) * 100) / 100;
  return Number.isFinite(v) && v >= 0 && v < max ? v : null;
}

export function UsTab({ target }: TabProps) {
  const { role, members, me } = useFamilyState();
  const [view, setView] = useState<"shared" | "jobs">(target.jobId ? "jobs" : "shared");
  const [gift, setGift] = useState(false);
  const balances = useBalances();
  const myStars = balances.data?.get(me.id)?.stars ?? 0;
  const children = members.filter((m) => m.role === "child" && !m.archived_at);

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip on={view === "shared"} onClick={() => setView("shared")}><Trophy className="size-4" /> Shared rewards</Chip>
          <Chip on={view === "jobs"} onClick={() => setView("jobs")}><BriefcaseBusiness className="size-4" /> Up-for-grabs jobs</Chip>
          {role === "member" && children.length ? (
            <Button data-testid="gift-open" variant="outline" className="ml-auto h-10 rounded-full" onClick={() => setGift(true)}><Gift className="size-4" /> Give a child some money</Button>
          ) : null}
        </div>
        {view === "shared" ? <Shared myStars={myStars} /> : <Jobs />}
      </RecordsWindow>
      <DetailWindow>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Star className="size-4" /> Your stars</h3>
        <p className="text-3xl font-bold tabular-nums">{myStars}</p>
        <div className="mt-4 space-y-2 text-sm">
          <p><b>Shared rewards:</b> everyone in it puts stars in. When the stars add up, it's reached.</p>
          <p><b>Up-for-grabs jobs:</b> the first to say "I'll do it" gets it. The person who set it up checks it, then it's paid.</p>
        </div>
      </DetailWindow>
      <GiftSheet open={gift} onClose={() => setGift(false)} kids={children} />
    </Windows>
  );
}

// ---------------------------------------------------------------- shared rewards

function Shared({ myStars }: { myStars: number }) {
  const { me, members, role, isParent } = useFamilyState();
  const q = useRewards();
  const shared = useMemo(() => (q.data?.rewards ?? []).filter((r) => r.kind === "shared"), [q.data]);
  const gives = q.data?.gives ?? [];
  const [edit, setEdit] = useState<Reward | "new" | null>(null);
  const [give, setGive] = useState<Reward | null>(null);
  const open = shared.filter((r) => !r.done_at);
  const reached = shared.filter((r) => r.done_at);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-lg font-bold">Shared rewards</h2>
        {role !== "child" ? <Button data-testid="shared-add" className="h-10 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-4" /> Add</Button> : null}
      </div>
      {q.isLoading ? null : !shared.length ? (
        <Empty icon={Trophy} title="No shared rewards yet">
          {role !== "child" ? "Add something to save stars towards together, like a takeaway night or a day out." : "Ask a grown-up to add one."}
        </Empty>
      ) : (
        <ul className="space-y-2">
          {[...open, ...reached].map((r) => (
            <SharedRow key={r.id} r={r} gives={gives.filter((g) => g.reward_id === r.id)} members={members}
              canGive={!r.done_at && (r.people.length === 0 || r.people.includes(me.id))}
              canEdit={!r.done_at && (r.created_by === me.id || isParent)}
              onGive={() => setGive(r)} onEdit={() => setEdit(r)} />
          ))}
        </ul>
      )}
      <EditShared value={edit} onClose={() => setEdit(null)} />
      <GiveSheet reward={give} gives={gives} myStars={myStars} onClose={() => setGive(null)} />
    </div>
  );
}

function SharedRow({ r, gives, members, canGive, canEdit, onGive, onEdit }: {
  r: Reward; gives: RewardGive[]; members: Member[]; canGive: boolean; canEdit: boolean; onGive: () => void; onEdit: () => void;
}) {
  const { me } = useFamilyState();
  const total = gives.reduce((n, g) => n + g.stars, 0);
  const pct = Math.min(100, (total / r.stars) * 100);
  const by = new Map<string, number>();
  for (const g of gives) by.set(g.member_id, (by.get(g.member_id) ?? 0) + g.stars);
  const who = r.people.length ? members.filter((m) => r.people.includes(m.id)) : [];
  return (
    <li className="glass-tile space-y-2 p-3" data-testid="shared-row">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-2xl">{r.emoji || "🎉"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{r.title}</p>
          <p className="truncate text-xs text-muted-foreground">{who.length ? who.map((m) => (m.id === me.id ? "You" : m.display_name)).join(", ") : "Everyone"}</p>
        </div>
        {r.done_at ? <span className="rounded-full bg-[var(--status-green-soft)] px-3 py-1 text-sm font-bold text-[var(--status-green)]">Reached!</span>
          : <span className="shrink-0 text-right font-bold tabular-nums">{total} / {r.stars} ★</span>}
      </div>
      <span className="block h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface)]"><span className="block h-full rounded-full bg-[var(--gold)]" style={{ width: `${pct}%` }} /></span>
      {by.size ? (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {[...by.entries()].map(([id, n]) => {
            const m = members.find((x) => x.id === id);
            return <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[var(--surface)] py-0.5 pl-0.5 pr-2">{m ? <MemberAvatar member={m} size="sm" className="size-5 text-[9px] ring-0 ring-offset-0" /> : null}{m?.id === me.id ? "You" : m?.display_name ?? "Someone"} {n}</span>;
          })}
        </div>
      ) : null}
      {canGive || canEdit ? (
        <div className="flex gap-2">
          {canGive ? <Button data-testid="shared-give" className="h-11 flex-1 rounded-full font-semibold" onClick={onGive}><Star className="size-4" /> Put stars in</Button> : null}
          {canEdit ? <Button variant="outline" className="h-11 rounded-full" onClick={onEdit} aria-label="Change"><Pencil className="size-4" /> Change</Button> : null}
        </div>
      ) : null}
    </li>
  );
}

function EditShared({ value, onClose }: { value: Reward | "new" | null; onClose: () => void }) {
  const { family, members } = useFamilyState();
  const qc = useQueryClient();
  const existing = value && value !== "new" ? value : null;
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [stars, setStars] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!value) return;
    setTitle(existing?.title ?? ""); setEmoji(existing?.emoji ?? ""); setStars(existing ? String(existing.stars) : ""); setPeople(existing?.people ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const n = Math.round(Number(stars));
  const ok = title.trim().length > 0 && Number.isFinite(n) && n >= 1 && n <= 100000;

  async function save() {
    setBusy(true);
    try {
      const row = { title: title.trim(), emoji: emoji.trim() || null, stars: n, people };
      const { error } = existing
        ? await supabase.from("rewards").update(row).eq("id", existing.id)
        : await supabase.from("rewards").insert({ ...row, family_id: family.id, kind: "shared" });
      if (error) throw error;
      await refreshRewards(qc, family.id);
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!existing) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("rewards").update({ archived_at: new Date().toISOString() }).eq("id", existing.id);
      if (error) throw error;
      await refreshRewards(qc, family.id);
      toast.success("Put away. Stars already put in stay spent");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "Change shared reward" : "New shared reward"}
      footer={
        <>
          <Button data-testid="shared-save" className="h-11 flex-1 rounded-full px-6 sm:flex-none" disabled={!ok || busy} onClick={save}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}</Button>
          <Button variant="ghost" className="h-11 rounded-full" onClick={onClose}>Cancel</Button>
          {existing ? <Button variant="ghost" className="ml-auto h-11 rounded-full" disabled={busy} onClick={archive}><Archive className="size-4" /> Put away</Button> : null}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex gap-2">
          <Input aria-label="Emoji" value={emoji} maxLength={4} placeholder="🍕" className="h-12 w-16 text-center text-xl" onChange={(e) => setEmoji(e.target.value)} />
          <Input data-autofocus data-testid="shared-title" value={title} maxLength={80} placeholder="e.g. Takeaway and film night" className="h-12 flex-1 text-base font-semibold" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <Field label="Stars needed">
          <Input data-testid="shared-stars" inputMode="numeric" value={stars} placeholder="50" className="h-11 w-32" onChange={(e) => setStars(e.target.value)} />
        </Field>
        <Field label="Who's in it?" hint={people.length ? "Only these people can put stars in." : "Nobody picked: everyone in the household is in it."}>
          <PeoplePicker members={members.filter((m) => !m.archived_at)} value={people} onChange={setPeople} />
        </Field>
      </div>
    </Sheet>
  );
}

function GiveSheet({ reward, gives, myStars, onClose }: { reward: Reward | null; gives: RewardGive[]; myStars: number; onClose: () => void }) {
  const { family, me } = useFamilyState();
  const qc = useQueryClient();
  const [n, setN] = useState(1);
  const [busy, setBusy] = useState(false);
  const left = reward ? Math.max(0, reward.stars - gives.filter((g) => g.reward_id === reward.id).reduce((s, g) => s + g.stars, 0)) : 0;
  const max = Math.max(0, Math.min(myStars, left));
  useEffect(() => { if (reward) setN(Math.min(Math.max(1, max), max || 1)); }, [reward, max]);

  async function save() {
    if (!reward) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("reward_gives").insert({ family_id: family.id, reward_id: reward.id, member_id: me.id, stars: n });
      if (error) throw error;
      await refreshRewards(qc, family.id);
      toast.success(n >= left ? "That's it, reached!" : `${n} ${n === 1 ? "star" : "stars"} put in`);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!reward}
      onOpenChange={(o) => !o && onClose()}
      title={reward ? `Put stars in: ${reward.title}` : ""}
      footer={
        <>
          <Button data-testid="shared-give-save" className="h-11 flex-1 rounded-full px-6 sm:flex-none" disabled={busy || max < 1 || n < 1 || n > max} onClick={save}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : `Put in ${n} ${n === 1 ? "star" : "stars"}`}
          </Button>
          <Button variant="ghost" className="h-11 rounded-full" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      {max < 1 ? (
        <p className="text-sm">{myStars < 1 ? "You haven't got any stars to put in yet. Chores, routines and habits earn them." : "It's nearly there already."}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">You have {myStars} {myStars === 1 ? "star" : "stars"}. It needs {left} more.</p>
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" className="size-14 rounded-full text-2xl" disabled={n <= 1} onClick={() => setN((x) => Math.max(1, x - 1))} aria-label="One fewer">−</Button>
            <Input data-testid="shared-give-amount" inputMode="numeric" aria-label="Stars" value={String(n)} className="h-14 w-24 text-center text-2xl font-bold"
              onChange={(e) => { const v = Math.round(Number(e.target.value)); if (Number.isFinite(v)) setN(Math.max(0, Math.min(max, v))); }} />
            <Button variant="outline" className="size-14 rounded-full text-2xl" disabled={n >= max} onClick={() => setN((x) => Math.min(max, x + 1))} aria-label="One more">+</Button>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {[...new Set([1, 5, 10, max])].filter((v) => v >= 1 && v <= max).map((v) => <Chip key={v} on={n === v} onClick={() => setN(v)}>{v === max ? `All ${v}` : v}</Chip>)}
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- up-for-grabs jobs

function Jobs() {
  const { me, role, isParent } = useFamilyState();
  const q = useJobs();
  const jobs = useMemo(() => q.data ?? [], [q.data]);
  const [edit, setEdit] = useState<RewardJob | "new" | null>(null);
  const open = jobs.filter((j) => !j.claimed_by && !j.confirmed_at);
  const doing = jobs.filter((j) => j.claimed_by && !j.done_at && !j.confirmed_at);
  const checking = jobs.filter((j) => j.done_at && !j.confirmed_at);
  const paid = jobs.filter((j) => j.confirmed_at).slice(0, 10);
  const photos = useRewardPhotoUrls(checking.filter((j) => j.created_by === me.id || isParent).map((j) => j.photo_path));

  const groups: { title: string; list: RewardJob[] }[] = [
    { title: "Up for grabs", list: open }, { title: "Being done", list: doing }, { title: "Done, waiting to be checked", list: checking }, { title: "Paid", list: paid },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-lg font-bold">Up-for-grabs jobs</h2>
        {role !== "child" ? <Button data-testid="job-add" className="h-10 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-4" /> Add</Button> : null}
      </div>
      {q.isLoading ? null : !jobs.length ? (
        <Empty icon={BriefcaseBusiness} title="No jobs yet">{role !== "child" ? "Add a one-off job anyone can claim, like “Wash the car, £3”." : "When a grown-up adds a job, it shows here."}</Empty>
      ) : (
        groups.map((g) => (g.list.length ? (
          <section key={g.title}>
            <h3 className="mb-2 text-sm font-bold">{g.title}</h3>
            <ul className="space-y-2">{g.list.map((j) => <JobRow key={j.id} j={j} photoUrl={j.photo_path ? photos.data?.get(j.photo_path) : undefined} onEdit={() => setEdit(j)} />)}</ul>
          </section>
        ) : null))
      )}
      <EditJob value={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function JobRow({ j, photoUrl, onEdit }: { j: RewardJob; photoUrl?: string; onEdit: () => void }) {
  const { family, me, members, isParent } = useFamilyState();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const name = (id: string | null) => (id === me.id ? "You" : members.find((m) => m.id === id)?.display_name ?? "Someone");
  const forMe = j.people.length === 0 || j.people.includes(me.id);
  const pay = [Number(j.money) > 0 ? money(j.money) : "", j.stars > 0 ? `${j.stars} ★` : ""].filter(Boolean).join(" + ");
  const canCheck = j.done_at && !j.confirmed_at && j.claimed_by !== me.id && (j.created_by === me.id || isParent);
  const canEdit = !j.claimed_by && !j.confirmed_at && (j.created_by === me.id || isParent);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await refreshRewards(qc, family.id);
      toast.success(label);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const update = async (row: Database["public"]["Tables"]["reward_jobs"]["Update"]) => {
    const { error } = await supabase.from("reward_jobs").update(row).eq("id", j.id);
    if (error) throw error;
  };
  async function done(photo?: File) {
    if (j.needs_photo && !photo) { file.current?.click(); return; }
    await run("Done! It'll be checked soon", async () => {
      const path = photo ? await uploadProofPhoto(family.id, me.id, await fitJpeg(photo, 1280)) : null;
      try {
        await update({ done_at: new Date().toISOString(), ...(path ? { photo_path: path } : {}) });
      } catch (e) {
        void removeProofPhoto(path);
        throw e;
      }
    });
  }

  return (
    <li className="glass-tile space-y-2 p-3" data-testid="job-row">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-2xl">{j.emoji || "🧽"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{j.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {j.claimed_by ? `${name(j.claimed_by)}${j.confirmed_at ? " · paid" : j.done_at ? " · done" : " is doing it"}` : j.people.length ? `For ${j.people.map(name).join(", ")}` : "Anyone"}
            {j.needs_photo && !j.done_at ? " · needs a photo" : ""}
          </p>
        </div>
        <span className="shrink-0 font-bold tabular-nums">{pay || "Thanks"}</span>
        {canEdit ? <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" aria-label="Change" onClick={onEdit}><Pencil className="size-4" /></Button> : null}
      </div>

      {canCheck && j.photo_path ? (
        photoUrl ? <img data-testid="job-photo" src={photoUrl} alt="Proof photo" className="max-h-60 w-full rounded-2xl object-contain" />
          : <p className="text-xs text-muted-foreground">Loading the photo…</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!j.claimed_by && forMe ? (
          <Button data-testid="job-claim" className="h-11 flex-1 rounded-full font-semibold" disabled={busy} onClick={() => run("It's yours", () => update({ claimed_by: me.id }))}>
            <Hand className="size-4" /> I'll do it
          </Button>
        ) : null}
        {j.claimed_by === me.id && !j.done_at ? (
          <>
            <Button data-testid="job-done" className="h-11 flex-1 rounded-full font-semibold" disabled={busy} onClick={() => void done()}>
              {j.needs_photo ? <Camera className="size-4" /> : <Check className="size-4" />} {j.needs_photo ? "Done (take a photo)" : "Done"}
            </Button>
            <Button variant="outline" className="h-11 rounded-full" disabled={busy} onClick={() => run("Given back", () => update({ claimed_by: null }))}><Undo2 className="size-4" /> Give it back</Button>
          </>
        ) : null}
        {canCheck ? (
          <Button data-testid="job-pay" className="h-11 flex-1 rounded-full font-semibold" disabled={busy}
            onClick={() => run("Paid", async () => { const old = j.photo_path; await update({ confirmed_at: new Date().toISOString() }); void removeProofPhoto(old); })}>
            <Check className="size-4" /> Looks good, pay
          </Button>
        ) : null}
        {j.done_at && !j.confirmed_at && j.claimed_by === me.id ? <p className="text-sm text-muted-foreground">Waiting for {name(j.created_by)} to check it.</p> : null}
      </div>
      <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" data-testid="job-photo-input"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void done(f); }} />
    </li>
  );
}

function EditJob({ value, onClose }: { value: RewardJob | "new" | null; onClose: () => void }) {
  const { family, members } = useFamilyState();
  const qc = useQueryClient();
  const existing = value && value !== "new" ? value : null;
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [pay, setPay] = useState("");
  const [stars, setStars] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [photo, setPhoto] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!value) return;
    setTitle(existing?.title ?? ""); setEmoji(existing?.emoji ?? "");
    setPay(existing && Number(existing.money) > 0 ? Number(existing.money).toFixed(2) : "");
    setStars(existing && existing.stars > 0 ? String(existing.stars) : "");
    setPeople(existing?.people ?? []); setPhoto(existing?.needs_photo ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const m = readMoney(pay);
  const s = stars.trim() ? Math.round(Number(stars)) : 0;
  const ok = title.trim().length > 0 && m !== null && Number.isFinite(s) && s >= 0 && s <= 1000;

  async function save() {
    setBusy(true);
    try {
      const row = { title: title.trim(), emoji: emoji.trim() || null, money: m ?? 0, stars: s, people, needs_photo: photo };
      const { error } = existing
        ? await supabase.from("reward_jobs").update(row).eq("id", existing.id)
        : await supabase.from("reward_jobs").insert({ ...row, family_id: family.id });
      if (error) throw error;
      await refreshRewards(qc, family.id);
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!existing) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("reward_jobs").update({ archived_at: new Date().toISOString() }).eq("id", existing.id);
      if (error) throw error;
      await refreshRewards(qc, family.id);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "Change job" : "New job"}
      footer={
        <>
          <Button data-testid="job-save" className="h-11 flex-1 rounded-full px-6 sm:flex-none" disabled={!ok || busy} onClick={save}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}</Button>
          <Button variant="ghost" className="h-11 rounded-full" onClick={onClose}>Cancel</Button>
          {existing ? <Button variant="ghost" className="ml-auto h-11 rounded-full" disabled={busy} onClick={archive}><Archive className="size-4" /> Remove</Button> : null}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex gap-2">
          <Input aria-label="Emoji" value={emoji} maxLength={4} placeholder="🚗" className="h-12 w-16 text-center text-xl" onChange={(e) => setEmoji(e.target.value)} />
          <Input data-autofocus data-testid="job-title" value={title} maxLength={80} placeholder="e.g. Wash the car" className="h-12 flex-1 text-base font-semibold" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-4">
          <Field label="Pays">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">£</span>
              <Input data-testid="job-money" inputMode="decimal" value={pay} placeholder="0.00" className="h-11 w-28" onChange={(e) => setPay(e.target.value)} />
            </div>
          </Field>
          <Field label="And stars">
            <Input data-testid="job-stars" inputMode="numeric" value={stars} placeholder="0" className="h-11 w-24" onChange={(e) => setStars(e.target.value)} />
          </Field>
        </div>
        <Field label="Who can do it?" hint={people.length ? "Only these people can claim it." : "Nobody picked: anyone in the household."}>
          <PeoplePicker members={members.filter((x) => !x.archived_at)} value={people} onChange={setPeople} />
        </Field>
        <label className="flex min-h-10 items-center justify-between gap-3 text-sm font-semibold">
          <span className="flex items-center gap-2"><Camera className="size-4" /> Needs a photo to show it's done</span>
          <Switch data-testid="job-needs-photo" checked={photo} onCheckedChange={setPhoto} />
        </label>
        <p className="text-xs text-muted-foreground">Photos are deleted once the job is checked and paid.</p>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- gift money from a grown-up who isn't a parent

function GiftSheet({ open, onClose, kids }: { open: boolean; onClose: () => void; kids: Member[] }) {
  const { family } = useFamilyState();
  const [who, setWho] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"gift" | "birthday">("gift");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setWho(kids.length === 1 ? [kids[0].id] : []); setAmount(""); setKind("gift"); setNote(""); } }, [open, kids]);
  const a = readMoney(amount, 10000);
  const ok = who.length === 1 && a !== null && a > 0;

  async function save() {
    setBusy(true);
    try {
      // sent without reading it back: only parents can see a child's money
      const { error } = await supabase.from("pocket_entries").insert({ family_id: family.id, member_id: who[0], amount: a!, kind, note: note.trim(), pot: "spend" });
      if (error) throw error;
      toast.success("Sent. A parent will add it");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Give a child some money"
      description="Hand over the money as usual. This tells a parent to add it to their pocket money."
      footer={
        <>
          <Button data-testid="gift-save" className="h-11 flex-1 rounded-full px-6 sm:flex-none" disabled={!ok || busy} onClick={save}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Send"}</Button>
          <Button variant="ghost" className="h-11 rounded-full" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Who for?">
          <PeoplePicker members={kids} value={who} onChange={setWho} single />
        </Field>
        <Field label="How much?">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold">£</span>
            <Input data-testid="gift-amount" inputMode="decimal" value={amount} placeholder="0.00" className="h-14 w-36 text-2xl font-bold" onChange={(e) => setAmount(e.target.value)} />
          </div>
        </Field>
        <Field label="What for?">
          <div className="flex gap-1.5">
            <Chip on={kind === "gift"} onClick={() => setKind("gift")}><Gift className="size-4" /> A gift</Chip>
            <Chip on={kind === "birthday"} onClick={() => setKind("birthday")}><Users className="size-4" /> Birthday</Chip>
          </div>
        </Field>
        <Field label="Note (optional)">
          <Input value={note} maxLength={120} placeholder="e.g. For being a star" className="h-11" onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

