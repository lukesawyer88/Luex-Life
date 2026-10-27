// Adding or changing a paper: photos (or a PDF), a name, a folder, who it's about, when it runs out and the key details.
import { useQueryClient } from "@tanstack/react-query";
import { Camera, ChevronDown, FileText, Lock, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { Chip, Field, Sheet } from "@/modules/calendar/ui";

import { MAX_PAGES, errMsg, isPdf, refreshDocs, removePages, suggestedRemind, uploadPage, useFolders, usePageUrls, type Doc } from "./data";

/** a new paper, perhaps with a name and folder already chosen (from the checklist or a folder) */
export type DocDraft = { title?: string; folder_id?: string; person_id?: string };

const REMIND: { days: number; label: string }[] = [
  { days: 14, label: "2 weeks" }, { days: 30, label: "1 month" }, { days: 91, label: "3 months" }, { days: 182, label: "6 months" },
];

export function DocEditSheet({ value, onClose, onSaved }: { value: Doc | DocDraft | null; onClose: () => void; onSaved: (id: string) => void }) {
  const open = value !== null;
  const existing = value && "id" in value ? (value as Doc) : null;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={existing ? "Change" : "Add a paper"}>
      {open ? <DocForm key={existing?.id ?? "new"} existing={existing} draft={existing ? {} : (value as DocDraft)} onClose={onClose} onSaved={onSaved} /> : null}
    </Sheet>
  );
}

type Page = { path: string } | { file: File; url: string };

