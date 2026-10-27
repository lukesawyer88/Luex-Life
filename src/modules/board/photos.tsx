// Photos: every family photo at full quality, albums, drawings, uploads with a tick or a clear retry,
// read-only album links for relatives, and the family's space.
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive, Brush, Download, FolderPlus, Images, Link2, MoreHorizontal, Pencil, Play, Plus, Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { Chip, Empty, Field, PeoplePicker, Sheet } from "@/modules/calendar/ui";

import type { BoardTarget } from "./board-page";
import {
  downloadOriginal, refreshBoard, useAlbums, useFileUrls, useMedia, useMemories, useThreads, type Album, type Media,
} from "./data";
import { ExportSheet } from "./journal-export";
import { ScanDrawingSheet } from "./photo-drawing";
import { AlbumLinksSheet } from "./photo-share";
import { SpaceBar, UploadList, useUploads } from "./photo-upload";
import { Lightbox } from "./photo-viewer";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthOf(m: Media): string {
  return (m.taken_at ?? m.created_at).slice(0, 7);
}
function monthLabel(ym: string): string {
  const [y, mo] = ym.split("-").map(Number);
  return `${MONTHS[mo - 1]} ${y}`;
}

/** The photos everyone in the family can see: the family chat, albums and family memories (not private chats or journals) */
export function useFamilyPhotos(albumId: string | null) {
  const media = useMedia({ albumId, limit: 1000 });
  const threads = useThreads();
  const memories = useMemories();
  const data = useMemo(() => {
    const familyThread = threads.data?.find((t) => t.kind === "family")?.id;
    const familyMemories = new Set((memories.data ?? []).filter((m) => m.audience === "family").map((m) => m.id));
    return (media.data ?? []).filter((m) =>
      m.memory_id ? familyMemories.has(m.memory_id) : m.thread_id ? m.thread_id === familyThread : true);
  }, [media.data, threads.data, memories.data]);
  return { data, isLoading: media.isLoading };
}

