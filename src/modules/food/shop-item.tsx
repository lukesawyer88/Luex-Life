// One shopping item: change it, give it to someone, add a photo, move it, remove it.
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Camera, Loader2, Star, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { friendlyError } from "@/lib/family";
import { fitJpeg } from "@/lib/image";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, PeoplePicker } from "@/modules/calendar/ui";

import { nameKey } from "./ingredients";
import { refreshFood, uploadFoodPhoto, useFoodUrls, type Aisle, type KnownItem, type ListItem } from "./data";

export function canEditItem(item: ListItem, meId: string, isAdult: boolean) {
  return isAdult || item.added_by === meId;
}

/** the detail of one item (side window on desktop, sheet on phones) */
export function ItemDetail({
  item, aisles, known, onMove, onRemove, onClose,
}: {
  item: ListItem;
  aisles: Aisle[];
  known: KnownItem[];
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onClose?: () => void;
}) {
  const { family, me, members, role } = useFamilyState();
  const qc = useQueryClient();
  const adult = role !== "child";
  const editable = canEditItem(item, me.id, adult);
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(item.quantity != null ? String(item.quantity) : "");
  const [unit, setUnit] = useState(item.unit ?? "");
  const [note, setNote] = useState(item.note);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const photo = useFoodUrls([item.photo_path]).data?.get(item.photo_path ?? "");
  const k = known.find((x) => x.name_key === nameKey(item.name) || x.name_key === item.name.toLowerCase().trim());
  const who = members.find((m) => m.id === item.added_by);
  const ticker = members.find((m) => m.id === item.done_by);

  useEffect(() => {
    setName(item.name); setQty(item.quantity != null ? String(item.quantity) : ""); setUnit(item.unit ?? ""); setNote(item.note);
  }, [item.id, item.name, item.quantity, item.unit, item.note]);

  async function save(patch: Partial<Pick<ListItem, "name" | "quantity" | "unit" | "note" | "aisle" | "assignee" | "photo_path">>) {
    setBusy(true);
    try {
      const { error } = await supabase.from("food_list_items").update(patch).eq("id", item.id);
      if (error) throw error;
      void refreshFood(qc, family.id);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  function saveText() {
    const q = qty.trim() ? Number(qty.replace(",", ".")) : null;
    if (q !== null && (!Number.isFinite(q) || q <= 0)) { toast.error("Type a number for how many"); return; }
    if (!name.trim()) { toast.error("Type what it is"); return; }
    if (name.trim() === item.name && q === (item.quantity ?? null) && (unit.trim() || null) === (item.unit ?? null) && note === item.note) return;
    void save({ name: name.trim().slice(0, 100), quantity: q, unit: unit.trim() || null, note: note.slice(0, 200) });
  }

  async function addPhoto(f: File) {
    setBusy(true);
    try {
      const path = await uploadFoodPhoto(family.id, await fitJpeg(f, 1200), "items");
      await save({ photo_path: path });
    } catch (e) {
      toast.error(friendlyError(e));
      setBusy(false);
    }
  }

  async function toggleFavourite() {
    if (!k) return;
    const { error } = await supabase.from("food_known_items").update({ favourite: !k.favourite }).eq("id", k.id);
    if (error) toast.error(friendlyError(error)); else void refreshFood(qc, family.id);
  }

  return (
    <div className="space-y-4">
      {photo ? <img src={photo} alt="" className="max-h-56 w-full rounded-2xl object-cover" /> : null}
      {editable ? (
        <div className="space-y-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveText} className="h-12 text-base font-semibold" aria-label="What it is" />
          <div className="flex gap-2">
            <Input value={qty} onChange={(e) => setQty(e.target.value)} onBlur={saveText} inputMode="decimal" placeholder="How many" className="h-12 w-28" aria-label="How many" />
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} onBlur={saveText} placeholder="Unit (g, pack…)" className="h-12 flex-1" aria-label="Unit" />
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveText} placeholder="Note (brand, size…)" className="h-12" aria-label="Note" />
        </div>
      ) : (
        <div>
          <p className="text-lg font-semibold">{item.name}</p>
          {item.note ? <p className="text-sm text-muted-foreground">{item.note}</p> : null}
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {who ? <><MemberAvatar member={who} size="sm" className="size-5 text-[9px] ring-0 ring-offset-0" /> Added by {who.id === me.id ? "you" : who.display_name}</> : "Added"}
        {ticker && item.done_at ? <> · ticked by {ticker.id === me.id ? "you" : ticker.display_name}</> : null}
      </p>

      <div>
        <p className="mb-1.5 text-sm font-semibold">Aisle</p>
        <div className="flex flex-wrap gap-1.5">
          {aisles.map((a) => (
            <Chip key={a.id} on={item.aisle === a.name} onClick={() => void save({ aisle: a.name })} disabled={busy}>{a.name}</Chip>
          ))}
          {!aisles.length ? <p className="text-sm text-muted-foreground">Set up aisles in Food settings to sort your list.</p> : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">The list remembers where you put it for next time.</p>
      </div>

      {editable ? (
        <div>
          <p className="mb-1.5 text-sm font-semibold">Who's getting it?</p>
          <PeoplePicker members={members} value={item.assignee ? [item.assignee] : []} onChange={(ids) => void save({ assignee: ids[0] ?? null })} single />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {editable ? (
          <>
            <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void addPhoto(f); }} />
            <Button variant="outline" className="h-11 rounded-full" onClick={() => file.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} {item.photo_path ? "Change photo" : "Add a photo"}
            </Button>
          </>
        ) : null}
        {k ? (
          <Button variant="outline" className="h-11 rounded-full" onClick={() => void toggleFavourite()}>
            <Star className={cn("size-4", k.favourite && "fill-current text-[var(--gold)]")} /> {k.favourite ? "Favourite" : "Make a favourite"}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button variant="ghost" className="h-11 rounded-full" onClick={() => onMove(-1)} aria-label="Move up"><ArrowUp className="size-4" /> Up</Button>
        <Button variant="ghost" className="h-11 rounded-full" onClick={() => onMove(1)} aria-label="Move down"><ArrowDown className="size-4" /> Down</Button>
        {editable ? (
          <Button variant="ghost" className="ml-auto h-11 rounded-full text-[var(--status-red)]" onClick={onRemove}><Trash2 className="size-4" /> Remove</Button>
        ) : null}
        {onClose ? <Button className="h-11 w-full rounded-full" onClick={onClose}>Done</Button> : null}
      </div>
    </div>
  );
}
