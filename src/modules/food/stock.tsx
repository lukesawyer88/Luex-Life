// The fridge, freezer and cupboard (light: things to use soon and what's in the freezer, not every tin).
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Minus, Pencil, Plus, Receipt, ShoppingCart, Snowflake } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { useFamilyState } from "@/lib/family-context";
import { friendlyError } from "@/lib/family";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

import { addDaysKey, refreshFood, todayIn, useShopping, useStock, type StockItem } from "./data";
import type { FoodTarget } from "./food-page";
import { formatQty } from "./ingredients";
import { StockItemSheet } from "./stock-item";
import { ReceiptSheet } from "./stock-receipt";

type Place = StockItem["place"];
const SECTIONS: { key: Place; label: string }[] = [
  { key: "fridge", label: "Fridge" }, { key: "freezer", label: "Freezer" }, { key: "cupboard", label: "Cupboard" },
];

function useByText(useBy: string | null, today: string): { text: string; tone: "red" | "amber" | "plain" } | null {
  if (!useBy) return null;
  if (useBy < today) return { text: "Past its use-by", tone: "red" };
  if (useBy === today) return { text: "Use today", tone: "red" };
  if (useBy === addDaysKey(today, 1)) return { text: "Use by tomorrow", tone: "amber" };
  if (useBy <= addDaysKey(today, 2)) return { text: "Use in 2 days", tone: "amber" };
  const d = new Date(useBy + "T12:00:00Z");
  return { text: `Use by ${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`, tone: "plain" };
}

