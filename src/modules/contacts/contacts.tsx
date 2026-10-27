// Household contacts: family, doctors, school, repairs, neighbours. Tap to call, text or email; mark who to call first.
import { useQueryClient } from "@tanstack/react-query";
import { BookUser, FileUp, Mail, MapPin, MessageSquare, Phone, Plus, Search, Siren, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { Chip, Empty, Field, Sheet } from "@/modules/calendar/ui";

import { GROUPS, callList, errMsg, parseVCards, refreshEm, smsHref, telHref, useContacts, type Contact, type VCardContact } from "./data";

export function ContactsTab() {
  const { role } = useFamilyState();
  const q = useContacts();
  const [search, setSearch] = useState("");
  const [grp, setGrp] = useState<Contact["grp"] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Contact | "new" | null>(null);
  const [importing, setImporting] = useState<VCardContact[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const grownUp = role !== "child";
  const all = useMemo(() => q.data ?? [], [q.data]);
  const shown = useMemo(() => {
    const w = search.trim().toLowerCase();
    return all.filter((c) => (!grp || c.grp === grp) && (!w || [c.name, c.phone, c.notes, c.address, c.email].join(" ").toLowerCase().includes(w)));
  }, [all, search, grp]);
  const open = all.find((c) => c.id === openId) ?? null;

  async function readFile(f: File) {
    try {
      const list = parseVCards(await f.text());
      if (!list.length) throw new Error("No contacts found in that file");
      setImporting(list.slice(0, 200));
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input data-testid="contact-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts" aria-label="Search contacts" className="h-12 rounded-full pl-10 text-base" />
          </label>
          {grownUp ? <Button data-testid="contact-add" className="h-12 rounded-full px-4 text-base font-semibold" onClick={() => setEdit("new")}><Plus className="size-5" /> Add</Button> : null}
        </div>
        <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          <Chip on={grp === null} onClick={() => setGrp(null)} className="shrink-0">All</Chip>
          {GROUPS.map((g) => <Chip key={g.key} on={grp === g.key} onClick={() => setGrp(grp === g.key ? null : g.key)} className="shrink-0"><span aria-hidden>{g.emoji}</span> {g.label}</Chip>)}
        </div>
        {q.isLoading ? null : !shown.length ? (
          <Empty icon={BookUser} title={all.length ? "Nothing found" : "No contacts yet"}>
            {all.length ? "Try another word, or tap All." : grownUp ? "Add the numbers you'd need in a hurry: family, the GP, school, a neighbour, a plumber." : "A grown-up can add the family's numbers here."}
          </Empty>
        ) : (
          <ul className="space-y-2">
            {shown.map((c) => (
              <li key={c.id}>
                <div className={cn("glass-tile flex items-center gap-2 p-2 pl-3", openId === c.id && "ring-2 ring-[var(--status-blue)]")}>
                  <button type="button" data-testid="contact-row" className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpenId(c.id)}>
                    <span className="text-xl" aria-hidden>{GROUPS.find((g) => g.key === c.grp)?.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-base font-semibold"><span className="truncate">{c.name}</span>{c.call_order ? <Siren className="size-4 shrink-0 text-[var(--status-red)]" aria-label={`Who to call number ${c.call_order}`} /> : null}</span>
                      {c.notes || c.phone ? <span className="block truncate text-sm text-muted-foreground">{c.notes || c.phone}</span> : null}
                    </span>
                  </button>
                  {c.phone ? <a href={telHref(c.phone)} aria-label={`Call ${c.name}`} className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--status-green)] text-white"><Phone className="size-5" /></a> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {grownUp ? (
          <div className="pt-1">
            <Button variant="ghost" className="h-11 rounded-full text-sm" onClick={() => fileRef.current?.click()}><FileUp className="size-4" /> Add from a contacts file (.vcf)</Button>
            <input ref={fileRef} type="file" accept=".vcf,text/vcard,text/x-vcard" className="sr-only" data-testid="contact-file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ""; }} />
          </div>
        ) : null}
      </RecordsWindow>
      <DetailWindow>
        {open ? <ContactDetail c={open} canEdit={grownUp} onEdit={() => setEdit(open)} /> : <p className="text-sm text-muted-foreground">Tap someone to see their details.</p>}
      </DetailWindow>
      <ContactViewSheet c={open} canEdit={grownUp} onEdit={() => open && setEdit(open)} onClose={() => setOpenId(null)} />
      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} title={edit === "new" ? "Add a contact" : "Change"}>
        {edit !== null ? <ContactForm key={edit === "new" ? "new" : edit.id} existing={edit === "new" ? null : edit} all={all} onClose={() => setEdit(null)} onSaved={setOpenId} /> : null}
      </Sheet>
      <Sheet open={importing !== null} onOpenChange={(o) => !o && setImporting(null)} title="Add from a contacts file">
        {importing ? <ImportList list={importing} onClose={() => setImporting(null)} /> : null}
      </Sheet>
    </Windows>
  );
}

function ContactDetail({ c, canEdit, onEdit }: { c: Contact; canEdit: boolean; onEdit: () => void }) {
  const big = "flex min-h-12 items-center gap-2 rounded-full px-4 text-base font-semibold";
  return (
    <div className="space-y-3" data-testid="contact-detail">
      <div>
        <h3 className="text-xl font-bold">{c.name}</h3>
        <p className="text-sm text-muted-foreground">{GROUPS.find((g) => g.key === c.grp)?.label}{c.call_order ? ` · who to call, number ${c.call_order}` : ""}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {c.phone ? <a href={telHref(c.phone)} className={cn(big, "bg-[var(--status-green)] text-white")}><Phone className="size-5" /> {c.phone}</a> : null}
        {c.phone2 ? <a href={telHref(c.phone2)} className={cn(big, "bg-[var(--surface)]")}><Phone className="size-5" /> {c.phone2}</a> : null}
        {c.phone ? <a href={smsHref(c.phone)} className={cn(big, "bg-[var(--surface)]")}><MessageSquare className="size-5" /> Text</a> : null}
        {c.email ? <a href={`mailto:${c.email}`} className={cn(big, "bg-[var(--surface)]")}><Mail className="size-5" /> Email</a> : null}
      </div>
      {c.address ? <p className="flex items-start gap-2 text-base"><MapPin className="mt-0.5 size-5 shrink-0 text-muted-foreground" /> <span className="whitespace-pre-line">{c.address}</span></p> : null}
      {c.notes ? <p className="whitespace-pre-wrap rounded-2xl bg-[var(--surface)] p-3 text-base">{c.notes}</p> : null}
      {canEdit ? <Button variant="outline" data-testid="contact-change" className="h-12 w-full rounded-full" onClick={onEdit}>Change</Button> : null}
    </div>
  );
}

function ContactViewSheet({ c, canEdit, onEdit, onClose }: { c: Contact | null; canEdit: boolean; onEdit: () => void; onClose: () => void }) {
  const wide = useDesktop();
  if (wide) return null;
  return (
    <Sheet open={!!c} onOpenChange={(o) => !o && onClose()} title={c?.name ?? ""}>
      {c ? <ContactDetail c={c} canEdit={canEdit} onEdit={() => { onClose(); onEdit(); }} /> : null}
    </Sheet>
  );
}

function ContactForm({ existing, all, onClose, onSaved }: { existing: Contact | null; all: Contact[]; onClose: () => void; onSaved: (id: string) => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const calls = callList(all).filter((c) => c.id !== existing?.id);
  const [name, setName] = useState(existing?.name ?? "");
  const [grp, setGrp] = useState<Contact["grp"]>(existing?.grp ?? "family");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [phone2, setPhone2] = useState(existing?.phone2 ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [isCall, setIsCall] = useState(existing?.call_order != null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      // who to call: keep its place, or go to the end of the list
      const order = isCall ? existing?.call_order ?? Math.min(20, (calls.at(-1)?.call_order ?? 0) + 1) : null;
      const row = { name: name.trim(), grp, phone: phone.trim() || null, phone2: phone2.trim() || null, email: email.trim() || null, address: address.trim() || null, notes: notes.trim(), call_order: order };
      let id = existing?.id;
      if (existing) {
        const { error } = await supabase.from("em_contacts").update(row).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("em_contacts").insert({ ...row, family_id: family.id }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      await refreshEm(qc, family.id);
      toast.success("Saved");
      onClose();
      if (id) onSaved(id);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function move(by: -1 | 1) {
    if (!existing?.call_order) return;
    const list = callList(all);
    const i = list.findIndex((c) => c.id === existing.id);
    const other = list[i + by];
    if (!other) return;
    // swap the two places (the database checks nothing else, so two quick updates are fine)
    const a = existing.call_order, b = other.call_order;
    await supabase.from("em_contacts").update({ call_order: b }).eq("id", existing.id);
    await supabase.from("em_contacts").update({ call_order: a }).eq("id", other.id);
    await refreshEm(qc, family.id);
    onClose();
  }

  async function remove() {
    if (!existing || !window.confirm(`Remove ${existing.name}?`)) return;
    const { error } = await supabase.from("em_contacts").update({ deleted_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) return void toast.error(errMsg(error));
    await refreshEm(qc, family.id);
    onClose();
    toast(`${existing.name} removed`, { action: { label: "Undo", onClick: async () => { await supabase.from("em_contacts").update({ deleted_at: null }).eq("id", existing.id); await refreshEm(qc, family.id); } } });
  }

  return (
    <div className="space-y-4">
      <Field label="Name"><Input data-testid="contact-name" data-autofocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Dr Patel" className="h-12 text-base" /></Field>
      <Field label="Group">
        <div className="flex flex-wrap gap-2">
          {GROUPS.map((g) => <Chip key={g.key} on={grp === g.key} onClick={() => setGrp(g.key)} className="min-h-11 text-base"><span aria-hidden>{g.emoji}</span> {g.label}</Chip>)}
        </div>
      </Field>
      <div className="flex flex-wrap gap-3">
        <Field label="Phone"><Input data-testid="contact-phone" type="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} className="h-12 w-52 text-base" /></Field>
        <Field label="Other phone" hint="Optional"><Input type="tel" value={phone2} maxLength={40} onChange={(e) => setPhone2(e.target.value)} className="h-12 w-52 text-base" /></Field>
      </div>
      <div className="glass-tile flex min-h-14 items-center gap-3 p-4">
        <Siren className="size-5 shrink-0 text-[var(--status-red)]" />
        <Label htmlFor="contact-call" className="flex-1 text-base font-semibold">
          Someone to call in an emergency
          <span className="block text-sm font-normal text-muted-foreground">{isCall ? `Number ${existing?.call_order ?? calls.length + 1} on the emergency screen.` : "Shown at the top of the emergency screen."}</span>
        </Label>
        <Switch id="contact-call" data-testid="contact-call" checked={isCall} onCheckedChange={setIsCall} />
      </div>
      {existing?.call_order ? (
        <div className="flex gap-2">
          <Button variant="outline" className="h-11 rounded-full" disabled={existing.call_order === callList(all)[0]?.call_order} onClick={() => void move(-1)}>Call them sooner</Button>
          <Button variant="outline" className="h-11 rounded-full" disabled={existing.call_order === callList(all).at(-1)?.call_order} onClick={() => void move(1)}>Call them later</Button>
        </div>
      ) : null}
      <Field label="Note" hint="For example “Mum”, “Next door, has a key”, “Surgery opens 8am”">
        <Input data-testid="contact-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} className="h-12 text-base" />
      </Field>
      <Field label="Email" hint="Optional"><Input type="email" value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base" /></Field>
      <Field label="Address" hint="Optional">
        <textarea value={address} maxLength={200} rows={2} onChange={(e) => setAddress(e.target.value)}
          className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </Field>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-testid="contact-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
        {existing ? <Button variant="ghost" className="h-12 rounded-full text-[var(--status-red)]" onClick={() => void remove()}><Trash2 className="size-4" /> Remove</Button> : null}
      </div>
    </div>
  );
}

function ImportList({ list, onClose }: { list: VCardContact[]; onClose: () => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Set<number>>(() => new Set(list.length <= 10 ? list.map((_, i) => i) : []));
  const [grp, setGrp] = useState<Contact["grp"]>("family");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const rows = [...picked].map((i) => list[i]).map((c) => ({ family_id: family.id, grp, name: c.name, phone: c.phone, phone2: c.phone2, email: c.email, address: c.address, notes: c.notes }));
      const { error } = await supabase.from("em_contacts").insert(rows);
      if (error) throw error;
      await refreshEm(qc, family.id);
      toast.success(`${rows.length} added`);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Tick the people to add. Only the ones you tick are saved.</p>
      <Field label="Put them in">
        <div className="flex flex-wrap gap-2">{GROUPS.map((g) => <Chip key={g.key} on={grp === g.key} onClick={() => setGrp(g.key)}>{g.emoji} {g.label}</Chip>)}</div>
      </Field>
      <ul className="space-y-1" data-testid="import-list">
        {list.map((c, i) => (
          <li key={i}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-muted">
              <input type="checkbox" className="size-5" checked={picked.has(i)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{c.name}</span><span className="block truncate text-sm text-muted-foreground">{c.phone ?? c.email ?? ""}</span></span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button data-testid="import-add" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !picked.size} onClick={() => void add()}>{busy ? "Adding…" : `Add ${picked.size}`}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
