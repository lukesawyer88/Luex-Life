// Things to fix: anyone adds one (children too), with a photo and where it is; a grown-up says who's sorting it and the
// tradesperson, and ticks it when it's fixed.
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Phone, Plus, Trash2, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { fitJpeg } from "@/lib/image";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { Chip, Empty, Field, Sheet } from "@/modules/calendar/ui";

import { errMsg, refreshHome, shortDate, uploadPhoto, useContactList, usePhotoUrls, useRepairs, type Repair } from "./data";

export function FixTab() {
  const { me, role } = useFamilyState();
  const q = useRepairs();
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Repair | "new" | null>(null);
  const [showDone, setShowDone] = useState(false);
  const grownUp = role !== "child";
  const all = useMemo(() => q.data ?? [], [q.data]);
  const openList = all.filter((r) => !r.done_at);
  const doneList = all.filter((r) => r.done_at);
  const urls = usePhotoUrls(all.map((r) => r.photo_path));
  const open = all.find((r) => r.id === openId) ?? null;
  const canEdit = (r: Repair) => grownUp || (r.created_by === me.id && !r.done_at);

  const row = (r: Repair) => {
    const url = r.photo_path ? urls.data?.get(r.photo_path) : null;
    return (
      <li key={r.id}>
        <button type="button" data-testid="fix-row" onClick={() => setOpenId(r.id)} className={cn("glass-tile flex w-full items-center gap-3 p-3 text-left", openId === r.id && "ring-2 ring-[var(--status-blue)]")}>
          {url ? <img src={url} alt="" className="size-12 shrink-0 rounded-xl object-cover" /> : <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[var(--surface)]"><Wrench className="size-5" /></span>}
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-base font-semibold", r.done_at && "text-muted-foreground line-through")}>{r.title}</span>
            <span className="block truncate text-sm text-muted-foreground">{[r.place, r.done_at ? `Fixed ${shortDate(r.done_at.slice(0, 10))}` : null].filter(Boolean).join(" · ")}</span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Things to fix</h2>
          <Button data-testid="fix-add" className="h-11 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-5" /> Add</Button>
        </div>
        {q.isLoading ? null : !openList.length && !doneList.length ? (
          <Empty icon={Wrench} title="Nothing to fix">Spotted something broken? Add it with a photo so it doesn't get forgotten.</Empty>
        ) : (
          <>
            {openList.length ? <ul className="space-y-2">{openList.map(row)}</ul> : <p className="text-base text-muted-foreground">Nothing waiting to be fixed.</p>}
            {doneList.length ? (
              <div>
                <button type="button" className="min-h-11 text-sm font-semibold underline" onClick={() => setShowDone(!showDone)}>{showDone ? "Hide" : "Show"} fixed ({doneList.length})</button>
                {showDone ? <ul className="mt-2 space-y-2">{doneList.map(row)}</ul> : null}
              </div>
            ) : null}
          </>
        )}
      </RecordsWindow>
      <DetailWindow>
        {open ? <FixDetail r={open} canEdit={canEdit(open)} onEdit={() => setEdit(open)} /> : <p className="text-sm text-muted-foreground">Tap something to see it, say who's sorting it, or tick it fixed.</p>}
      </DetailWindow>
      <FixViewSheet r={open} canEdit={!!open && canEdit(open)} onEdit={() => open && setEdit(open)} onClose={() => setOpenId(null)} />
      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} title={edit === "new" ? "Something to fix" : "Change"}>
        {edit !== null ? <FixForm key={edit === "new" ? "new" : edit.id} existing={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={setOpenId} /> : null}
      </Sheet>
    </Windows>
  );
}

function FixDetail({ r, canEdit, onEdit }: { r: Repair; canEdit: boolean; onEdit: () => void }) {
  const { family, members, role } = useFamilyState();
  const qc = useQueryClient();
  const url = usePhotoUrls([r.photo_path]).data?.get(r.photo_path ?? "");
  const contact = useContactList().data?.find((c) => c.id === r.contact_id);
  const who = members.find((m) => m.id === r.who);
  const by = members.find((m) => m.id === r.created_by);
  const grownUp = role !== "child";

  async function tick() {
    const { error } = await supabase.from("hc_repairs").update({ done_at: r.done_at ? null : new Date().toISOString() }).eq("id", r.id);
    if (error) return void toast.error(errMsg(error));
    await refreshHome(qc, family.id);
    if (!r.done_at) toast.success("Fixed");
  }

  return (
    <div className="space-y-3" data-testid="fix-detail">
      <div>
        <h3 className="text-xl font-bold">{r.title}</h3>
        <p className="text-sm text-muted-foreground">{[r.place, by ? `Added by ${by.display_name}` : null, shortDate(r.created_at.slice(0, 10))].filter(Boolean).join(" · ")}</p>
      </div>
      {url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={r.title} className="max-h-72 w-full rounded-2xl object-contain" /></a> : null}
      {r.notes ? <p className="whitespace-pre-wrap rounded-2xl bg-[var(--surface)] p-3 text-sm">{r.notes}</p> : null}
      {who ? <p className="flex items-center gap-2 text-base"><MemberAvatar member={who} size="sm" className="ring-0 ring-offset-0" /> {who.display_name} is sorting it</p> : null}
      {contact ? (
        <a href={contact.phone ? `tel:${contact.phone.replace(/[^\d+]/g, "")}` : undefined} className="glass-tile flex min-h-12 items-center gap-2 p-3 font-semibold"><Phone className="size-5" /> {contact.name}{contact.phone ? ` · ${contact.phone}` : ""}</a>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {grownUp ? (
          <Button data-testid="fix-tick" className={cn("h-12 flex-1 rounded-full text-base font-semibold", r.done_at && "bg-[var(--status-green)]")} onClick={() => void tick()}>
            <Check className="size-5" /> {r.done_at ? "Fixed (tap to undo)" : "It's fixed"}
          </Button>
        ) : null}
        {canEdit ? <Button variant="outline" data-testid="fix-change" className="h-12 rounded-full" onClick={onEdit}>Change</Button> : null}
      </div>
    </div>
  );
}

function FixViewSheet({ r, canEdit, onEdit, onClose }: { r: Repair | null; canEdit: boolean; onEdit: () => void; onClose: () => void }) {
  const wide = useDesktop();
  if (wide) return null;
  return (
    <Sheet open={!!r} onOpenChange={(o) => !o && onClose()} title={r?.title ?? ""}>
      {r ? <FixDetail r={r} canEdit={canEdit} onEdit={() => { onClose(); onEdit(); }} /> : null}
    </Sheet>
  );
}

function FixForm({ existing, onClose, onSaved }: { existing: Repair | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { family, members, role } = useFamilyState();
  const qc = useQueryClient();
  const contacts = useContactList().data ?? [];
  const grownUp = role !== "child";
  const [title, setTitle] = useState(existing?.title ?? "");
  const [place, setPlace] = useState(existing?.place ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [who, setWho] = useState<string | null>(existing?.who ?? null);
  const [contactId, setContactId] = useState<string | null>(existing?.contact_id ?? null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(existing?.photo_path ?? null);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  const oldUrl = usePhotoUrls([photoPath]).data?.get(photoPath ?? "");
  const grownUps = members.filter((m) => !m.archived_at && m.role !== "child");

  async function save() {
    setBusy(true);
    try {
      const path = photo ? await uploadPhoto(family.id, await fitJpeg(photo, 1600)) : photoPath;
      const row = { title: title.trim(), place: place.trim() || null, notes: notes.trim(), photo_path: path, ...(grownUp ? { who, contact_id: contactId } : {}) };
      let id = existing?.id;
      if (existing) {
        const { error } = await supabase.from("hc_repairs").update(row).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("hc_repairs").insert({ ...row, family_id: family.id }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      await refreshHome(qc, family.id);
      toast.success(existing ? "Saved" : "Added. The grown-ups have been told");
      onClose();
      if (id) onSaved(id);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing || !window.confirm(`Remove ${existing.title}?`)) return;
    const { error } = await supabase.from("hc_repairs").update({ deleted_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) return void toast.error(errMsg(error));
    await refreshHome(qc, family.id);
    onClose();
  }

  return (
    <div className="space-y-4">
      <Field label="What's wrong?"><Input data-testid="fix-title" data-autofocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="The tap is dripping" className="h-12 text-base" /></Field>
      <Field label="Where?" hint="Optional"><Input data-testid="fix-place" value={place} maxLength={60} onChange={(e) => setPlace(e.target.value)} placeholder="Bathroom" className="h-12 text-base" /></Field>
      <Field label="Photo" hint="Optional, but it helps">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-full border border-[var(--surface-border)] bg-[var(--surface)] px-4 font-semibold hover:bg-muted">
            <Camera className="size-5" /> {photo || photoPath ? "Change photo" : "Take a photo"}
            <input data-testid="fix-photo" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhoto(f); e.target.value = ""; }} />
          </label>
          {photo || photoPath ? <button type="button" className="text-sm font-semibold underline" onClick={() => { setPhoto(null); setPhotoPath(null); }}>Remove photo</button> : null}
        </div>
        {preview ?? oldUrl ? <img src={preview ?? oldUrl} alt="" className="mt-2 max-h-48 rounded-2xl object-contain" /> : null}
      </Field>
      <Field label="Anything else" hint="Optional">
        <textarea value={notes} maxLength={500} rows={2} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </Field>
      {grownUp ? (
        <>
          <Field label="Who's sorting it?" hint="They get a message">
            <div className="flex flex-wrap gap-2" data-testid="fix-who">
              {grownUps.map((m) => <Chip key={m.id} on={who === m.id} onClick={() => setWho(who === m.id ? null : m.id)} className="min-h-11 text-base"><MemberAvatar member={m} size="sm" className="size-6 ring-0 ring-offset-0" /> {m.display_name}</Chip>)}
            </div>
          </Field>
          {contacts.length ? (
            <Field label="Who to call" hint="From Contacts">
              <select value={contactId ?? ""} onChange={(e) => setContactId(e.target.value || null)} className="h-12 w-full rounded-xl border border-input bg-transparent px-3 text-base">
                <option value="">Nobody yet</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          ) : null}
        </>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-testid="fix-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !title.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
        {existing ? <Button variant="ghost" className="h-12 rounded-full text-[var(--status-red)]" onClick={() => void remove()}><Trash2 className="size-4" /> Remove</Button> : null}
      </div>
    </div>
  );
}
