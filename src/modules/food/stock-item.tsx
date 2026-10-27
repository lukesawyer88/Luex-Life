// Adding or changing one thing in the fridge, freezer or cupboard.
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ScanBarcode } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useExtra } from "@/lib/extras";
import { useFamilyState } from "@/lib/family-context";
import { friendlyError } from "@/lib/family";
import { supabase } from "@/lib/supabase";
import { Chip, Sheet } from "@/modules/calendar/ui";

import type { Product } from "./barcode";
import { refreshFood, type Nutrition, type StockItem } from "./data";
import { BarcodeSheet } from "./shop-barcode";

type Place = StockItem["place"];
const PLACES: { key: Place; label: string }[] = [
  { key: "fridge", label: "Fridge" }, { key: "freezer", label: "Freezer" }, { key: "cupboard", label: "Cupboard" },
];

export function StockItemSheet({
  open, onOpenChange, item, place: startPlace, simple,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; item: StockItem | null; place?: Place;
  /** just the freezer list: name and how many */
  simple?: boolean;
}) {
  const showScan = useExtra("food.scan");
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [place, setPlace] = useState<Place>("fridge");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [portions, setPortions] = useState("");
  const [useBy, setUseBy] = useState("");
  const [lowAt, setLowAt] = useState("");
  const [barcode, setBarcode] = useState<string | null>(null);
  const [nutrition, setNutrition] = useState<Nutrition | null>(null);
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? ""); setPlace(item?.place ?? startPlace ?? "fridge");
    setQty(item?.quantity != null ? String(item.quantity) : ""); setUnit(item?.unit ?? "");
    setPortions(item?.portions != null ? String(item.portions) : ""); setUseBy(item?.use_by ?? "");
    setLowAt(item?.low_at != null ? String(item.low_at) : ""); setBarcode(item?.barcode ?? null); setNutrition(item?.nutrition ?? null);
  }, [open, item, startPlace]);

  const num = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : null);

  function fromProduct(p: Product) {
    setName(p.brand && p.name && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? `${p.brand} ${p.name}` : p.name);
    setBarcode(p.code || null);
    setNutrition(p.nutrition);
  }

  async function save() {
    const q = num(qty); const pr = num(portions); const lo = num(lowAt);
    if ([q, pr, lo].some((v) => v !== null && (!Number.isFinite(v) || v < 0))) { toast.error("Use numbers for amounts"); return; }
    if (!name.trim()) { toast.error("Type what it is"); return; }
    setBusy(true);
    try {
      const row = {
        name: name.trim().slice(0, 100), place, quantity: q, unit: unit.trim() || null,
        portions: pr !== null ? Math.round(pr) : null, use_by: useBy || null, low_at: lo, nutrition,
      };
      const { error } = item
        ? await supabase.from("food_stock").update(row).eq("id", item.id)
        : await supabase.from("food_stock").insert({ ...row, family_id: family.id, barcode });
      if (error) throw error;
      void refreshFood(qc, family.id);
      onOpenChange(false);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={item ? `Change ${item.name}` : simple ? "Add to the freezer" : "Add to the fridge, freezer or cupboard"}
        footer={<Button className="h-12 w-full rounded-full text-base font-semibold" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? <Loader2 className="size-4 animate-spin" /> : null} Save</Button>}
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="What is it?" className="h-12 flex-1 text-base" aria-label="What is it" data-autofocus={!item ? true : undefined} />
            {!item && showScan ? <Button variant="outline" size="icon" className="size-12 rounded-full" onClick={() => setScan(true)} aria-label="Scan a barcode"><ScanBarcode className="size-5" /></Button> : null}
          </div>
          {!simple ? (
            <div className="flex flex-wrap gap-2">
              {PLACES.map((p) => <Chip key={p.key} on={place === p.key} onClick={() => setPlace(p.key)}>{p.label}</Chip>)}
            </div>
          ) : null}
          {!simple ? (
            <label className="block text-sm font-semibold">Use by
              <Input type="date" value={useBy} onChange={(e) => setUseBy(e.target.value)} className="mt-1 h-12" />
            </label>
          ) : null}
          {place === "freezer" ? (
            <label className="block text-sm font-semibold">{simple ? "How many" : "Portions"}
              <Input value={portions} onChange={(e) => setPortions(e.target.value)} inputMode="numeric" placeholder="e.g. 3" className="mt-1 h-12" />
            </label>
          ) : null}
          {!simple ? <div className="flex gap-2">
            <label className="block flex-1 text-sm font-semibold">How much
              <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="e.g. 2" className="mt-1 h-12" />
            </label>
            <label className="block flex-1 text-sm font-semibold">Unit
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pints, g, packs" className="mt-1 h-12" />
            </label>
          </div> : null}
          {!simple ? (
            <label className="block text-sm font-semibold">Running low at (optional)
              <Input value={lowAt} onChange={(e) => setLowAt(e.target.value)} inputMode="decimal" placeholder="e.g. 1 — we'll offer to add it to the list" className="mt-1 h-12" />
            </label>
          ) : null}
          {nutrition ? (
            <p className="rounded-xl bg-[var(--surface)] p-3 text-xs text-muted-foreground">
              Per 100 g (estimate from Open Food Facts): {nutrition.kcal ?? "?"} kcal · protein {nutrition.protein ?? "?"} g · carbs {nutrition.carbs ?? "?"} g · fat {nutrition.fat ?? "?"} g
            </p>
          ) : null}
        </div>
      </Sheet>
      <BarcodeSheet open={scan} onOpenChange={setScan} onProduct={fromProduct} />
    </>
  );
}
