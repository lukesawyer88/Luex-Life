// Papers settings: download everything (anyone), and the folders (parents rename, add and hide them).
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Download, EyeOff, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { Sheet } from "@/modules/calendar/ui";

import { downloadAll, errMsg, refreshDocs, useDocs, useFolders, type Folder } from "./data";

export function DocsSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { family, members, isParent } = useFamilyState();
  const qc = useQueryClient();
  const folders = useFolders().data ?? [];
  const docs = useDocs().data ?? [];
  const [progress, setProgress] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const live = folders.filter((f) => !f.archived_at);

  async function download() {
    setProgress("Getting ready…");
    try {
      const missed = await downloadAll(docs, folders, (id) => members.find((m) => m.id === id)?.display_name ?? null, (d, t) => setProgress(`Page ${d} of ${t}…`));
      if (missed) toast.error(`Downloaded, but ${missed} page${missed === 1 ? "" : "s"} couldn't be fetched. Try again with a better signal`);
      else toast.success("Downloaded");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setProgress(null);
    }
  }

  async function change(f: Folder, patch: Partial<Pick<Folder, "name" | "emoji" | "position" | "archived_at">>) {
    const { error } = await supabase.from("doc_folders").update(patch).eq("id", f.id);
    if (error) return void toast.error(errMsg(error));
    await refreshDocs(qc, family.id);
  }

  async function move(i: number, by: -1 | 1) {
    const a = live[i], b = live[i + by];
    if (!a || !b) return;
    await change(a, { position: b.position });
    await change(b, { position: a.position });
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    const { error } = await supabase.from("doc_folders").insert({ family_id: family.id, name, emoji: "📁", position: (folders.at(-1)?.position ?? 0) + 1 });
    if (error) return void toast.error(errMsg(error));
    setNewName("");
    await refreshDocs(qc, family.id);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Papers settings" wide>
      <div className="space-y-6">
        <section className="glass-tile space-y-2 p-4">
          <h3 className="text-base font-bold">Download everything</h3>
          <p className="text-sm text-muted-foreground">Every paper you can see, in folders, with a list of the key details. Keep it somewhere safe.</p>
          <Button data-testid="doc-download" className="h-12 rounded-full px-5 text-base font-semibold" disabled={!!progress || !docs.length} onClick={() => void download()}>
            <Download className="size-5" /> {progress ?? "Download as a zip"}
          </Button>
        </section>

        {isParent ? (
          <section className="space-y-2">
            <h3 className="text-base font-bold">Folders</h3>
            <ul className="space-y-2" data-testid="folder-list">
              {live.map((f, i) => <FolderRow key={f.id} f={f} first={i === 0} last={i === live.length - 1} onChange={(p) => void change(f, p)} onMove={(by) => void move(i, by)} />)}
            </ul>
            <div className="flex gap-2 pt-1">
              <Input data-testid="folder-new" value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} placeholder="New folder" className="h-12 text-base"
                onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
              <Button className="h-12 rounded-full" disabled={!newName.trim()} onClick={() => void add()}><Plus className="size-5" /> Add</Button>
            </div>
            {folders.some((f) => f.archived_at) ? (
              <div className="pt-2">
                <p className="text-sm font-semibold">Hidden</p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {folders.filter((f) => f.archived_at).map((f) => (
                    <li key={f.id}><Button variant="outline" className="h-10 rounded-full" onClick={() => void change(f, { archived_at: null })}>{f.emoji} {f.name}: show</Button></li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">A parent looks after the folders. Your own papers are just yours.</p>
        )}
      </div>
    </Sheet>
  );
}

function FolderRow({ f, first, last, onChange, onMove }: { f: Folder; first: boolean; last: boolean; onChange: (p: Partial<Folder>) => void; onMove: (by: -1 | 1) => void }) {
  const [name, setName] = useState(f.name);
  const [emoji, setEmoji] = useState(f.emoji ?? "");
  const commit = () => {
    const n = name.trim();
    if (n && (n !== f.name || (emoji || null) !== f.emoji)) onChange({ name: n, emoji: emoji.trim() || null });
    else setName(f.name);
  };
  return (
    <li className="glass-tile flex items-center gap-2 p-2">
      <Input aria-label={`Emoji for ${f.name}`} value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} onBlur={commit} className="h-11 w-14 text-center text-lg" />
      <Input aria-label={`Name of ${f.name}`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={commit} className="h-11 min-w-0 flex-1 text-base" />
      <Button variant="ghost" size="icon" className="size-10 rounded-full" disabled={first} onClick={() => onMove(-1)} aria-label={`Move ${f.name} up`}><ArrowUp className="size-4" /></Button>
      <Button variant="ghost" size="icon" className="size-10 rounded-full" disabled={last} onClick={() => onMove(1)} aria-label={`Move ${f.name} down`}><ArrowDown className="size-4" /></Button>
      <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => onChange({ archived_at: new Date().toISOString() })} aria-label={`Hide ${f.name}`}><EyeOff className="size-4" /></Button>
    </li>
  );
}