export function PhotosTab(_: { target: BoardTarget; onGo: (t: BoardTarget) => void }) {
  const { family, isParent, me, role } = useFamilyState();
  const desktop = useDesktop();
  const qc = useQueryClient();
  const albums = useAlbums();
  const [albumId, setAlbumId] = useState<string | null>(_.target.albumId ?? null);
  const album = (albums.data ?? []).find((a) => a.id === albumId) ?? null;
  const photos = useFamilyPhotos(albumId);
  const urls = useFileUrls(photos.data.map((m) => m.thumb_path ?? m.path));
  const uploads = useUploads();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [sheet, setSheet] = useState<null | "new" | "rename" | "links" | "drawing" | "export">(null);
  const adult = role !== "child";
  const canEditAlbum = !!album && (isParent || album.created_by === me.id);

  const groups = useMemo(() => {
    const out: { ym: string; items: { m: Media; i: number }[] }[] = [];
    photos.data.forEach((m, i) => {
      const ym = monthOf(m);
      const last = out[out.length - 1];
      if (last && last.ym === ym) last.items.push({ m, i }); else out.push({ ym, items: [{ m, i }] });
    });
    return out;
  }, [photos.data]);

  async function archiveAlbum() {
    if (!album) return;
    const { error } = await supabase.from("board_albums").update({ archived_at: new Date().toISOString() }).eq("id", album.id);
    if (error) { toast.error(friendlyError(error)); return; }
    setAlbumId(null);
    void refreshBoard(qc, family.id);
    toast.success(`"${album.title}" removed. Its photos are still in All photos`, {
      action: { label: "Undo", onClick: () => { void supabase.from("board_albums").update({ archived_at: null }).eq("id", album.id).then(() => refreshBoard(qc, family.id)); } },
    });
  }

  const side = (
    <div className="space-y-3">
      <SpaceBar />
      <UploadList uploads={uploads} />
      <div className="rounded-2xl bg-[var(--surface)] p-3 text-sm">
        <p className="font-semibold">{album ? album.title : "All photos"}</p>
        <p className="mt-1 text-muted-foreground">
          {photos.data.length} {photos.data.length === 1 ? "item" : "items"}. Photos are kept at full quality, never shrunk.
          {album ? null : " Photos from the family chat and family memories show here too."}
        </p>
      </div>
    </div>
  );

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) uploads.add(files, { kind: "album", albumId });
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button className="h-11 rounded-full px-4 font-semibold" onClick={() => fileInput.current?.click()}><Plus className="size-4" /> Add photos</Button>
          <Button variant="outline" className="h-11 rounded-full px-4" onClick={() => setSheet("drawing")}><Brush className="size-4" /> Scan a drawing</Button>
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label="More photo options"><MoreHorizontal className="size-5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onSelect={() => setSheet("new")}><FolderPlus className="mr-2 size-4" /> New album</DropdownMenuItem>
              {album && adult ? <DropdownMenuItem onSelect={() => setSheet("links")}><Link2 className="mr-2 size-4" /> Share this album with relatives</DropdownMenuItem> : null}
              {canEditAlbum ? <DropdownMenuItem onSelect={() => setSheet("rename")}><Pencil className="mr-2 size-4" /> Rename album</DropdownMenuItem> : null}
              {canEditAlbum ? <DropdownMenuItem onSelect={() => void archiveAlbum()}><Archive className="mr-2 size-4" /> Remove album</DropdownMenuItem> : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSheet("export")}><Download className="mr-2 size-4" /> Download everything</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="scrollbar-none -mx-1 flex shrink-0 gap-1.5 overflow-x-auto px-1 pb-0.5">
          <Chip on={!albumId} onClick={() => setAlbumId(null)}><Images className="size-4" /> All photos</Chip>
          {(albums.data ?? []).map((a) => (
            <Chip key={a.id} on={albumId === a.id} onClick={() => setAlbumId(a.id)} className="shrink-0">
              {a.kind === "drawings" ? <Brush className="size-4" /> : null}{a.title}
            </Chip>
          ))}
          <Chip on={false} onClick={() => setSheet("new")} className="shrink-0"><FolderPlus className="size-4" /> New album</Chip>
        </div>

        {!desktop ? (
          <div className="space-y-2">
            <SpaceBar compact />
            <UploadList uploads={uploads} />
          </div>
        ) : null}

        <div className="min-h-0 flex-1">
          {photos.isLoading ? <p className="text-sm text-muted-foreground">Loading photos…</p>
          : photos.data.length === 0 ? (
            <Empty icon={Images} title={album ? "Nothing in this album yet" : "No photos yet"}>
              Tap Add photos to start. Photos in the family chat appear here too.
            </Empty>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <section key={g.ym}>
                  <h3 className="mb-2 text-sm font-bold">{monthLabel(g.ym)}</h3>
                  <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 xl:grid-cols-6">
                    {g.items.map(({ m, i }) => (
                      <Tile key={m.id} m={m} url={urls.data?.get(m.thumb_path ?? m.path)} onOpen={() => setOpen(i)} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </RecordsWindow>
      <DetailWindow>{side}</DetailWindow>

      {open != null ? <MediaViewer items={photos.data} index={open} onIndex={setOpen} onClose={() => setOpen(null)} albums={albums.data ?? []} /> : null}

      <AlbumNameSheet
        open={sheet === "new" || sheet === "rename"}
        album={sheet === "rename" ? album : null}
        onOpenChange={(o) => !o && setSheet(null)}
        onSaved={(a) => { setSheet(null); setAlbumId(a.id); }}
      />
      <AlbumLinksSheet album={album} open={sheet === "links"} onOpenChange={(o) => !o && setSheet(null)} />
      <ScanDrawingSheet open={sheet === "drawing"} onOpenChange={(o) => !o && setSheet(null)} />
      <ExportSheet open={sheet === "export"} onOpenChange={(o) => !o && setSheet(null)} />
    </Windows>
  );
}

function Tile({ m, url, onOpen }: { m: Media; url?: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="relative aspect-square overflow-hidden rounded-lg bg-muted" aria-label={m.caption || (m.kind === "video" ? "Video" : "Photo")}>
      {url && (m.thumb_path || m.kind !== "video") ? <img src={url} alt="" loading="lazy" className="size-full object-cover" /> : null}
      {m.kind === "video" ? (
        <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          <Play className="size-3" />{m.duration_s ? `${Math.floor(Number(m.duration_s) / 60)}:${String(Math.round(Number(m.duration_s) % 60)).padStart(2, "0")}` : ""}
        </span>
      ) : null}
    </button>
  );
}

function AlbumNameSheet({ open, album, onOpenChange, onSaved }: { open: boolean; album: Album | null; onOpenChange: (o: boolean) => void; onSaved: (a: Album) => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);
  const key = `${open}-${album?.id ?? "new"}`;
  if (open && seen !== key) { setSeen(key); setTitle(album?.title ?? ""); }

  async function save() {
    if (!title.trim()) return;
    setBusy(true);
    const q = album
      ? supabase.from("board_albums").update({ title: title.trim() }).eq("id", album.id).select("*").single()
      : supabase.from("board_albums").insert({ family_id: family.id, title: title.trim() }).select("*").single();
    const { data, error } = await q;
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    void refreshBoard(qc, family.id);
    onSaved(data as Album);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={album ? "Rename album" : "New album"}
      footer={<Button className="h-11 flex-1 rounded-full font-semibold" disabled={busy || !title.trim()} onClick={() => void save()}>{album ? "Save" : "Make album"}</Button>}
    >
      <Field label="Album name">
        <Input data-autofocus autoFocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Summer holiday" className="h-11" onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
      </Field>
    </Sheet>
  );
}

/** The viewer with caption, people, album, save original and remove */
export function MediaViewer({ items, index, onIndex, onClose, albums }: { items: Media[]; index: number; onIndex: (i: number) => void; onClose: () => void; albums: Album[] }) {
  const { family, members, isParent, me } = useFamilyState();
  const qc = useQueryClient();
  const m = items[index];
  const urls = useFileUrls(items.slice(Math.max(0, index - 1), index + 2).map((x) => x.path));
  const [caption, setCaption] = useState(m?.caption ?? "");
  const [shownFor, setShownFor] = useState(m?.id);
  if (m && shownFor !== m.id) { setShownFor(m.id); setCaption(m.caption); }
  if (!m) return null;
  const mine = m.owner === me.id || isParent;
  const inChat = !!m.thread_id;

  async function update(patch: Partial<Pick<Media, "caption" | "people" | "album_id" | "deleted_at">>, done?: string) {
    const { error } = await supabase.from("board_media").update(patch).eq("id", m.id);
    if (error) { toast.error(friendlyError(error)); return false; }
    void refreshBoard(qc, family.id);
    if (done) toast.success(done);
    return true;
  }
  async function remove() {
    const id = m.id;
    if (!(await update({ deleted_at: new Date().toISOString() }))) return;
    if (items.length <= 1) onClose(); else if (index >= items.length - 1) onIndex(index - 1);
    toast.success("Removed", {
      action: { label: "Undo", onClick: () => { void supabase.from("board_media").update({ deleted_at: null }).eq("id", id).then(() => refreshBoard(qc, family.id)); } },
    });
  }
  async function save() {
    try { await downloadOriginal(m.path); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't download it"); }
  }

  const side = (
    <div className="space-y-4">
      {mine ? (
        <Field label="Caption">
          <Textarea value={caption} maxLength={500} rows={2} onChange={(e) => setCaption(e.target.value)} placeholder="Say what's happening" />
          {caption !== m.caption ? <Button className="mt-2 h-10 rounded-full px-4" onClick={() => void update({ caption }, "Caption saved")}>Save caption</Button> : null}
        </Field>
      ) : m.caption ? <p className="text-sm">{m.caption}</p> : null}
      <Field label="Who's in it?">
        {mine ? (
          <PeoplePicker members={members} value={m.people} onChange={(people) => void update({ people })} />
        ) : (
          <p className="text-sm text-muted-foreground">{members.filter((x) => m.people.includes(x.id)).map((x) => x.display_name).join(", ") || "No one tagged"}</p>
        )}
      </Field>
      {mine && !inChat && albums.length ? (
        <Field label="Album">
          <select
            className="h-11 w-full rounded-xl border bg-[var(--surface)] px-3 text-sm"
            value={m.album_id ?? ""}
            onChange={(e) => void update({ album_id: e.target.value || null }, "Moved")}
          >
            <option value="">No album (All photos only)</option>
            {albums.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </Field>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Added by {members.find((x) => x.id === m.owner)?.display_name ?? "someone"} on {new Date(m.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-11 rounded-full px-4" onClick={() => void save()}><Download className="size-4" /> Save original</Button>
        {mine ? <Button variant="outline" className={cn("h-11 rounded-full px-4 text-[var(--status-red)]")} onClick={() => void remove()}><Trash2 className="size-4" /> Remove</Button> : null}
      </div>
    </div>
  );

  return (
    <Lightbox
      items={items.map((x) => ({ key: x.id, url: urls.data?.get(x.path), kind: x.kind, mime: x.mime, caption: x.caption }))}
      index={index}
      onIndex={onIndex}
      onClose={onClose}
      side={side}
      cantPlayHint={() => (
        <Button className="h-11 rounded-full bg-white px-4 text-black hover:bg-white/90" onClick={() => void save()}><Download className="size-4" /> Download to watch</Button>
      )}
    />
  );
}
