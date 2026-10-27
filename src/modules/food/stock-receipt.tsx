// Receipt scanning: read a photo of a till receipt on the phone, then the person checks what to add to stock.
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { friendlyError } from "@/lib/family";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Sheet } from "@/modules/calendar/ui";

import { refreshFood } from "./data";
import { recognise } from "./scan-text";

type Place = "fridge" | "freezer" | "cupboard";
type Line = { id: string; name: string; place: Place; keep: boolean };

const SKIP = /\b(sub-?total|total|balance|vat|change|cash|card|visa|mastercard|amex|contactless|debit|credit|tender|savings?|discount|clubcard|nectar|points|receipt|thank|store|tel|www\.|http|auth|merchant|terminal|aid|pan|copy|items?\s+sold|refund|offer|multibuy|price|date|time)\b/i;

/** Lines from a receipt that look like products, with prices and codes stripped (shortened names stay as they are) */
export function receiptLines(text: string[]): string[] {
  const out: string[] = [];
  for (const raw of text) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line.length < 3 || SKIP.test(line)) continue;
    if (/\d{1,2}[/.:-]\d{1,2}[/.:-]\d{2,4}/.test(line) || /\d{1,2}:\d{2}/.test(line)) continue;
    const name = line
      .replace(/[-£$€]?\s*\d+[.,]\d{2}\s*[A-Z*]?$/i, "") // price at the end
      .replace(/^\d+\s*[x@]\s*/i, "") // "2 x"
      .replace(/\s+\d+\s*@.*$/i, "")
      .replace(/[^A-Za-z0-9&'%.\- ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!/[a-z]{3,}/i.test(name) || name.length > 60) continue;
    out.push(name);
  }
  return [...new Set(out)].slice(0, 60);
}

/** a little help: guess the place from the name */
function guessPlace(name: string): Place {
  const n = name.toLowerCase();
  if (/frozen|froz|ice|peas|chips|fish fingers/.test(n)) return "freezer";
  if (/milk|mlk|chees|chs|yog|butter|cream|chicken|chkn|mince|beef|pork|ham|bacon|salad|lettuce|egg|juice|fish|salmon|sausage/.test(n)) return "fridge";
  return "cupboard";
}

export function ReceiptSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function read(f: File) {
    setProgress(0);
    try {
      const text = await recognise(f, (p) => setProgress(p));
      const found = receiptLines(text);
      if (!found.length) toast("Couldn't find any items. Try a flatter, brighter photo");
      setLines(found.map((name) => ({ id: crypto.randomUUID(), name, place: guessPlace(name), keep: true })));
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setProgress(null);
    }
  }

  async function save() {
    const keep = (lines ?? []).filter((l) => l.keep && l.name.trim());
    if (!keep.length) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("food_stock").insert(keep.map((l) => ({ family_id: family.id, name: l.name.trim().slice(0, 100), place: l.place })));
      if (error) throw error;
      toast.success(`${keep.length} thing${keep.length === 1 ? "" : "s"} added`);
      void refreshFood(qc, family.id);
      setLines(null);
      onOpenChange(false);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  const close = (o: boolean) => { if (!o) setLines(null); onOpenChange(o); };

  return (
    <Sheet
      open={open}
      onOpenChange={close}
      title={lines ? "Check these" : "Scan a receipt"}
      description={lines ? "Tidy the names, untick anything you don't want to keep track of, and choose where it lives." : "Receipts use shortened names (like \"SEMI SKM MLK\"), so you'll check everything before it's added. The photo is read on this phone and isn't sent anywhere."}
      wide
      footer={lines ? (
        <>
          <Button variant="outline" className="h-12 rounded-full" onClick={() => setLines(null)}>Start again</Button>
          <Button className="h-12 flex-1 rounded-full text-base" disabled={saving || !lines.some((l) => l.keep)} onClick={() => void save()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null} Add {lines.filter((l) => l.keep).length}
          </Button>
        </>
      ) : undefined}
    >
      <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void read(f); }} />
      {!lines ? (
        <div className="py-6 text-center">
          {progress !== null ? (
            <div className="space-y-3">
              <Loader2 className="mx-auto size-8 animate-spin" />
              <p className="text-sm">Reading the receipt… {Math.round(progress * 100)}%</p>
              <p className="text-xs text-muted-foreground">The first scan takes a little longer while the reader loads.</p>
            </div>
          ) : (
            <Button className="h-14 rounded-full px-6 text-base font-semibold" onClick={() => file.current?.click()}><Camera className="size-5" /> Take a photo of the receipt</Button>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {lines.map((l) => (
            <li key={l.id} className={cn("rounded-2xl border p-2", l.keep ? "border-[var(--surface-border)] bg-background" : "border-transparent bg-[var(--surface)] opacity-60")}>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={l.keep} onChange={(e) => setLines((ls) => ls!.map((x) => (x.id === l.id ? { ...x, keep: e.target.checked } : x)))} className="size-6 shrink-0" aria-label={`Keep ${l.name}`} />
                <Input value={l.name} onChange={(e) => setLines((ls) => ls!.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)))} className="h-11" aria-label="Name" />
              </div>
              <div className="mt-2 flex gap-1.5 pl-8">
                {(["fridge", "freezer", "cupboard"] as Place[]).map((p) => (
                  <button key={p} type="button" aria-pressed={l.place === p} onClick={() => setLines((ls) => ls!.map((x) => (x.id === l.id ? { ...x, place: p } : x)))} className={cn("min-h-9 rounded-full px-3 text-sm", l.place === p ? "bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "bg-[var(--surface)]")}>
                    {p === "fridge" ? "Fridge" : p === "freezer" ? "Freezer" : "Cupboard"}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
