// "Scan a barcode": camera view, then the product from Open Food Facts. Typing the name always works too.
import { Loader2, ScanBarcode } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/modules/calendar/ui";

import { lookupBarcode, watchForBarcode, type Product } from "./barcode";

export function BarcodeSheet({
  open, onOpenChange, onProduct,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** product found (name may be empty when not found — the person types it) */
  onProduct: (p: Product) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "looking" | "checking" | "notfound" | "nocamera">("starting");
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let stop: (() => void) | null = null;
    let cancelled = false;
    setState("starting"); setCode(""); setTyped("");
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play().catch(() => {});
        setState("looking");
        stop = await watchForBarcode(video.current, (c) => void found(c));
      } catch {
        if (!cancelled) setState("nocamera");
      }
    })();
    async function found(c: string) {
      setCode(c);
      setState("checking");
      stream?.getTracks().forEach((t) => t.stop());
      try {
        const p = await lookupBarcode(c);
        if (p) { onProduct(p); onOpenChange(false); }
        else setState("notfound");
      } catch {
        setState("notfound");
      }
    }
    return () => {
      cancelled = true;
      stop?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onOpenChange, onProduct]);

  async function lookTyped() {
    const c = code.trim();
    if (!c) return;
    setState("checking");
    const p = await lookupBarcode(c).catch(() => null);
    if (p) { onProduct(p); onOpenChange(false); } else setState("notfound");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Scan a barcode" description="Hold the barcode inside the box. Product details come from Open Food Facts and may be missing for some shop own-brands.">
      {state !== "nocamera" && state !== "notfound" ? (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80" />
          {state === "checking" || state === "starting" ? (
            <div className="absolute inset-0 grid place-items-center bg-black/40 text-white"><Loader2 className="size-8 animate-spin" /></div>
          ) : null}
        </div>
      ) : null}
      {state === "nocamera" ? (
        <p className="rounded-2xl bg-[var(--surface)] p-4 text-sm">The camera isn't available. Type the numbers under the barcode instead.</p>
      ) : null}
      {state === "notfound" ? (
        <div className="space-y-3 rounded-2xl bg-[var(--surface)] p-4">
          <p className="text-sm font-semibold">Not found — type the name</p>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="What is it?" className="h-12 text-base" data-autofocus />
          <Button className="h-12 w-full rounded-full text-base" disabled={!typed.trim()} onClick={() => { onProduct({ code, name: typed.trim(), brand: null, quantity: null, nutrition: null }); onOpenChange(false); }}>Use this name</Button>
        </div>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Or type the barcode numbers" className="h-12" aria-label="Barcode numbers" />
        <Button variant="outline" className="h-12 rounded-full" onClick={() => void lookTyped()} disabled={code.length < 6}><ScanBarcode className="size-4" /> Look up</Button>
      </div>
    </Sheet>
  );
}
