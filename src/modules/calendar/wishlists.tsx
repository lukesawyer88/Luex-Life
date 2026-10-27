import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ExternalLink, Gift, Loader2, Pencil, Plus, ShoppingBag, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { friendlyError, type Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";

import { useWishes, type WishClaim, type WishItem, type WishList } from "./data";
import { todayKey } from "./time";
import { Chip, Empty, Field, Sheet } from "./ui";

export type WishTarget = { listId?: string; memberId?: string; occasion?: "birthday" | "christmas"; year?: number };

type Choice = { memberId: string; occasion: "birthday" | "christmas"; year: number };

const PRIORITY: Record<number, string> = { 1: "Really want", 2: "Would like", 3: "Nice to have" };

function nextBirthdayYear(m: Member, today: string): number {
  const y = Number(today.slice(0, 4));
  if (!m.birthday) return y;
  return m.birthday.slice(5) >= today.slice(5) ? y : y + 1;
}
function christmasYear(today: string): number {
  const y = Number(today.slice(0, 4));
  return today.slice(5) > "12-25" ? y + 1 : y;
}
function money(n: number) {
  return `£${n.toFixed(2).replace(/\.00$/, "")}`;
}
function occasionName(o: string) {
  return o === "christmas" ? "Christmas" : "Birthday";
}

export function WishListsTab({ target, onTarget }: { target: WishTarget | null; onTarget: (t: WishTarget | null) => void }) {
  const { family, members } = useFamilyState();
  const desktop = useDesktop();
  const q = useWishes();
  const today = todayKey(family.timezone);
  const [pick, setPick] = useState<Choice | null>(null);

  // open whatever the calendar (or a notification) asked for
  useEffect(() => {
    if (!target) return;
    if (target.listId) {
      const l = q.data?.lists.find((x) => x.id === target.listId);
      if (l) setPick({ memberId: l.owner_member, occasion: l.occasion as Choice["occasion"], year: l.year });
    } else if (target.memberId && target.occasion) {
      const m = members.find((x) => x.id === target.memberId);
      setPick({
        memberId: target.memberId,
        occasion: target.occasion,
        year: target.year ?? (target.occasion === "christmas" ? christmasYear(today) : m ? nextBirthdayYear(m, today) : Number(today.slice(0, 4))),
      });
    }
  }, [target, q.data?.lists, members, today]);

  const close = () => {
    setPick(null);
    onTarget(null);
  };

  const view = pick ? <ListView key={`${pick.memberId}-${pick.occasion}-${pick.year}`} pick={pick} onBack={close} /> : null;

  return (
    <Windows>
      <RecordsWindow>
        <div className="mb-3">
          <h2 className="text-lg font-bold">Wish lists</h2>
          <p className="text-sm text-muted-foreground">Everyone has a birthday list and a Christmas list. Tap one to open it.</p>
        </div>
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {members.map((m) => {
            const bYear = nextBirthdayYear(m, today);
            const cYear = christmasYear(today);
            const older = (q.data?.lists ?? []).filter(
              (l) => l.owner_member === m.id && !(l.occasion === "birthday" && l.year === bYear) && !(l.occasion === "christmas" && l.year === cYear),
            );
            const isSel = (o: string, y: number) => pick?.memberId === m.id && pick.occasion === o && pick.year === y;
            return (
              <div key={m.id} className="glass-tile p-3">
                <div className="mb-2 flex items-center gap-2.5">
                  <MemberAvatar member={m} size="sm" />
                  <span className="font-semibold">{m.display_name}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Chip on={isSel("birthday", bYear)} onClick={() => setPick({ memberId: m.id, occasion: "birthday", year: bYear })}>
                    <Gift className="size-4" /> Birthday {bYear}
                  </Chip>
                  <Chip on={isSel("christmas", cYear)} onClick={() => setPick({ memberId: m.id, occasion: "christmas", year: cYear })}>
                    <Gift className="size-4" /> Christmas {cYear}
                  </Chip>
                  {older.map((l) => (
                    <Chip key={l.id} on={isSel(l.occasion, l.year)} onClick={() => setPick({ memberId: m.id, occasion: l.occasion as Choice["occasion"], year: l.year })}>
                      {occasionName(l.occasion)} {l.year}
                    </Chip>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </RecordsWindow>
      <DetailWindow>
        {view ?? <Empty icon={Gift} title="Choose a list">Choose someone's birthday or Christmas list.</Empty>}
      </DetailWindow>
      {!desktop ? (
        <Sheet open={!!pick} onOpenChange={(o) => !o && close()} title={pick ? listTitle(members, pick) : ""}>
          {view}
        </Sheet>
      ) : null}
    </Windows>
  );
}

function listTitle(members: Member[], p: Choice) {
  const m = members.find((x) => x.id === p.memberId);
  return `${m?.display_name ?? "Someone"}'s ${p.occasion === "christmas" ? "Christmas" : "birthday"} list ${p.year}`;
}

// ---------------------------------------------------------------- one list

function ListView({ pick, onBack }: { pick: Choice; onBack: () => void }) {
  const { family, me, members, isParent } = useFamilyState();
  const qc = useQueryClient();
  const q = useWishes();
  const owner = members.find((m) => m.id === pick.memberId);
  const list: WishList | undefined = q.data?.lists.find((l) => l.owner_member === pick.memberId && l.occasion === pick.occasion && l.year === pick.year);
  const isOwner = pick.memberId === me.id;
  const canCreate = isOwner || isParent;
  const canEdit = isOwner || (isParent && !!owner && (owner.role === "child" || !owner.user_id));
  const [creating, setCreating] = useState(false);
  const tried = useRef(false);
  const [editItem, setEditItem] = useState<WishItem | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["cal", family.id] });

  // a list is made the first time it's opened
  useEffect(() => {
    if (list || !q.data || !canCreate || tried.current) return;
    tried.current = true;
    setCreating(true);
    void Promise.resolve(
      supabase
      .from("wish_lists")
      .insert({ family_id: family.id, owner_member: pick.memberId, occasion: pick.occasion, year: pick.year })
      .then(({ error }) => {
        if (error && !/duplicate/i.test(error.message)) toast.error(friendlyError(error));
        return refresh();
      }),
    ).finally(() => setCreating(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, q.data, canCreate]);

  const items = useMemo(() => (list ? (q.data?.items ?? []).filter((i) => i.list_id === list.id) : []), [list, q.data?.items]);
  // the database never sends claims on your own list; the owner's screen never even looks
  const claims = useMemo(() => {
    const m = new Map<string, WishClaim>();
    if (!isOwner && list) for (const c of q.data?.claims ?? []) if (c.list_id === list.id) m.set(c.item_id, c);
    return m;
  }, [isOwner, list, q.data?.claims]);
  const total = items.reduce((s, i) => s + (i.price ?? 0), 0);
  const name = (id: string | null) => (id === me.id ? "You" : members.find((m) => m.id === id)?.display_name ?? "Someone");

  async function run(id: string, fn: () => PromiseLike<{ error: unknown }>, ok?: string) {
    setBusy(id);
    try {
      const { error } = await fn();
      if (error) throw error;
      await refresh();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function removeItem(it: WishItem) {
    await run(it.id, () => supabase.from("wish_items").update({ removed_at: new Date().toISOString() }).eq("id", it.id), "Removed");
  }

  if (!list) {
    return (
      <div className="space-y-3">
        <BackButton onBack={onBack} />
        {creating || q.isLoading ? (
          <p className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Opening the list…</p>
        ) : (
          <Empty icon={Gift} title="No list yet">{owner?.display_name ?? "They"} hasn't started this list yet.</Empty>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BackButton onBack={onBack} />
      <div className="flex items-center gap-3">
        {owner ? <MemberAvatar member={owner} size="md" /> : null}
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight">{isOwner ? `My ${pick.occasion === "christmas" ? "Christmas" : "birthday"} list` : listTitle(members, pick)}</h2>
          <p className="text-sm opacity-75">{pick.year} · {items.length} {items.length === 1 ? "thing" : "things"}{total > 0 ? ` · about ${money(total)}` : ""}</p>
        </div>
      </div>

      {isOwner ? (
        <p className="rounded-2xl bg-white/55 p-3 text-sm dark:bg-black/20">Nobody can tell you who's buying what. It's a surprise.</p>
      ) : null}

      {canEdit ? (
        <Button className="h-11 w-full rounded-full" onClick={() => setEditItem("new")}><Plus className="size-4" /> Add something</Button>
      ) : null}

      <div className="space-y-2">
        {items.length === 0 ? <p className="py-4 text-center text-sm opacity-70">Nothing on this list yet.</p> : null}
        {items.map((it) => {
          const c = claims.get(it.id);
          const mine = c?.claimed_by === me.id;
          return (
            <div key={it.id} className={cn("rounded-2xl bg-white/60 p-3 dark:bg-black/20", c && !mine && "opacity-70")}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{it.title}</p>
                  <p className="text-xs opacity-75">
                    {PRIORITY[it.priority] ?? ""}
                    {it.price != null ? ` · ${money(it.price)}` : ""}
                  </p>
                  {it.notes ? <p className="mt-1 whitespace-pre-wrap text-sm">{it.notes}</p> : null}
                  {it.link ? (
                    <a href={it.link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm underline">
                      See it online <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setEditItem(it)} aria-label={`Change ${it.title}`}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" className="size-10 rounded-full text-destructive" disabled={busy === it.id} onClick={() => removeItem(it)} aria-label={`Remove ${it.title}`}><Trash2 className="size-4" /></Button>
                  </div>
                ) : null}
              </div>

              {!isOwner ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {!c ? (
                    <Button size="sm" className="h-10 rounded-full" disabled={busy === it.id} onClick={() => run(it.id, () => supabase.from("wish_claims").insert({ item_id: it.id }), "It's yours to get")}>
                      <ShoppingBag className="size-4" /> I'll get this
                    </Button>
                  ) : mine ? (
                    <>
                      <Chip on={c.bought} disabled={busy === it.id} onClick={() => run(it.id, () => supabase.from("wish_claims").update({ bought: !c.bought }).eq("item_id", it.id))}>
                        <Check className="size-4" /> {c.bought ? "Bought" : "Bought it?"}
                      </Chip>
                      <Button size="sm" variant="ghost" className="h-10 rounded-full" disabled={busy === it.id} onClick={() => run(it.id, () => supabase.from("wish_claims").delete().eq("item_id", it.id), "Someone else can get it now")}>
                        <Undo2 className="size-4" /> Let someone else
                      </Button>
                    </>
                  ) : (
                    <span className="text-sm font-medium">{name(c.claimed_by)} {c.bought ? "has bought this" : "is getting this"}</span>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {owner?.role === "child" ? <p className="text-xs opacity-70">Parents get one summary alert when a child changes their list.</p> : null}

      <ItemEditor open={editItem !== null} item={editItem === "new" ? null : editItem} listId={list.id} onOpenChange={(o) => !o && setEditItem(null)} />
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className="hidden min-h-10 items-center gap-1.5 text-sm font-semibold lg:flex">
      <ArrowLeft className="size-4" /> All wish lists
    </button>
  );
}

// ---------------------------------------------------------------- add or change one thing

function ItemEditor({ open, item, listId, onOpenChange }: { open: boolean; item: WishItem | null; listId: string; onOpenChange: (o: boolean) => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState(2);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setLink(item?.link ?? "");
    setPrice(item?.price != null ? String(item.price) : "");
    setNotes(item?.notes ?? "");
    setPriority(item?.priority ?? 2);
  }, [open, item]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const l = link.trim();
      const p = price.trim() ? Number(price.replace(/[£,\s]/g, "")) : null;
      if (p != null && (!Number.isFinite(p) || p < 0)) throw new Error("Please enter a price like 12.50");
      const row = {
        title: title.trim(),
        link: l ? (/^https?:\/\//i.test(l) ? l : `https://${l}`) : null,
        price: p,
        notes: notes.trim() || null,
        priority,
      };
      const { error } = item
        ? await supabase.from("wish_items").update(row).eq("id", item.id)
        : await supabase.from("wish_items").insert({ ...row, family_id: family.id, list_id: listId });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["cal", family.id] });
      toast.success(item ? "Saved" : "Added to the list");
      onOpenChange(false);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={item ? "Change this" : "Add to the list"}
      footer={
        <>
          <Button type="submit" form="wish-form" className="h-11 flex-1 rounded-full px-6 sm:flex-none" disabled={busy || !title.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : item ? "Save" : "Add"}
          </Button>
          <Button type="button" variant="ghost" className="h-11 rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
        </>
      }
    >
      <form id="wish-form" onSubmit={save} className="space-y-4">
        <Field label="What is it?">
          <Input data-autofocus autoFocus value={title} maxLength={120} placeholder="e.g. Lego space station" onChange={(e) => setTitle(e.target.value)} className="h-12 text-base" />
        </Field>
        <Field label="How much do you want it?">
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3].map((p) => <Chip key={p} on={priority === p} onClick={() => setPriority(p)}>{PRIORITY[p]}</Chip>)}
          </div>
        </Field>
        <div className="grid grid-cols-[8rem_1fr] gap-2">
          <Field label="Price (£)">
            <Input inputMode="decimal" value={price} maxLength={10} placeholder="0.00" onChange={(e) => setPrice(e.target.value)} className="h-11" />
          </Field>
          <Field label="Link to a shop">
            <Input inputMode="url" value={link} maxLength={500} placeholder="https://" onChange={(e) => setLink(e.target.value)} className="h-11" />
          </Field>
        </div>
        <Field label="Notes" hint="Size, colour, which one">
          <Textarea value={notes} maxLength={500} rows={3} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Sheet>
  );
}
