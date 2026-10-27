// "Scan a drawing": take a photo of a child's drawing, tidy it up (brighter, crisper), save it to Drawings.
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { Chip, Field, PeoplePicker, Sheet } from "@/modules/calendar/ui";

import { refreshBoard, uploadMedia, useAlbums, type Album } from "./data";

/** The family's Drawings album, made the first time someone needs it */
export async function drawingsAlbum(familyId: string, albums: Album[]): Promise<Album> {
  const found = albums.find((a) => a.kind === "drawings");
  if (found) return found;
  const { data, error } = await supabase.from("board_albums").insert({ family_id: familyId, title: "Drawings", kind: "drawings" }).select("*").single();
  if (error) throw error;
  return data as Album;
}

/** Brighter paper, darker lines: a simple contrast stretch done on the device */
async function tidy(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const max = 3000;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const contrast = 1.35;
  const bright = 22;
  for (let i = 0; i < d.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const v = (d[i + k] - 128) * contrast + 128 + bright;
      d[i + k] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.92));
  if (!blob) throw new Error("Couldn't tidy the picture");
  return blob;
}

export function ScanDrawingSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { family, members, me, role } = useFamilyState();
  const qc = useQueryClient();
  const albums = useAlbums();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [tidyOn, setTidyOn] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [who, setWho] = useState<string[]>(role === "child" ? [me.id] : []);
  const [busy, setBusy] = useState(false);
  const children = members.filter((m) => m.role === "child");

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    let url: string | null = null;
    let cancelled = false;
    setMaking(true);
    (async () => {
      const blob = tidyOn ? await tidy(file).catch(() => file) : file;
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setPreview(url);
      setMaking(false);
    })();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [file, tidyOn]);

  function reset() { setFile(null); setTidyOn(true); setWho(role === "child" ? [me.id] : []); }

  async function save() {
    if (!file) return;
    setBusy(true);
    try {
      const album = await drawingsAlbum(family.id, albums.data ?? []);
      const blob = tidyOn ? await tidy(file) : file;
      const out = blob instanceof File ? blob : new File([blob], "drawing.jpg", { type: "image/jpeg" });
      await uploadMedia(family.id, out, { kind: "album", albumId: album.id }, { kind: "drawing", people: who });
      toast.success("Drawing saved");
      void refreshBoard(qc, family.id);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error && !("code" in e) ? e.message : friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}
      title="Scan a drawing"
      footer={file ? (
        <>
          <Button variant="outline" className="h-11 rounded-full px-4" onClick={() => input.current?.click()}>Take again</Button>
          <Button className="h-11 flex-1 rounded-full font-semibold" disabled={busy || making} onClick={() => void save()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Save drawing
          </Button>
        </>
      ) : null}
    >
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ""; }} />
      {!file ? (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <p className="max-w-xs text-sm text-muted-foreground">Lay the drawing flat in good light and fill the screen with it.</p>
          <Button className="h-14 rounded-full px-6 text-base font-semibold" onClick={() => input.current?.click()}><Camera className="size-5" /> Take a photo</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid min-h-48 place-items-center overflow-hidden rounded-2xl bg-[var(--surface)]">
            {preview && !making ? <img src={preview} alt="The drawing" className="max-h-[40dvh] w-auto object-contain" /> : <Loader2 className="size-6 animate-spin" />}
          </div>
          <Chip on={tidyOn} onClick={() => setTidyOn((v) => !v)}><Wand2 className="size-4" /> Tidy up {tidyOn ? "on" : "off"}</Chip>
          {children.length ? (
            <Field label="Who drew it?">
              <PeoplePicker members={children} value={who} onChange={setWho} />
            </Field>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}
