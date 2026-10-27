// Documents and Papers: snap it, it goes in the right folder, and you're told before it runs out. Grown-ups only.
import { AlarmClock, FileText, ListChecks, Loader2, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useFamilyState } from "@/lib/family-context";
import { forgetPhoneCopies } from "@/lib/phone-copies";
import { Tabs } from "@/modules/calendar/ui";

import { ChecklistTab } from "./checklist";
import { syncKept, useDocs, useDocsLive, useFolders, type Doc } from "./data";
import { DocEditSheet, type DocDraft } from "./doc-form";
import { PapersTab } from "./papers";
import { RunningOutTab } from "./running-out";
import { DocsSettingsDialog } from "./settings";

export type DocsTab = "papers" | "soon" | "checklist";
export type DocsTabProps = { openId: string | null; onOpen: (id: string | null) => void; onAdd: (draft?: DocDraft) => void; onEdit: (d: Doc) => void };

function fromUrl(): { doc?: string } {
  const p = new URLSearchParams(window.location.search);
  const doc = p.get("doc") ?? undefined;
  if ([...p.keys()].length) window.history.replaceState(null, "", window.location.pathname);
  return { doc };
}

export function DocumentsPage() {
  useDocsLive();
  const { me } = useFamilyState();
  const folders = useFolders();
  const docs = useDocs();
  const first = useMemo(fromUrl, []);
  const [tab, setTab] = useState<DocsTab>("papers");
  const [openId, setOpenId] = useState<string | null>(first.doc ?? null);
  const [edit, setEdit] = useState<Doc | DocDraft | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // only my own kept papers stay on this phone
  useEffect(() => { void forgetPhoneCopies(me.id); }, [me.id]);
  // papers kept on this phone follow the latest version
  useEffect(() => {
    if (docs.data) void syncKept(me.id, docs.data);
  }, [docs.data, me.id]);

  if (folders.isLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;

  const props: DocsTabProps = {
    openId,
    onOpen: setOpenId,
    onAdd: (draft) => setEdit(draft ?? {}),
    onEdit: (d) => setEdit(d),
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <Tabs<DocsTab>
            value={tab}
            onChange={setTab}
            items={[
              { key: "papers", label: "Papers", icon: FileText },
              { key: "soon", label: "Running out", icon: AlarmClock },
              { key: "checklist", label: "Checklist", icon: ListChecks },
            ]}
          />
        </div>
        <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" onClick={() => setShowSettings(true)} aria-label="Papers settings"><Settings2 className="size-5" /></Button>
      </div>
      {tab === "papers" ? <PapersTab {...props} /> : null}
      {tab === "soon" ? <RunningOutTab {...props} /> : null}
      {tab === "checklist" ? <ChecklistTab {...props} onOpen={(id) => { setOpenId(id); setTab("papers"); }} /> : null}
      <DocEditSheet value={edit} onClose={() => setEdit(null)} onSaved={(id) => { setOpenId(id); setTab("papers"); }} />
      <DocsSettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </div>
  );
}
