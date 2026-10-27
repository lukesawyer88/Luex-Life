// The family shopping list: grouped by the family's own aisles, real-time for everyone, easy one-handed in the shop.
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive, CalendarPlus, Check, ChevronRight, CloudOff, ListPlus, Loader2, MoreHorizontal, Pencil, Plus, Refrigerator, ScanBarcode, Sparkles, Star, Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useExtra } from "@/lib/extras";
import { useFamilyState } from "@/lib/family-context";
import { friendlyError } from "@/lib/family";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { Sheet } from "@/modules/calendar/ui";

import type { Product } from "./barcode";
import { DEFAULT_AISLES, refreshFood, useShopping, useStock, type ListItem, type ShopList } from "./data";
import type { FoodTarget } from "./food-page";
import { formatQty, nameKey, parseIngredient } from "./ingredients";
import { BarcodeSheet } from "./shop-barcode";
import { canEditItem, ItemDetail } from "./shop-item";
import { flushOutbox, queueJob, readOutbox } from "./shop-outbox";
import { AddWeekSheet } from "./shop-week";

const OTHER = "Other";

function useOnline() {
  const [on, setOn] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return on;
}

export function ShoppingTab({ target }: { target: FoodTarget; onGo: (t: FoodTarget) => void }) {
  const { family, me, members, role } = useFamilyState();
  const showScan = useExtra("food.scan");
  const showAssign = useExtra("food.assign");
  const adult = role !== "child";
  const qc = useQueryClient();
  const desktop = useDesktop();
  const online = useOnline();
  const shop = useShopping();
  const stock = useStock();
  const lists = shop.data?.lists ?? [];
  const [listId, setListId] = useState<string | null>(target.listId ?? null);
  const list = lists.find((l) => l.id === listId) ?? lists[0] ?? null;
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "week" | "barcode" | "newlist" | "rename">(null);
  const [pendingTicks, setPendingTicks] = useState<Record<string, boolean>>({});
  const [waiting, setWaiting] = useState(() => readOutbox());
  const madeDefault = useRef(false);

  const refresh = useCallback(() => refreshFood(qc, family.id), [qc, family.id]);

  // every family has at least a "Weekly shop"
  useEffect(() => {
    if (!shop.data || shop.data.lists.length || madeDefault.current || !navigator.onLine) return;
    madeDefault.current = true;
    void supabase.from("food_lists").insert({ family_id: family.id, title: "Weekly shop", emoji: "🛒" }).then(() => refresh());
  }, [shop.data, family.id, refresh]);

  // send anything that waited for a signal
  useEffect(() => {
    if (!online) return;
    if (!readOutbox().length) return;
    void flushOutbox().then((n) => {
      setWaiting(readOutbox());
      if (n) { toast.success(`Sent ${n} change${n === 1 ? "" : "s"} made while offline`); void refresh(); }
    });
  }, [online, refresh]);

  const items = useMemo(() => (shop.data?.items ?? []).filter((i) => i.list_id === list?.id), [shop.data, list?.id]);
  const aisles = shop.data?.aisles ?? [];
  const known = shop.data?.known ?? [];
  const inStock = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stock.data ?? []) m.set(nameKey(s.name), s.place === "freezer" ? "In the freezer" : s.place === "cupboard" ? "In the cupboard" : "In the fridge");
    return m;
  }, [stock.data]);

  const isDone = (i: ListItem) => (i.id in pendingTicks ? pendingTicks[i.id] : !!i.done_at);

  // group by the family's aisle order; ticked ones sink to the bottom of their aisle
  const groups = useMemo(() => {
    const order = new Map(aisles.map((a, n) => [a.name, n]));
    const by = new Map<string, ListItem[]>();
    for (const i of items) {
      const a = i.aisle && (order.has(i.aisle) || !aisles.length) ? i.aisle : i.aisle ?? OTHER;
      by.set(a, [...(by.get(a) ?? []), i]);
    }
    return [...by.entries()]
      .sort(([a], [b]) => (a === OTHER ? 1 : b === OTHER ? -1 : (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b)))
      .map(([name, list]) => ({
        name,
        items: [...list].sort((x, y) => Number(isDone(x)) - Number(isDone(y)) || x.position - y.position || x.created_at.localeCompare(y.created_at)),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, aisles, pendingTicks]);

  const ticked = items.filter(isDone);
  const toGet = items.length - ticked.length;
  const selected = items.find((i) => i.id === openItem) ?? null;

  // ---------------------------------------------------------------- actions

  async function addItem(raw: string, extra: { aisle?: string | null } = {}) {
    if (!list) return;
    const p = parseIngredient(raw);
    const name = (p.qty === null ? raw.trim() : p.name).slice(0, 100);
    if (!name) return;
    const row = { list_id: list.id, family_id: family.id, name, quantity: p.qty, unit: p.unit, note: p.note ?? "", aisle: extra.aisle ?? null, position: Date.now() / 1000 };
    if (!navigator.onLine) {
      queueJob({ kind: "add", id: crypto.randomUUID(), list_id: list.id, family_id: family.id, name, quantity: p.qty, unit: p.unit, note: p.note ?? "" });
      setWaiting(readOutbox());
      toast("Saved on this phone. It'll send when you're back online");
      return;
    }
    const { error } = await supabase.from("food_list_items").insert(row);
    if (error) toast.error(friendlyError(error)); else void refresh();
  }

  async function tick(i: ListItem) {
    const done = !isDone(i);
    setPendingTicks((t) => ({ ...t, [i.id]: done }));
    if (!navigator.onLine) {
      queueJob({ kind: "tick", id: crypto.randomUUID(), item_id: i.id, done });
      setWaiting(readOutbox());
      return;
    }
    const { error } = await supabase.from("food_list_items").update({ done_at: done ? new Date().toISOString() : null }).eq("id", i.id);
    if (error) { toast.error(friendlyError(error)); setPendingTicks((t) => { const n = { ...t }; delete n[i.id]; return n; }); return; }
    await refresh();
    setPendingTicks((t) => { const n = { ...t }; delete n[i.id]; return n; });
  }

  async function reinsert(rows: ListItem[]) {
    const { data, error } = await supabase.from("food_list_items").insert(rows.map((r) => ({
      list_id: r.list_id, family_id: r.family_id, name: r.name, quantity: r.quantity, unit: r.unit, note: r.note,
      aisle: r.aisle, photo_path: r.photo_path, assignee: r.assignee, recipe_ids: r.recipe_ids, position: r.position,
    }))).select("id");
    if (error) { toast.error(friendlyError(error)); return; }
    // put the ticks back too
    const tickedBack = (data ?? []).filter((_, n) => rows[n].done_at).map((d) => d.id as string);
    if (tickedBack.length) await supabase.from("food_list_items").update({ done_at: new Date().toISOString() }).in("id", tickedBack);
    void refresh();
  }

  async function remove(rows: ListItem[], label: string) {
    const { error } = await supabase.from("food_list_items").delete().in("id", rows.map((r) => r.id));
    if (error) { toast.error(friendlyError(error)); return; }
    setOpenItem(null);
    void refresh();
    toast(label, { action: { label: "Undo", onClick: () => void reinsert(rows) }, duration: 8000 });
  }

  function clearTicked() {
    const mine = ticked.filter((i) => canEditItem(i, me.id, adult));
    if (!mine.length) { toast("Only a grown-up can clear other people's items"); return; }
    void remove(mine, `Cleared ${mine.length} ticked item${mine.length === 1 ? "" : "s"}`);
  }

  async function move(i: ListItem, dir: -1 | 1) {
    const group = groups.find((g) => g.items.some((x) => x.id === i.id))?.items ?? [];
    const n = group.findIndex((x) => x.id === i.id);
    const other = group[n + dir];
    if (!other) return;
    const beyond = group[n + dir * 2];
    const pos = beyond ? (other.position + beyond.position) / 2 : other.position + dir;
    const { error } = await supabase.from("food_list_items").update({ position: pos }).eq("id", i.id);
    if (error) toast.error(friendlyError(error)); else void refresh();
  }

  async function setUpAisles() {
    const { error } = await supabase.from("food_aisles").insert(DEFAULT_AISLES.map((name, n) => ({ family_id: family.id, name, position: n })));
    if (error) toast.error(friendlyError(error)); else { toast.success("Aisles set up. Change them any time in Food settings"); void refresh(); }
  }

  async function archiveList(l: ShopList) {
    const { error } = await supabase.from("food_lists").update({ archived_at: new Date().toISOString() }).eq("id", l.id);
    if (error) { toast.error(friendlyError(error)); return; }
    setListId(null);
    void refresh();
    toast(`"${l.title}" put away`, { action: { label: "Undo", onClick: () => void supabase.from("food_lists").update({ archived_at: null }).eq("id", l.id).then(() => refresh()) } });
  }

  function fromBarcode(p: Product) {
    if (!p.name) return;
    void addItem(p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? `${p.brand} ${p.name}` : p.name);
  }

  const canManageList = (l: ShopList) => adult || l.created_by === me.id;

  // ---------------------------------------------------------------- screen

  const detail = selected ? (
    <ItemDetail
      key={selected.id}
      item={selected}
      aisles={aisles}
      known={known}
      onMove={(d) => void move(selected, d)}
      onRemove={() => void remove([selected], `Removed ${selected.name}`)}
      onClose={desktop ? undefined : () => setOpenItem(null)}
    />
  ) : (
    <ShopHelp toGet={toGet} ticked={ticked.length} />
  );

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-2 overflow-hidden">
        {/* lists */}
        <div className="flex items-center gap-1.5">
          <div className="scrollbar-none -mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1">
            {lists.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={l.id === list?.id}
                onClick={() => { setListId(l.id); setOpenItem(null); }}
                className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold", l.id === list?.id ? "bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "bg-[var(--surface)]")}
              >
                {l.emoji ? <span aria-hidden>{l.emoji}</span> : null}{l.title}
              </button>
            ))}
            <Button variant="ghost" className="h-10 shrink-0 rounded-full px-3" onClick={() => setDialog("newlist")}><ListPlus className="size-4" /> New list</Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" aria-label="List options"><MoreHorizontal className="size-5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onSelect={() => setDialog("week")}><CalendarPlus className="mr-2 size-4" /> Add the week's meals</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => clearTicked()} disabled={!ticked.length}><Check className="mr-2 size-4" /> Clear ticked</DropdownMenuItem>
              {list && canManageList(list) ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setDialog("rename")}><Pencil className="mr-2 size-4" /> Rename this list</DropdownMenuItem>
                  {lists.length > 1 ? <DropdownMenuItem onSelect={() => void archiveList(list)}><Archive className="mr-2 size-4" /> Put this list away</DropdownMenuItem> : null}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {!online || waiting.length ? (
          <p className="flex items-center gap-2 rounded-xl bg-[var(--status-amber-soft)] px-3 py-2 text-sm text-[var(--status-amber)]">
            <CloudOff className="size-4 shrink-0" />
            {online ? `Sending ${waiting.length} change${waiting.length === 1 ? "" : "s"}…` : "Offline — changes will send when you're back"}
          </p>
        ) : null}

        <AddBar onAdd={(t) => void addItem(t)} onScan={showScan ? () => setDialog("barcode") : undefined} known={known} existing={items} />

        {adult && !aisles.length && items.length > 0 ? (
          <button type="button" onClick={() => void setUpAisles()} className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--status-blue-soft)] px-3 text-left text-sm text-[var(--status-blue)]">
            <Sparkles className="size-4 shrink-0" /> Sort the list by aisle — set up the usual supermarket aisles in one tap <ChevronRight className="ml-auto size-4" />
          </button>
        ) : null}

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
          {shop.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" /> Loading the list…</p> : null}
          {!shop.isLoading && !items.length ? (
            <div className="py-10 text-center">
              <p className="font-semibold">Nothing on this list yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Type something above{showScan ? ", scan a barcode," : ""} or add the week's meals.</p>
              <Button variant="outline" className="mt-3 h-11 rounded-full" onClick={() => setDialog("week")}><CalendarPlus className="size-4" /> Add the week's meals</Button>
            </div>
          ) : null}
          {groups.map((g) => (
            <section key={g.name} className="mb-3">
              <h3 className="sticky top-0 z-10 mb-1 bg-[var(--records,transparent)] px-1 py-1 text-xs font-bold uppercase tracking-wide text-muted-foreground backdrop-blur">{g.name}</h3>
              <ul className="space-y-1.5">
                {g.items.map((i) => (
                  <ItemRow
                    key={i.id}
                    item={i}
                    done={isDone(i)}
                    selected={i.id === openItem}
                    stockHint={inStock.get(nameKey(i.name))}
                    onTick={() => void tick(i)}
                    onOpen={() => setOpenItem(i.id)}
                    member={showAssign ? members.find((m) => m.id === i.assignee) : undefined}
                    adder={i.added_by !== me.id ? members.find((m) => m.id === i.added_by)?.display_name : undefined}
                  />
                ))}
              </ul>
            </section>
          ))}
          {ticked.length ? (
            <div className="mt-2 flex justify-center pb-2">
              <Button variant="outline" className="h-11 rounded-full" onClick={clearTicked}><Trash2 className="size-4" /> Clear {ticked.length} ticked</Button>
            </div>
          ) : null}
        </div>
      </RecordsWindow>
      <DetailWindow>{detail}</DetailWindow>

      {!desktop ? (
        <Sheet open={!!selected} onOpenChange={(o) => !o && setOpenItem(null)} title={selected?.name ?? ""}>
          {selected ? detail : null}
        </Sheet>
      ) : null}
      <AddWeekSheet open={dialog === "week"} onOpenChange={(o) => setDialog(o ? "week" : null)} lists={lists} listId={list?.id ?? null} />
      <BarcodeSheet open={dialog === "barcode"} onOpenChange={(o) => setDialog(o ? "barcode" : null)} onProduct={fromBarcode} />
      <ListNameSheet
        open={dialog === "newlist" || dialog === "rename"}
        onOpenChange={(o) => !o && setDialog(null)}
        list={dialog === "rename" ? list : null}
        onSaved={(id) => { if (id) setListId(id); void refresh(); }}
      />
    </Windows>
  );
}