function DocForm({ existing, draft, onClose, onSaved }: { existing: Doc | null; draft: DocDraft; onClose: () => void; onSaved: (id: string) => void }) {
  const { family, me, members, isParent } = useFamilyState();
  const qc = useQueryClient();
  const folders = (useFolders().data ?? []).filter((f) => !f.archived_at || f.id === existing?.folder_id);
  const [title, setTitle] = useState(existing?.title ?? draft.title ?? "");
  const [folderId, setFolderId] = useState<string | null>(existing ? existing.folder_id : draft.folder_id ?? null);
  // grown-ups who aren't parents only keep their own papers; parents choose (and can't change it later)
  const [mine, setMine] = useState(existing ? !!existing.private_to : !isParent);
  const [personId, setPersonId] = useState<string | null>(existing ? existing.person_id : draft.person_id ?? null);
  const [expires, setExpires] = useState(existing?.expires_on ?? "");
  const [remind, setRemind] = useState<number | null>(existing ? existing.remind_days : null);
  const [whereKept, setWhereKept] = useState(existing?.where_kept ?? "");
  const [ref, setRef] = useState(existing?.ref ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [price, setPrice] = useState(existing?.price != null ? Number(existing.price).toFixed(2) : "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [more, setMore] = useState(!!(existing?.ref || existing?.phone || existing?.price != null || existing?.notes));
  const [pages, setPages] = useState<Page[]>(() => (existing?.pages ?? []).map((path) => ({ path })));
  const [busy, setBusy] = useState(false);
  const urls = usePageUrls(existing?.pages ?? []);
  const folderName = folders.find((f) => f.id === folderId)?.name;
  const remindDays = remind ?? suggestedRemind(title, folderName);
  const people = useMemo(() => {
    const live = members.filter((m) => !m.archived_at);
    return mine ? live.filter((m) => m.id === me.id) : live;
  }, [members, mine, me.id]);

  // a private paper can only be about yourself
  useEffect(() => {
    if (mine && personId && personId !== me.id) setPersonId(null);
  }, [mine, personId, me.id]);
  useEffect(() => () => { for (const p of pages) if ("url" in p) URL.revokeObjectURL(p.url); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function addFiles(list: FileList | null) {
    if (!list) return;
    const add: Page[] = [];
    for (const f of Array.from(list)) {
      if (f.type !== "application/pdf" && !f.type.startsWith("image/")) { toast.error("Please choose photos or a PDF"); continue; }
      add.push({ file: f, url: URL.createObjectURL(f) });
    }
    setPages((p) => {
      const next = [...p, ...add];
      if (next.length > MAX_PAGES) toast.error(`${MAX_PAGES} pages at most`);
      return next.slice(0, MAX_PAGES);
    });
  }

  async function save() {
    const amt = price.trim() ? Math.round(Number(price.replace(/[£,\s]/g, "")) * 100) / 100 : null;
    if (amt != null && (!Number.isFinite(amt) || amt < 0 || amt >= 1_000_000)) return void toast.error("Type a price like 85.00");
    setBusy(true);
    const uploaded: string[] = [];
    try {
      const privateTo = existing ? existing.private_to : mine ? me.id : null;
      const paths: string[] = [];
      for (const p of pages) {
        if ("path" in p) { paths.push(p.path); continue; }
        const path = await uploadPage(family.id, privateTo, p.file);
        uploaded.push(path);
        paths.push(path);
      }
      const row = {
        title: title.trim(), folder_id: folderId, person_id: personId, pages: paths, expires_on: expires || null,
        remind_days: remindDays, where_kept: whereKept.trim() || null, ref: ref.trim() || null, phone: phone.trim() || null,
        price: amt, notes: notes.trim(),
      };
      let id = existing?.id;
      if (existing) {
        const { error } = await supabase.from("documents").update(row).eq("id", existing.id);
        if (error) throw error;
        // pages taken out are deleted
        await removePages(existing.pages.filter((p) => !paths.includes(p)));
      } else {
        const { data, error } = await supabase.from("documents").insert({ ...row, family_id: family.id, private_to: privateTo }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      await refreshDocs(qc, family.id);
      toast.success("Saved");
      onClose();
      if (id) onSaved(id);
    } catch (e) {
      await removePages(uploaded);
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const pageThumb = (p: Page, i: number) => {
    const path = "path" in p ? p.path : null;
    const pdf = path ? isPdf(path) : (p as { file: File }).file.type === "application/pdf";
    const src = path ? urls.data?.get(path) : (p as { url: string }).url;
    return (
      <li key={path ?? (p as { url: string }).url} className="relative">
        {pdf ? (
          <div className="grid size-24 place-items-center rounded-2xl bg-[var(--surface)] text-center text-xs font-semibold"><FileText className="size-7" />PDF</div>
        ) : src ? <img src={src} alt={`Page ${i + 1}`} className="size-24 rounded-2xl bg-[var(--surface)] object-cover" /> : <div className="size-24 animate-pulse rounded-2xl bg-[var(--surface)]" />}
        <button type="button" aria-label={`Take out page ${i + 1}`} onClick={() => setPages((ps) => ps.filter((_, j) => j !== i))}
          className="absolute -right-1.5 -top-1.5 grid size-8 place-items-center rounded-full bg-foreground text-background shadow"><X className="size-4" /></button>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <Field label="Photos or PDF" hint="Take a photo of each page, or add a PDF.">
        {pages.length ? <ul className="mb-2 flex flex-wrap gap-3" data-testid="doc-thumbs">{pages.map(pageThumb)}</ul> : null}
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-full border border-[var(--surface-border)] bg-[var(--surface)] px-4 font-semibold hover:bg-muted">
            <Camera className="size-5" /> {pages.length ? "Add a page" : "Take a photo"}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-full border border-[var(--surface-border)] bg-[var(--surface)] px-4 font-semibold hover:bg-muted">
            <Upload className="size-5" /> Choose files
            <input data-testid="doc-files" type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
      </Field>
      <Field label="What is it?">
        <Input data-testid="doc-title" data-autofocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Passport" className="h-12 text-base" />
      </Field>
      <Field label="Folder">
        <div className="flex flex-wrap gap-2" data-testid="doc-folder-pick">
          {folders.map((f) => (
            <Chip key={f.id} on={folderId === f.id} onClick={() => setFolderId(folderId === f.id ? null : f.id)} className="min-h-11 px-3 text-base">
              {f.emoji ? <span aria-hidden>{f.emoji}</span> : null} {f.name}
            </Chip>
          ))}
        </div>
      </Field>
      {isParent && !existing ? (
        <div className="glass-tile flex min-h-14 items-center gap-3 p-4">
          <Lock className="size-5 shrink-0 text-muted-foreground" />
          <Label htmlFor="doc-mine" className="flex-1 text-base font-semibold">
            Just mine
            <span className="block text-sm font-normal text-muted-foreground">{mine ? "Only you can see this. You can't change this later." : "The other parents can see this too."}</span>
          </Label>
          <Switch id="doc-mine" data-testid="doc-mine" checked={mine} onCheckedChange={setMine} />
        </div>
      ) : existing?.private_to || !isParent ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4" /> Just yours: nobody else can see this.</p>
      ) : null}
      <Field label="Whose is it?" hint="Optional">
        <div className="flex flex-wrap gap-2" data-testid="doc-person">
          {people.map((m) => (
            <Chip key={m.id} on={personId === m.id} onClick={() => setPersonId(personId === m.id ? null : m.id)} className="min-h-11 px-3 text-base">
              <MemberAvatar member={m} size="sm" className="size-6 ring-0 ring-offset-0" /> {m.id === me.id ? "Me" : m.display_name}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="When does it run out?" hint="Optional. You'll get a reminder before it does.">
        <Input data-testid="doc-expires" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className="h-12 w-48 text-base" />
        {expires ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-sm">Remind me</span>
            {REMIND.map((r) => <Chip key={r.days} on={remindDays === r.days || (Math.abs(remindDays - r.days) < 3)} onClick={() => setRemind(r.days)}>{r.label}</Chip>)}
            <span className="text-sm">before</span>
          </div>
        ) : null}
      </Field>
      <Field label="Where's the original?" hint="Optional, for example “Kitchen drawer” or “Safe”">
        <Input data-testid="doc-where" value={whereKept} maxLength={120} onChange={(e) => setWhereKept(e.target.value)} className="h-12 text-base" />
      </Field>
      {more ? (
        <>
          <div className="flex flex-wrap gap-3">
            <Field label="Reference or policy number">
              <Input data-testid="doc-ref" value={ref} maxLength={80} onChange={(e) => setRef(e.target.value)} className="h-12 w-60 text-base" />
            </Field>
            <Field label="Phone to call">
              <Input data-testid="doc-phone" type="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} className="h-12 w-48 text-base" />
            </Field>
            <Field label="Renewal price">
              <div className="flex items-center gap-1"><span className="text-lg font-bold">£</span>
                <Input data-testid="doc-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className="h-12 w-28 text-base" />
              </div>
            </Field>
          </div>
          <Field label="Notes">
            <textarea value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </Field>
        </>
      ) : (
        <button type="button" data-testid="doc-more" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold underline" onClick={() => setMore(true)}>
          <ChevronDown className="size-4" /> Add key details (reference, phone, price)
        </button>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-testid="doc-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !title.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
