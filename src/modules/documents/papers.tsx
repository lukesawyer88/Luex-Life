// The papers: search, folders, and one paper at a time with its pages and key details.
import { useQueryClient } from "@tanstack/react-query";
import { CloudOff, Download, FileText, Lock, MapPin, Phone, Plus, Search, Smartphone, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { Chip, Empty, Sheet } from "@/modules/calendar/ui";

import {
  errMsg, expiryState, expiryWords, forgetOnPhone, isKept, isPdf, keepOnPhone, keptDocs, longDate, money, refreshDocs, removePages,
  todayIn, useDocs, useFolders, usePageUrls, type Doc, type Folder,
} from "./data";
import type { DocsTabProps } from "./documents-page";

export function PapersTab({ openId, onOpen, onAdd, onEdit }: DocsTabProps) {
  const { family, me, members } = useFamilyState();
  const docs = useDocs();
  const folders = useFolders().data ?? [];
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const today = todayIn(family.timezone);
  const offline = docs.isError;
  const list = offline ? keptDocs(me.id) : (docs.data ?? []);
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? null;
  const folderOf = (id: string | null) => folders.find((f) => f.id === id);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return list.filter((d) => {
      if (folder && d.folder_id !== folder) return false;
      if (!words.length) return true;
      const hay = [d.title, nameOf(d.person_id), folderOf(d.folder_id)?.name, d.ref, d.where_kept, d.notes, d.phone].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, q, folder, folders, members]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of list) if (d.folder_id) m.set(d.folder_id, (m.get(d.folder_id) ?? 0) + 1);
    return m;
  }, [list]);
  const open = list.find((d) => d.id === openId) ?? null;

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        {offline ? (
          <p className="flex items-center gap-2 rounded-2xl bg-[var(--surface)] p-3 text-sm font-medium"><CloudOff className="size-5 shrink-0" /> No signal. Showing the papers kept on this phone.</p>
        ) : null}
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input data-testid="doc-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search papers" aria-label="Search papers" className="h-12 rounded-full pl-10 text-base" />
          </label>
          {!offline ? <Button data-testid="doc-add" className="h-12 rounded-full px-4 text-base font-semibold" onClick={() => onAdd(folder ? { folder_id: folder } : undefined)}><Plus className="size-5" /> Add</Button> : null}
        </div>
        <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" data-testid="doc-folders">
          <Chip on={folder === null} onClick={() => setFolder(null)} className="shrink-0">All</Chip>
          {folders.filter((f) => !f.archived_at).map((f) => (
            <Chip key={f.id} on={folder === f.id} onClick={() => setFolder(folder === f.id ? null : f.id)} className="shrink-0">
              {f.emoji ? <span aria-hidden>{f.emoji}</span> : null} {f.name}
              {counts.get(f.id) ? <span className="text-xs opacity-70">{counts.get(f.id)}</span> : null}
            </Chip>
          ))}
        </div>
        {docs.isLoading ? null : !shown.length ? (
          <Empty icon={FileText} title={list.length ? "Nothing found" : "No papers yet"}>
            {list.length ? "Try another word, or tap All." : "Tap Add and take a photo of a passport, insurance or anything you need to keep. Add the date it runs out and you'll be reminded."}
          </Empty>
        ) : (
          <ul className="space-y-2">
            {shown.map((d) => <DocRow key={d.id} d={d} on={openId === d.id} folder={folderOf(d.folder_id)} who={members.find((m) => m.id === d.person_id)} today={today} onClick={() => onOpen(d.id)} />)}
          </ul>
        )}
      </RecordsWindow>
      <DetailWindow>
        {open ? <DocDetail d={open} offline={offline} onEdit={() => onEdit(open)} onGone={() => onOpen(null)} />
          : <p className="text-sm text-muted-foreground">Tap a paper to see it here, with its pages and key details.</p>}
      </DetailWindow>
      <DocViewSheet d={open} offline={offline} onEdit={() => open && onEdit(open)} onClose={() => onOpen(null)} />
    </Windows>
  );
}

export function DocRow({ d, on, folder, who, today, onClick }: {
  d: Doc; on: boolean; folder: Folder | undefined; who: ReturnType<typeof useFamilyState>["members"][number] | undefined; today: string; onClick: () => void;
}) {
  const st = expiryState(d, today);
  return (
    <li>
      <button type="button" data-testid="doc-row" onClick={onClick}
        className={cn("glass-tile flex w-full items-center gap-3 p-3 text-left", on && "ring-2 ring-[var(--status-blue)]")}>
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--surface)] text-xl" aria-hidden>{folder?.emoji ?? "📄"}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-base font-semibold">
            <span className="truncate">{d.title}</span>
            {d.private_to ? <Lock className="size-4 shrink-0 text-muted-foreground" aria-label="Just mine" /> : null}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {who ? <span className="inline-flex items-center gap-1"><MemberAvatar member={who} size="sm" className="size-5 ring-0 ring-offset-0" />{who.display_name}</span> : null}
            {d.expires_on ? (
              <span className={cn(st === "gone" && "font-semibold text-[var(--status-red)]", st === "soon" && "font-semibold text-[var(--status-amber)]")}>{expiryWords(d.expires_on, today)}</span>
            ) : folder ? <span>{folder.name}</span> : null}
          </span>
        </span>
      </button>
    </li>
  );
}

