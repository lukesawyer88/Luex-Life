// Small sheets for Clubs and people: add or change a school or babysitter, and book a babysitter.
import { useQueryClient } from "@tanstack/react-query";
import { Archive } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { insertEvent } from "@/modules/calendar/data";
import { atTime } from "@/modules/calendar/time";
import { Field, Sheet } from "@/modules/calendar/ui";

import { errMsg, refreshSchool, todayIn, type Place } from "./data";

export function PlaceSheet({ value, onClose }: { value: { kind: Place["kind"]; place: Place | null } | null; onClose: () => void }) {
  const open = value !== null;
  const title = value?.place ? `Change ${value.place.name}` : value?.kind === "childcare" ? "Add a babysitter or childminder" : "Add a school";
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={title}>
      {value ? <PlaceForm key={value.place?.id ?? value.kind} kind={value.kind} place={value.place} onClose={onClose} /> : null}
    </Sheet>
  );
}

function PlaceForm({ kind, place, onClose }: { kind: Place["kind"]; place: Place | null; onClose: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [name, setName] = useState(place?.name ?? "");
  const [phone, setPhone] = useState(place?.phone ?? "");
  const [notes, setNotes] = useState(place?.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const row = { name: name.trim(), phone: phone.trim() || null, notes: notes.trim() };
    const { error } = place
      ? await supabase.from("school_places").update(row).eq("id", place.id)
      : await supabase.from("school_places").insert({ ...row, kind, family_id: family.id });
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    await refreshSchool(qc, family.id);
    toast.success("Saved");
    onClose();
  }

  async function putAway() {
    if (!place) return;
    const { error } = await supabase.from("school_places").update({ archived_at: new Date().toISOString() }).eq("id", place.id);
    if (error) return void toast.error(errMsg(error));
    await refreshSchool(qc, family.id);
    onClose();
    toast(`${place.name} put away`, { action: { label: "Undo", onClick: async () => { await supabase.from("school_places").update({ archived_at: null }).eq("id", place.id); await refreshSchool(qc, family.id); } } });
  }

  return (
    <div className="space-y-4">
      <Field label="Name">
        <Input data-testid="place-name" data-autofocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)}
          placeholder={kind === "childcare" ? "Sarah (babysitter)" : "Oak Primary"} className="h-12 text-base" />
      </Field>
      <Field label="Phone" hint="Optional">
        <Input data-testid="place-phone" type="tel" inputMode="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} className="h-12 text-base" />
      </Field>
      <Field label="Notes" hint="Optional">
        <Input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder={kind === "childcare" ? "£10 an hour, needs a lift home" : "Office opens 8.15"} className="h-12 text-base" />
      </Field>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-testid="place-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
        {place ? <Button variant="ghost" className="h-12 rounded-full" onClick={() => void putAway()}><Archive className="size-4" /> Put away</Button> : null}
      </div>
    </div>
  );
}

/** Book a babysitter: a one-off Calendar event */
export function BookSheet({ place, onClose }: { place: Place | null; onClose: () => void }) {
  return (
    <Sheet open={!!place} onOpenChange={(o) => !o && onClose()} title={place ? `Book ${place.name}` : ""}>
      {place ? <BookForm key={place.id} place={place} onClose={onClose} /> : null}
    </Sheet>
  );
}

function BookForm({ place, onClose }: { place: Place; onClose: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [day, setDay] = useState(todayIn(family.timezone));
  const [from, setFrom] = useState("19:00");
  const [to, setTo] = useState("23:00");
  const [busy, setBusy] = useState(false);

  async function save() {
    const start = atTime(day, from, family.timezone);
    let end = atTime(day, to, family.timezone);
    if (end <= start) end = new Date(end.getTime() + 24 * 3600_000); // past midnight
    setBusy(true);
    try {
      await insertEvent({
        family_id: family.id, title: `${place.name} babysitting`, type: "other",
        starts_at: start.toISOString(), ends_at: end.toISOString(), notes: place.phone ? `Phone: ${place.phone}` : null,
      });
      await refreshSchool(qc, family.id);
      toast.success("On the calendar");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Which day"><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-12 w-48 text-base" /></Field>
      <div className="flex flex-wrap gap-3">
        <Field label="From"><Input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className="h-12 w-32 text-base" /></Field>
        <Field label="Until"><Input type="time" value={to} onChange={(e) => setTo(e.target.value)} className="h-12 w-32 text-base" /></Field>
      </div>
      <div className="flex gap-2 pt-1">
        <Button data-testid="sitter-book-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !day || !from || !to} onClick={() => void save()}>{busy ? "Saving…" : "Put it on the calendar"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