export function StockTab(_: { target: FoodTarget; onGo: (t: FoodTarget) => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const stock = useStock();
  const shop = useShopping();
  const today = todayIn(family.timezone);
  const [edit, setEdit] = useState<{ open: boolean; item: StockItem | null; place?: Place }>({ open: false, item: null });
  const [receipt, setReceipt] = useState(false);
  const items = stock.data ?? [];
  const soon = useMemo(() => items.filter((s) => s.use_by && s.use_by <= addDaysKey(today, 2)).sort((a, b) => (a.use_by ?? "").localeCompare(b.use_by ?? "")), [items, today]);
  const refresh = () => refreshFood(qc, family.id);

  async function addToList(s: StockItem) {
    const list = shop.data?.lists[0];
    if (!list) { toast("Open the shopping list once to set it up"); return; }
    const { error } = await supabase.from("food_list_items").insert({ list_id: list.id, family_id: family.id, name: s.name, unit: s.unit, position: Date.now() / 1000 });
    if (error) toast.error(friendlyError(error)); else { toast.success(`${s.name} added to ${list.title}`); void refresh(); }
  }

  async function useOne(s: StockItem) {
    const patch: { portions?: number; quantity?: number } = {};
    if (s.place === "freezer" && s.portions != null && s.portions > 0) patch.portions = s.portions - 1;
    else if (s.quantity != null && s.quantity > 0) patch.quantity = Math.max(0, Number(s.quantity) - 1);
    else { void usedUp(s); return; }
    const empty = (patch.portions === 0) || (patch.quantity === 0 && s.portions == null);
    const { error } = await supabase.from("food_stock").update(empty ? { ...patch, used_up_at: new Date().toISOString() } : patch).eq("id", s.id);
    if (error) { toast.error(friendlyError(error)); return; }
    void refresh();
    const left = patch.quantity ?? null;
    if (empty) {
      toast(`${s.name} used up`, { action: { label: "Add to shopping list", onClick: () => void addToList(s) } });
    } else if (s.low_at != null && left != null && left <= Number(s.low_at)) {
      toast(`Running low on ${s.name}`, { action: { label: "Add to shopping list", onClick: () => void addToList(s) }, duration: 8000 });
    }
  }

  async function usedUp(s: StockItem) {
    const { error } = await supabase.from("food_stock").update({ used_up_at: new Date().toISOString() }).eq("id", s.id);
    if (error) { toast.error(friendlyError(error)); return; }
    void refresh();
    toast(`${s.name} used up`, {
      duration: 8000,
      action: { label: "Undo", onClick: () => void supabase.from("food_stock").update({ used_up_at: null }).eq("id", s.id).then(() => refresh()) },
    });
  }

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Fridge, freezer and cupboard</h2>
          <Button variant="outline" className="h-11 rounded-full" onClick={() => setReceipt(true)}><Receipt className="size-4" /> Scan a receipt</Button>
          <Button className="h-11 rounded-full px-4 font-semibold" onClick={() => setEdit({ open: true, item: null })}><Plus className="size-4" /> Add</Button>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
          {soon.length ? (
            <section className="mb-4 rounded-2xl bg-[var(--status-amber-soft)] p-3">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--status-amber)]"><AlertTriangle className="size-4" /> Use soon</h3>
              <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1">
                {soon.map((s) => {
                  const u = useByText(s.use_by, today);
                  return (
                    <button key={s.id} type="button" onClick={() => setEdit({ open: true, item: s })} className="min-h-12 shrink-0 rounded-xl bg-background px-3 py-1.5 text-left">
                      <span className="block text-sm font-semibold">{s.name}</span>
                      <span className={cn("text-xs", u?.tone === "red" ? "text-[var(--status-red)]" : "text-[var(--status-amber)]")}>{u?.text}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {!stock.isLoading && !items.length ? (
            <div className="py-10 text-center">
              <p className="font-semibold">Nothing tracked yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Add the things you want reminding about — fresh food with a use-by date and what's in the freezer. You don't need to add every tin.</p>
            </div>
          ) : null}

          {SECTIONS.map((sec) => {
            const list = items.filter((s) => s.place === sec.key);
            if (!list.length) return null;
            return (
              <section key={sec.key} className="mb-4">
                <div className="mb-1 flex items-center gap-2 px-1">
                  <h3 className="flex-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{sec.label}</h3>
                  <button type="button" className="text-xs font-semibold text-[var(--status-blue)]" onClick={() => setEdit({ open: true, item: null, place: sec.key })}>Add to {sec.label.toLowerCase()}</button>
                </div>
                <ul className="space-y-1.5">
                  {list.map((s) => <StockRow key={s.id} s={s} today={today} onUse={() => void useOne(s)} onUsedUp={() => void usedUp(s)} onEdit={() => setEdit({ open: true, item: s })} onList={() => void addToList(s)} />)}
                </ul>
              </section>
            );
          })}
        </div>
      </RecordsWindow>
      <DetailWindow>
        <div className="space-y-3 text-sm">
          <h3 className="text-base font-bold">Keeping it light</h3>
          <p className="text-muted-foreground">Track what matters: fresh things with a use-by date and what's in the freezer. Grown-ups get a "use soon" notification in the morning.</p>
          <p className="text-muted-foreground">Tap <strong>Use one</strong> as you go. When something runs low or is used up, you can add it to the shopping list in one tap.</p>
          <p className="text-muted-foreground">Scanning a barcode fills in the name. Receipts use shortened names, so you'll always check them first.</p>
          {soon.length ? <p className="font-semibold">{soon.length} thing{soon.length === 1 ? "" : "s"} to use soon.</p> : null}
        </div>
      </DetailWindow>
      <StockItemSheet open={edit.open} onOpenChange={(o) => setEdit((e) => ({ ...e, open: o }))} item={edit.item} place={edit.place} />
      <ReceiptSheet open={receipt} onOpenChange={setReceipt} />
    </Windows>
  );
}

function StockRow({ s, today, onUse, onUsedUp, onEdit, onList }: { s: StockItem; today: string; onUse: () => void; onUsedUp: () => void; onEdit: () => void; onList: () => void }) {
  const u = useByText(s.use_by, today);
  const amount = s.place === "freezer" && s.portions != null
    ? `${s.portions} portion${s.portions === 1 ? "" : "s"}`
    : [formatQty(s.quantity != null ? Number(s.quantity) : null), s.unit].filter(Boolean).join(" ");
  const low = s.low_at != null && s.quantity != null && Number(s.quantity) <= Number(s.low_at);
  return (
    <li className="flex min-h-14 flex-wrap items-center gap-2 rounded-2xl bg-background px-3 py-2">
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1.5 font-medium">{s.place === "freezer" ? <Snowflake className="size-3.5 text-[var(--status-blue)]" /> : null}{s.name}</span>
        <span className="flex flex-wrap gap-x-2 text-xs">
          {amount ? <span className="text-muted-foreground">{amount}</span> : null}
          {u ? <span className={cn(u.tone === "red" ? "text-[var(--status-red)]" : u.tone === "amber" ? "text-[var(--status-amber)]" : "text-muted-foreground")}>{u.text}</span> : null}
          {low ? <span className="text-[var(--status-amber)]">Running low</span> : null}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {low ? <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={onList} aria-label={`Add ${s.name} to the shopping list`}><ShoppingCart className="size-4" /></Button> : null}
        <Button variant="outline" className="h-10 rounded-full px-3" onClick={onUse}><Minus className="size-4" /> Use one</Button>
        <Button variant="ghost" className="h-10 rounded-full px-3" onClick={onUsedUp}>Used up</Button>
        <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={onEdit} aria-label={`Change ${s.name}`}><Pencil className="size-4" /></Button>
      </div>
    </li>
  );
}