function DocDetail({ d, offline, onEdit, onGone }: { d: Doc; offline: boolean; onEdit: () => void; onGone: () => void }) {
  const { family, me, members, isParent } = useFamilyState();
  const qc = useQueryClient();
  const folders = useFolders().data ?? [];
  const urls = usePageUrls(d.pages);
  const today = todayIn(family.timezone);
  const [kept, setKept] = useState(() => isKept(me.id, d.id));
  const [busy, setBusy] = useState(false);
  const who = members.find((m) => m.id === d.person_id);
  const folder = folders.find((f) => f.id === d.folder_id);
  const canChange = !offline && (d.private_to ? d.private_to === me.id : isParent);
  const st = expiryState(d, today);

  async function toggleKeep() {
    setBusy(true);
    try {
      if (kept) { await forgetOnPhone(me.id, d.id); setKept(false); toast.success("No longer kept on this phone"); }
      else { await keepOnPhone(me.id, d); setKept(true); toast.success("Kept on this phone. It opens without a signal"); }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${d.title}? Its pages are deleted and this can't be undone.`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", d.id);
      if (error) throw error;
      await removePages(d.pages);
      await forgetOnPhone(me.id, d.id);
      await refreshDocs(qc, family.id);
      onGone();
      toast.success("Removed");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const line = (icon: React.ReactNode, label: string, value: React.ReactNode) => (
    <div className="flex items-start gap-3 py-1.5"><span className="mt-0.5 text-muted-foreground">{icon}</span><div className="min-w-0"><div className="text-xs text-muted-foreground">{label}</div><div className="break-words text-base font-medium">{value}</div></div></div>
  );

  return (
    <div className="space-y-3" data-testid="doc-detail">
      <div>
        <h3 className="text-xl font-bold">{d.title}</h3>
        <p className="text-sm text-muted-foreground">
          {[folder ? `${folder.emoji ?? ""} ${folder.name}`.trim() : null, who?.display_name, d.private_to ? "Just mine" : null].filter(Boolean).join(" · ")}
        </p>
      </div>
      {d.expires_on ? (
        <p className={cn("rounded-2xl p-3 text-base font-semibold", st === "gone" ? "bg-status-red/15 text-[var(--status-red)]" : st === "soon" ? "bg-status-amber/15" : "bg-[var(--surface)]")}>
          {expiryWords(d.expires_on, today)}
          <span className="block text-sm font-normal">{longDate(d.expires_on)}{d.remind_days ? ` · reminder ${d.remind_days >= 60 ? `${Math.round(d.remind_days / 30.4)} months` : `${d.remind_days} days`} before` : ""}</span>
        </p>
      ) : null}
      <div className="divide-y divide-[var(--surface-border)]">
        {d.where_kept ? line(<MapPin className="size-5" />, "The original is", d.where_kept) : null}
        {d.ref ? line(<FileText className="size-5" />, "Reference", <span className="select-all font-mono">{d.ref}</span>) : null}
        {d.phone ? line(<Phone className="size-5" />, "Phone", <a className="underline" href={`tel:${d.phone.replace(/[^\d+]/g, "")}`}>{d.phone}</a>) : null}
        {d.price != null ? line(<span className="text-base font-bold">£</span>, "Renewal price", money(d.price)) : null}
      </div>
      {d.notes ? <p className="whitespace-pre-wrap rounded-2xl bg-[var(--surface)] p-3 text-sm">{d.notes}</p> : null}
      {d.pages.length ? (
        <div className="space-y-2" data-testid="doc-pages">
          {d.pages.map((p, i) => {
            const url = urls.data?.get(p);
            if (!url) return <div key={p} className="h-40 animate-pulse rounded-2xl bg-[var(--surface)]" />;
            return isPdf(p) ? (
              <a key={p} href={url} target="_blank" rel="noreferrer" className="glass-tile flex min-h-12 items-center gap-2 p-3 font-semibold">
                <FileText className="size-5" /> Open the PDF{d.pages.length > 1 ? ` (page ${i + 1})` : ""}
              </a>
            ) : (
              <a key={p} href={url} target="_blank" rel="noreferrer" className="block">
                <img src={url} alt={`${d.title}, page ${i + 1}`} className="max-h-96 w-full rounded-2xl bg-[var(--surface)] object-contain" />
              </a>
            );
          })}
        </div>
      ) : <p className="text-sm text-muted-foreground">No photos yet.</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        {canChange ? <Button data-testid="doc-change" className="h-12 flex-1 rounded-full text-base font-semibold" onClick={onEdit}>Change</Button> : null}
        {!offline || kept ? (
          <Button variant="outline" data-testid="doc-keep" className="h-12 rounded-full" disabled={busy} onClick={() => void toggleKeep()}>
            {kept ? <><Smartphone className="size-4" /> Kept on this phone</> : <><Download className="size-4" /> Keep on this phone</>}
          </Button>
        ) : null}
        {canChange ? <Button variant="ghost" data-testid="doc-remove" className="h-12 rounded-full text-[var(--status-red)]" disabled={busy} onClick={() => void remove()}><Trash2 className="size-4" /> Remove</Button> : null}
      </div>
    </div>
  );
}

/** on phones and tablets the paper opens as a sheet */
export function DocViewSheet({ d, offline, onEdit, onClose }: { d: Doc | null; offline: boolean; onEdit: () => void; onClose: () => void }) {
  const wide = useDesktop();
  if (wide) return null;
  return (
    <Sheet open={!!d} onOpenChange={(o) => !o && onClose()} title={d?.title ?? ""}>
      {d ? <DocDetail d={d} offline={offline} onEdit={() => { onClose(); onEdit(); }} onGone={onClose} /> : null}
    </Sheet>
  );
}

export { DocDetail };
