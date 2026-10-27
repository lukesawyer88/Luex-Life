// Everyone's emergency card (and the pets'): allergies, medicines, conditions, blood group, GP or vet.
import { useQueryClient } from "@tanstack/react-query";
import { EyeOff, PawPrint, Phone, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { Chip, Field, Sheet } from "@/modules/calendar/ui";

import { BLOOD, canEditCard, errMsg, refreshEm, telHref, useCards, type Card, type Conditions } from "./data";

/** a person (member) or a pet (card only) */
type Who = { key: string; member: Member | null; card: Card | null; cond: Conditions | null };

export function CardsTab() {
  const { me, members, isParent } = useFamilyState();
  const q = useCards();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [edit, setEdit] = useState<Who | "pet" | null>(null);
  const cards = q.data?.cards ?? [];
  const conds = q.data?.conditions ?? [];
  const condOf = (c: Card | null | undefined) => (c ? conds.find((x) => x.card_id === c.id) ?? null : null);
  const list: Who[] = [
    ...members.filter((m) => !m.archived_at).map((m) => { const card = cards.find((c) => c.member_id === m.id) ?? null; return { key: m.id, member: m, card, cond: condOf(card) }; }),
    ...cards.filter((c) => !c.member_id).sort((a, b) => (a.pet_name ?? "").localeCompare(b.pet_name ?? "")).map((c) => ({ key: c.id, member: null, card: c, cond: null })),
  ];
  const open = list.find((w) => w.key === openKey) ?? null;
  const canEdit = (w: Who) => canEditCard(me, isParent, w.member);

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Everyone's emergency card</h2>
          {isParent ? <Button variant="outline" data-testid="pet-add" className="h-11 rounded-full" onClick={() => setEdit("pet")}><Plus className="size-5" /> Pet</Button> : null}
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {list.map((w) => {
            const filled = !!w.card && !!(w.card.allergies || w.card.medicines || w.card.blood_group || w.card.doctor || w.cond?.conditions || w.card.microchip);
            return (
              <li key={w.key}>
                <button type="button" data-testid="card-row" onClick={() => setOpenKey(w.key)}
                  className={cn("glass-tile flex min-h-16 w-full items-center gap-3 p-3 text-left", openKey === w.key && "ring-2 ring-[var(--status-blue)]")}>
                  {w.member ? <MemberAvatar member={w.member} className="ring-0 ring-offset-0" />
                    : <span className="grid size-10 place-items-center rounded-full bg-[var(--surface)]"><PawPrint className="size-5" /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{w.member ? (w.member.id === me.id ? `${w.member.display_name} (me)` : w.member.display_name) : w.card?.pet_name}</span>
                    <span className={cn("block truncate text-sm", w.card?.allergies ? "font-semibold text-[var(--status-red)]" : "text-muted-foreground")}>
                      {w.card?.allergies ? `Allergic to ${w.card.allergies}` : filled ? "Filled in" : canEdit(w) ? "Tap to fill in" : "Not filled in yet"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-muted-foreground">Each grown-up looks after their own card. Parents look after the children's and pets'.</p>
      </RecordsWindow>
      <DetailWindow>
        {open ? <CardDetail w={open} canEdit={canEdit(open)} onEdit={() => setEdit(open)} />
          : <p className="text-sm text-muted-foreground">Tap someone to see their card.</p>}
      </DetailWindow>
      <CardViewSheet w={open} canEdit={!!open && canEdit(open)} onEdit={() => open && setEdit(open)} onClose={() => setOpenKey(null)} />
      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} title={edit === "pet" ? "Add a pet" : edit?.member ? `${edit.member.display_name}'s card` : `${edit?.card?.pet_name ?? ""}'s card`}>
        {edit !== null ? <CardForm key={edit === "pet" ? "pet" : edit.key} w={edit === "pet" ? null : edit} onClose={() => setEdit(null)} onSaved={(k) => setOpenKey(k)} /> : null}
      </Sheet>
    </Windows>
  );
}

function CardDetail({ w, canEdit, onEdit }: { w: Who; canEdit: boolean; onEdit: () => void }) {
  const c = w.card;
  const pet = !w.member;
  const line = (label: string, v: string | null | undefined, strong?: boolean) => (v ? (
    <div className="py-1.5"><div className="text-xs text-muted-foreground">{label}</div><div className={cn("whitespace-pre-line text-base", strong && "font-semibold text-[var(--status-red)]")}>{v}</div></div>
  ) : null);
  return (
    <div className="space-y-2" data-testid="card-detail">
      <h3 className="text-xl font-bold">{w.member?.display_name ?? c?.pet_name}</h3>
      {c ? (
        <div className="divide-y divide-[var(--surface-border)]">
          {line("Allergic to", c.allergies, true)}
          {line("Medicines", c.medicines)}
          {w.cond?.conditions ? (
            <div className="py-1.5"><div className="flex items-center gap-1 text-xs text-muted-foreground">Medical conditions {!w.cond.shared ? <><EyeOff className="size-3" /> only you can see this</> : null}</div><div className="whitespace-pre-line text-base">{w.cond.conditions}</div></div>
          ) : null}
          {line("Blood group", c.blood_group)}
          {c.doctor || c.doctor_phone ? (
            <div className="flex items-center gap-2 py-1.5">
              <div className="min-w-0 flex-1"><div className="text-xs text-muted-foreground">{pet ? "Vet" : "GP"}</div><div className="text-base">{c.doctor}</div></div>
              {c.doctor_phone ? <a href={telHref(c.doctor_phone)} className="flex h-11 items-center gap-1.5 rounded-full bg-[var(--surface)] px-3 font-semibold"><Phone className="size-4" /> {c.doctor_phone}</a> : null}
            </div>
          ) : null}
          {line("Microchip", c.microchip)}
          {line("Insurer", c.insurer)}
          {line("Notes", c.notes)}
        </div>
      ) : <p className="text-base text-muted-foreground">Nothing filled in yet.</p>}
      {canEdit ? <Button data-testid="card-change" className="h-12 w-full rounded-full text-base font-semibold" onClick={onEdit}>{c ? "Change" : "Fill in"}</Button> : null}
    </div>
  );
}

function CardViewSheet({ w, canEdit, onEdit, onClose }: { w: Who | null; canEdit: boolean; onEdit: () => void; onClose: () => void }) {
  const wide = useDesktop();
  if (wide) return null;
  return (
    <Sheet open={!!w} onOpenChange={(o) => !o && onClose()} title={w?.member?.display_name ?? w?.card?.pet_name ?? ""}>
      {w ? <CardDetail w={w} canEdit={canEdit} onEdit={() => { onClose(); onEdit(); }} /> : null}
    </Sheet>
  );
}

function CardForm({ w, onClose, onSaved }: { w: Who | null; onClose: () => void; onSaved: (key: string) => void }) {
  const { family, me } = useFamilyState();
  const qc = useQueryClient();
  const pet = !w?.member;
  const c = w?.card ?? null;
  const [petName, setPetName] = useState(c?.pet_name ?? "");
  const [allergies, setAllergies] = useState(c?.allergies ?? "");
  const [medicines, setMedicines] = useState(c?.medicines ?? "");
  const [conditions, setConditions] = useState(w?.cond?.conditions ?? "");
  const [shared, setShared] = useState(w?.cond?.shared ?? true);
  const [blood, setBlood] = useState<string | null>(c?.blood_group ?? null);
  const [doctor, setDoctor] = useState(c?.doctor ?? "");
  const [doctorPhone, setDoctorPhone] = useState(c?.doctor_phone ?? "");
  const [microchip, setMicrochip] = useState(c?.microchip ?? "");
  const [insurer, setInsurer] = useState(c?.insurer ?? "");
  const [notes, setNotes] = useState(c?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const grownUpOwn = w?.member?.id === me.id;

  async function save() {
    if (pet && !petName.trim()) return void toast.error("Type the pet's name");
    setBusy(true);
    try {
      const row = {
        allergies: allergies.trim(), medicines: medicines.trim(), blood_group: pet ? null : blood, doctor: doctor.trim() || null,
        doctor_phone: doctorPhone.trim() || null, microchip: pet ? microchip.trim() || null : null, insurer: pet ? insurer.trim() || null : null,
        notes: notes.trim(), ...(pet ? { pet_name: petName.trim() } : {}),
      };
      let id = c?.id;
      if (c) {
        const { error } = await supabase.from("em_cards").update(row).eq("id", c.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("em_cards").insert({ ...row, family_id: family.id, member_id: w?.member?.id ?? null }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      if (!pet && id) {
        const { error } = w?.cond
          ? await supabase.from("em_conditions").update({ conditions: conditions.trim(), shared }).eq("card_id", id)
          : await supabase.from("em_conditions").insert({ card_id: id, family_id: family.id, conditions: conditions.trim(), shared });
        if (error) throw error;
      }
      await refreshEm(qc, family.id);
      toast.success("Saved");
      onClose();
      onSaved(w?.key ?? id!);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function removePet() {
    if (!c || !window.confirm(`Remove ${c.pet_name}?`)) return;
    const { error } = await supabase.from("em_cards").update({ deleted_at: new Date().toISOString() }).eq("id", c.id);
    if (error) return void toast.error(errMsg(error));
    await refreshEm(qc, family.id);
    onClose();
  }

  const area = (v: string, set: (s: string) => void, max: number, id: string, ph?: string) => (
    <textarea data-testid={id} value={v} maxLength={max} rows={2} placeholder={ph} onChange={(e) => set(e.target.value)}
      className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
  );

  return (
    <div className="space-y-4">
      {pet ? (
        <Field label="Pet's name"><Input data-testid="pet-name" data-autofocus value={petName} maxLength={40} onChange={(e) => setPetName(e.target.value)} className="h-12 text-base" /></Field>
      ) : null}
      <Field label="Allergic to" hint="For example peanuts, penicillin, bee stings. Leave empty if none.">{area(allergies, setAllergies, 300, "card-allergies")}</Field>
      <Field label="Medicines" hint="What they take, and how often if it matters">{area(medicines, setMedicines, 300, "card-medicines")}</Field>
      {!pet ? (
        <>
          <Field label="Medical conditions" hint="For example asthma, diabetes, epilepsy">{area(conditions, setConditions, 500, "card-conditions")}</Field>
          <div className="glass-tile flex min-h-14 items-center gap-3 p-4">
            <Label htmlFor="card-shared" className="flex-1 text-base font-semibold">
              Everyone at home can see the conditions
              <span className="block text-sm font-normal text-muted-foreground">{shared ? "Shown on the card and the babysitter link (children only)." : grownUpOwn ? "Only you can see them." : "Only the parents can see them."}</span>
            </Label>
            <Switch id="card-shared" data-testid="card-shared" checked={shared} onCheckedChange={setShared} />
          </div>
          <Field label="Blood group" hint="Optional">
            <div className="flex flex-wrap gap-2">
              {BLOOD.map((b) => <Chip key={b} on={blood === b} onClick={() => setBlood(blood === b ? null : b)} className="min-w-12 justify-center text-base">{b}</Chip>)}
            </div>
          </Field>
        </>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Field label={pet ? "Vet" : "GP or surgery"}><Input data-testid="card-doctor" value={doctor} maxLength={80} onChange={(e) => setDoctor(e.target.value)} className="h-12 w-60 text-base" /></Field>
        <Field label="Their phone"><Input data-testid="card-doctor-phone" type="tel" value={doctorPhone} maxLength={40} onChange={(e) => setDoctorPhone(e.target.value)} className="h-12 w-48 text-base" /></Field>
      </div>
      {pet ? (
        <div className="flex flex-wrap gap-3">
          <Field label="Microchip number"><Input value={microchip} maxLength={40} onChange={(e) => setMicrochip(e.target.value)} className="h-12 w-60 text-base" /></Field>
          <Field label="Insurer"><Input value={insurer} maxLength={80} onChange={(e) => setInsurer(e.target.value)} className="h-12 w-48 text-base" /></Field>
        </div>
      ) : null}
      <Field label="Anything else" hint="Optional">{area(notes, setNotes, 300, "card-notes")}</Field>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-testid="card-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
        {pet && c ? <Button variant="ghost" className="h-12 rounded-full text-[var(--status-red)]" onClick={() => void removePet()}><Trash2 className="size-4" /> Remove</Button> : null}
      </div>
    </div>
  );
}
