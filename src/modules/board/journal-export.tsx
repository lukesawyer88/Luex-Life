// Year book PDF (free) and "Download everything" (originals as a .zip), both made on this device.
import { BookOpen, Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useExtra } from "@/lib/extras";
import { Button } from "@/components/ui/button";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { Chip, Field, Sheet } from "@/modules/calendar/ui";

import { ageOn, rows, useMemories, type Media, type Memory } from "./data";
import { buildYearbook, buildZip, saveBlob } from "./yearbook";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function useYearbookMaker() {
  const { family, members } = useFamilyState();
  const memories = useMemories();
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name;
  return async (year: number, onProgress?: (d: number, t: number) => void): Promise<Blob | null> => {
    const list = (memories.data ?? []).filter((m) => m.audience === "family" && m.kind !== "journal" && m.happened_on.startsWith(String(year)));
    if (!list.length) return null;
    const ids = list.map((m) => m.id);
    const media: Media[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      media.push(...(await rows<Media>(supabase.from("board_media").select("*").in("memory_id", ids.slice(i, i + 100)).is("deleted_at", null))));
    }
    return buildYearbook({
      familyName: family.name,
      year,
      memories: list,
      media,
      nameOf,
      ageOf: (m: Memory) => (m.milestone_for ? ageOn(members.find((x) => x.id === m.milestone_for)?.birthday ?? null, m.happened_on) : null),
      onProgress,
    });
  };
}

export function ExportSheet({ open, onOpenChange, start = "zip" }: { open: boolean; onOpenChange: (o: boolean) => void; start?: "zip" | "book" }) {
  const { family } = useFamilyState();
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);
  const [what, setWhat] = useState<"zip" | "book">(start);
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState<number | null>(null);
  const [withBook, setWithBook] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);
  const makeBook = useYearbookMaker();
  // the year book belongs to Journal and memories (an extra); plain downloads are always there
  const bookOn = useExtra("board.journal");
  const [seenOpen, setSeenOpen] = useState(false);
  if (open !== seenOpen) { setSeenOpen(open); if (open) setWhat(bookOn ? start : "zip"); }

  async function book() {
    setProgress("Making your year book…");
    try {
      const blob = await makeBook(year, (d, t) => setProgress(`Making your year book: ${d} of ${t}`));
      if (!blob) { toast.error(`There are no family memories from ${year} yet`); return; }
      saveBlob(blob, `${family.name} ${year} year book.pdf`);
      toast.success("Year book saved");
    } catch {
      toast.error("Couldn't make the year book. Try again");
    } finally {
      setProgress(null);
    }
  }

  async function zip() {
    setProgress("Finding your photos…");
    try {
      const from = month == null ? `${year}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const to = month == null ? `${year + 1}-01-01` : month === 11 ? `${year + 1}-01-01` : `${year}-${String(month + 2).padStart(2, "0")}-01`;
      const media = await rows<Media>(supabase.from("board_media").select("*").eq("family_id", family.id).is("deleted_at", null)
        .gte("created_at", from).lt("created_at", to).order("created_at").limit(5000));
      const extras: { name: string; blob: Blob }[] = [];
      if (bookOn && withBook && month == null) {
        const b = await makeBook(year, (d, t) => setProgress(`Making the year book: ${d} of ${t}`)).catch(() => null);
        if (b) extras.push({ name: `${family.name} ${year} year book.pdf`, blob: b });
      }
      if (!media.length && !extras.length) { toast.error("Nothing to download for that time"); return; }
      const { blob, failed } = await buildZip(media, extras, (d, t) => setProgress(`Downloading ${d} of ${t}`));
      saveBlob(blob, `${family.name} ${month == null ? year : `${MONTHS[month]} ${year}`}.zip`);
      toast.success(failed ? `Saved. ${failed} couldn't be downloaded` : "Saved");
    } catch {
      toast.error("Couldn't finish the download. Try a smaller time, such as one month");
    } finally {
      setProgress(null);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => { if (!progress) onOpenChange(o); }}
      title={what === "book" ? "Year book" : "Download everything"}
      footer={(
        <Button className="h-11 flex-1 rounded-full font-semibold" disabled={!!progress} onClick={() => void (what === "book" ? book() : zip())}>
          {progress ? <Loader2 className="size-4 animate-spin" /> : what === "book" ? <BookOpen className="size-4" /> : <Download className="size-4" />}
          {progress ?? (what === "book" ? "Make the PDF" : "Download")}
        </Button>
      )}
    >
      <div className="space-y-4">
        {bookOn ? (
          <div className="flex flex-wrap gap-2">
            <Chip on={what === "zip"} onClick={() => setWhat("zip")}><Download className="size-4" /> Download everything</Chip>
            <Chip on={what === "book"} onClick={() => setWhat("book")}><BookOpen className="size-4" /> Year book PDF</Chip>
          </div>
        ) : null}
        <Field label="Which year?">
          <div className="flex flex-wrap gap-2">{years.map((y) => <Chip key={y} on={year === y} onClick={() => setYear(y)}>{y}</Chip>)}</div>
        </Field>
        {what === "zip" ? (
          <>
            <Field label="Which month?" hint="Big families may need to do it a month or a year at a time: everything is gathered on this device first.">
              <div className="flex flex-wrap gap-2">
                <Chip on={month == null} onClick={() => setMonth(null)}>Whole year</Chip>
                {MONTHS.map((m, i) => <Chip key={m} on={month === i} onClick={() => setMonth(i)}>{m}</Chip>)}
              </div>
            </Field>
            {bookOn && month == null ? <Chip on={withBook} onClick={() => setWithBook((v) => !v)}><BookOpen className="size-4" /> Include the year book PDF</Chip> : null}
            <p className="text-sm text-muted-foreground">You get the original photos, videos and voice notes you can see, at full quality, in a folder for each month. It's free, always.</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">A page for each family memory and milestone from {year}, with photos. Free to download and print at home. Printed books are coming soon.</p>
        )}
      </div>
    </Sheet>
  );
}