function ItemRow({
  item, done, selected, stockHint, onTick, onOpen, member, adder,
}: {
  item: ListItem; done: boolean; selected: boolean; stockHint?: string; onTick: () => void; onOpen: () => void;
  member?: { display_name: string; colour: string; avatar_path: string | null }; adder?: string;
}) {
  const qty = [formatQty(item.quantity), item.unit].filter(Boolean).join(" ");
  return (
    <li className={cn("flex min-h-14 items-center gap-1 rounded-2xl border bg-background pr-1 transition", selected ? "border-[var(--tile-active)]" : "border-transparent", done && "opacity-55")}>
      <button type="button" onClick={onTick} aria-label={done ? `Untick ${item.name}` : `Tick ${item.name}`} aria-pressed={done} className="grid size-14 shrink-0 place-items-center">
        <span className={cn("grid size-8 place-items-center rounded-full border-2", done ? "border-[var(--status-green)] bg-[var(--status-green)] text-white" : "border-muted-foreground/40")}>
          {done ? <Check className="size-5" /> : null}
        </span>
      </button>
      <button type="button" onClick={onOpen} className="flex min-h-14 min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-base font-medium", done && "line-through")}>
            {qty ? <span className="mr-1.5 font-semibold">{qty}</span> : null}{item.name}
          </span>
          <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            {item.note ? <span className="truncate">{item.note}</span> : null}
            {stockHint && !done ? <span className="inline-flex items-center gap-1 text-[var(--status-blue)]"><Refrigerator className="size-3" />{stockHint}</span> : null}
            {item.recipe_ids.length ? <span>For {item.recipe_ids.length} meal{item.recipe_ids.length === 1 ? "" : "s"}</span> : null}
            {adder ? <span>Added by {adder}</span> : null}
          </span>
        </span>
        {item.photo_path ? <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[11px]">Photo</span> : null}
        {member ? <MemberAvatar member={member} size="sm" className="size-7 text-[10px] ring-1 ring-offset-1" /> : null}
      </button>
    </li>
  );
}

