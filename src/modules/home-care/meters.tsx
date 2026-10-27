// Meter readings: gas, electric, water (or any meter), typed in with an optional photo, as a list to read out when the
// supplier asks. Grown-ups add them; everyone can see them.
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Gauge, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { fitJpeg } from "@/lib/image";
import { supabase } from "@/lib/supabase";
import { Chip, Empty, Field, Sheet } from "@/modules/calendar/ui";

import { errMsg, refreshHome, shortDate, todayIn, uploadPhoto, useMeters, usePhotoUrls, type Meter } from "./data";

const KINDS = [{ name: "Electric", unit: "kWh" }, { name: "Gas", unit: "m³" }, { name: "Water", unit: "m³" }];

export function MetersTab() {
  const { family, role } = useFamilyState();
  const qc = useQueryClient();
  const q = useMeters();
  const [reading, setReading] = useState<Meter | null>(null);
  const grownUp = role !== "child";
  const meters = q.data?.meters ?? [];
  const readings = q.data?.readings ?? [];
  const urls = usePhotoUrls(readings.slice(0, 30).map((r) => r.photo_path));
  const missing = KINDS.filter((k) => !meters.some((m) => m.name.toLowerCase() === k.name.toLowerCase()));

  async function addMeter(name: string, unit: string) {
    const { error } = await supabase.from("hc_meters").insert({ family_id: family.id, name, unit });
    if (error) return void toast.error(errMsg(error));
    await refreshHome(qc, family.id);
  }

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Meter readings</h2>
        {grownUp && missing.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Add a meter:</span>
            {missing.map((k) => <Button key={k.name} variant="outline" data-testid={`meter-add-${k.name}`} className="h-10 rounded-full" onClick={() => void addMeter(k.name, k.unit)}><Plus className="size-4" /> {k.name}</Button>)}
          </div>
        ) : null}
        {q.isLoading ? null : !meters.length ? (
          <Empty icon={Gauge} title="No meters yet">{grownUp ? "Add your meters, then type in a reading when the supplier asks. Everything is kept in one list." : "A grown-up can add meter readings here."}</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {meters.map((m) => {
              const list = readings.filter((r) => r.meter_id === m.id);
              return (
                <section key={m.id} className="glass-tile space-y-2 p-4" data-testid="meter">
                  <div className="flex items-center gap-2">
                    <h3 className="flex-1 text-lg font-bold">{m.name}</h3>
                    {grownUp ? <Button data-testid="reading-add" className="h-10 rounded-full" onClick={() => setReading(m)}><Plus className="size-4" /> Reading</Button> : null}
                  </div>
                  {list.length ? (
                    <ul className="divide-y divide-[var(--surface-border)]">
                      {list.slice(0, 8).map((r) => {
                        const url = r.photo_path ? urls.data?.get(r.photo_path) : null;
                        return (
                          <li key={r.id} className="flex items-center gap-2 py-1.5 text-base">
                            <span className="w-28 shrink-0 text-sm text-muted-foreground">{shortDate(r.read_on)}</span>
                            <span className="flex-1 font-mono font-semibold">{Number(r.value).toLocaleString("en-GB", { maximumFractionDigits: 3 })} {m.unit}</span>
                            {url ? <a href={url} target="_blank" rel="noreferrer" aria-label="See the photo"><Camera className="size-4" /></a> : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="text-sm text-muted-foreground">No readings yet.</p>}
                </section>
              );
            })}
          </div>
        )}
      </RecordsWindow>
      <Sheet open={!!reading} onOpenChange={(o) => !o && setReading(null)} title={reading ? `${reading.name} reading` : ""}>
        {reading ? <ReadingForm meter={reading} onClose={() => setReading(null)} /> : null}
      </Sheet>
    </Windows>
  );
}

function ReadingForm({ meter, onClose }: { meter: Meter; onClose: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const today = todayIn(family.timezone);
  const [value, setValue] = useState("");
  const [on, setOn] = useState(today);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const v = Number(value.replace(/[,\s]/g, ""));
    if (!value.trim() || !Number.isFinite(v) || v < 0) return void toast.error("Type the number on the meter");
    setBusy(true);
    try {
      const path = photo ? await uploadPhoto(family.id, await fitJpeg(photo, 1600)) : null;
      const { error } = await supabase.from("hc_readings").insert({ meter_id: meter.id, family_id: family.id, value: v, read_on: on, photo_path: path });
      if (error) throw error;
      await refreshHome(qc, family.id);
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label={`The number on the meter${meter.unit ? ` (${meter.unit})` : ""}`}>
        <Input data-testid="reading-value" data-autofocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="12345" className="h-14 font-mono text-2xl" />
      </Field>
      <Field label="Read on"><Input type="date" max={today} value={on} onChange={(e) => setOn(e.target.value)} className="h-12 w-48 text-base" /></Field>
      <Field label="Photo of the meter" hint="Optional">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-full border border-[var(--surface-border)] bg-[var(--surface)] px-4 font-semibold hover:bg-muted">
            <Camera className="size-5" /> {photo ? "Change photo" : "Take a photo"}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhoto(f); e.target.value = ""; }} />
          </label>
          {photo ? <Chip on onClick={() => setPhoto(null)}>Photo added ✕</Chip> : null}
        </div>
      </Field>
      <div className="flex gap-2 pt-1">
        <Button data-testid="reading-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