function AddBar({ onAdd, onScan, known, existing }: { onAdd: (t: string) => void; onScan?: () => void; known: { name: string; favourite: boolean; used_count: number; last_used: string; name_key: string }[]; existing: ListItem[] }) {
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const onList = useMemo(() => new Set(existing.filter((i) => !i.done_at).map((i) => nameKey(i.name))), [existing]);
  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    const pool = known.filter((k) => !onList.has(nameKey(k.name)));
    const sorted = [...pool].sort((a, b) => Number(b.favourite) - Number(a.favourite) || b.used_count - a.used_count || b.last_used.localeCompare(a.last_used));
    return (q ? sorted.filter((k) => k.name_key.includes(q)) : sorted.filter((k) => k.favourite)).slice(0, 8);
  }, [text, known, onList]);

  function submit(t = text) {
    if (!t.trim()) return;
    onAdd(t.trim());
    setText("");
  }

  return (
    <div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
          placeholder="Add something (e.g. 2 pints of milk)"
          className="h-12 flex-1 text-base"
          aria-label="Add to the list"
          enterKeyHint="done"
        />
        {onScan ? <Button type="button" variant="outline" size="icon" className="size-12 shrink-0 rounded-full" onClick={onScan} aria-label="Scan a barcode"><ScanBarcode className="size-5" /></Button> : null}
        <Button type="submit" className="h-12 shrink-0 rounded-full px-5 text-base font-semibold" disabled={!text.trim()}><Plus className="size-5" /> Add</Button>
      </form>
      {(focus || text) && suggestions.length ? (
        <div className="scrollbar-none -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1">
          {suggestions.map((s) => (
            <button key={s.name_key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => submit(s.name)} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border border-[var(--surface-border)] bg-[var(--surface)] px-3 text-sm">
              {s.favourite ? <Star className="size-3.5 fill-current text-[var(--gold)]" /> : <Plus className="size-3.5" />}{s.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ShopHelp({ toGet, ticked }: { toGet: number; ticked: number }) {
  return (
    <div className="space-y-3 text-sm">
      <h3 className="text-base font-bold">{toGet ? `${toGet} thing${toGet === 1 ? "" : "s"} to get` : "All done"}</h3>
      {ticked ? <p className="text-muted-foreground">{ticked} ticked so far.</p> : null}
      <ul className="space-y-2 text-muted-foreground">
        <li>Tap the circle to tick something off. Everyone sees it straight away.</li>
        <li>Tap an item to change it, give it to someone, add a photo or move it to another aisle.</li>
        <li>The list remembers each item's aisle and your favourites for next time.</li>
        <li>No signal in the shop? Keep ticking — it all sends when you're back.</li>
      </ul>
    </div>
  );
}

function ListNameSheet({ open, onOpenChange, list, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; list: ShopList | null; onSaved: (id?: string) => void }) {
  const { family } = useFamilyState();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTitle(list?.title ?? ""); setEmoji(list?.emoji ?? ""); } }, [open, list]);

  async function save() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      if (list) {
        const { error } = await supabase.from("food_lists").update({ title: title.trim().slice(0, 60), emoji: emoji.trim() || null }).eq("id", list.id);
        if (error) throw error;
        onSaved();
      } else {
        const { data, error } = await supabase.from("food_lists").insert({ family_id: family.id, title: title.trim().slice(0, 60), emoji: emoji.trim() || null, position: Date.now() / 1000 }).select("id").single();
        if (error) throw error;
        onSaved(data.id as string);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={list ? "Rename this list" : "New list"}
      footer={<Button className="h-12 w-full rounded-full text-base" disabled={busy || !title.trim()} onClick={() => void save()}>{busy ? <Loader2 className="size-4 animate-spin" /> : null} Save</Button>}
    >
      <div className="space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chemist, DIY shop" className="h-12 text-base" aria-label="List name" data-autofocus />
        <div className="flex flex-wrap gap-2">
          {["🛒", "💊", "🔨", "🎉", "🐾", "👶", "🏠"].map((e) => (
            <button key={e} type="button" aria-pressed={emoji === e} onClick={() => setEmoji(emoji === e ? "" : e)} className={cn("grid size-11 place-items-center rounded-full text-xl", emoji === e ? "bg-[var(--tile-active)]" : "bg-[var(--surface)]")}>{e}</button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
