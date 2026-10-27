// Running out: every paper with a date, soonest first, so renewals are never a surprise.
import { AlarmClock } from "lucide-react";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { useFamilyState } from "@/lib/family-context";
import { cn } from "@/lib/utils";
import { Empty } from "@/modules/calendar/ui";

import { daysBetween, keptDocs, todayIn, useDocs, useFolders } from "./data";
import type { DocsTabProps } from "./documents-page";
import { DocDetail, DocRow, DocViewSheet } from "./papers";

export function RunningOutTab({ openId, onOpen, onEdit }: DocsTabProps) {
  const { family, me, members } = useFamilyState();
  const docs = useDocs();
  const folders = useFolders().data ?? [];
  const today = todayIn(family.timezone);
  const offline = docs.isError;
  const list = (offline ? keptDocs(me.id) : (docs.data ?? [])).filter((d) => d.expires_on).sort((a, b) => a.expires_on!.localeCompare(b.expires_on!));
  const groups = [
    { key: "gone", title: "Run out", list: list.filter((d) => d.expires_on! < today) },
    { key: "soon", title: "In the next 3 months", list: list.filter((d) => d.expires_on! >= today && daysBetween(today, d.expires_on!) <= 92) },
    { key: "later", title: "Later", list: list.filter((d) => daysBetween(today, d.expires_on!) > 92) },
  ].filter((g) => g.list.length);
  const open = list.find((d) => d.id === openId) ?? null;

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        {docs.isLoading ? null : !groups.length ? (
          <Empty icon={AlarmClock} title="Nothing running out">
            Add the date a passport, insurance or MOT runs out and it shows here. You'll get a reminder before it does.
          </Empty>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.key}>
                <h3 className={cn("mb-2 text-sm font-bold", g.key === "gone" && "text-[var(--status-red)]")}>{g.title}</h3>
                <ul className="space-y-2">
                  {g.list.map((d) => (
                    <DocRow key={d.id} d={d} on={openId === d.id} folder={folders.find((f) => f.id === d.folder_id)} who={members.find((m) => m.id === d.person_id)} today={today} onClick={() => onOpen(d.id)} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </RecordsWindow>
      <DetailWindow>
        {open ? <DocDetail d={open} offline={offline} onEdit={() => onEdit(open)} onGone={() => onOpen(null)} />
          : <p className="text-sm text-muted-foreground">Tap a paper to see it here.</p>}
      </DetailWindow>
      <DocViewSheet d={open} offline={offline} onEdit={() => open && onEdit(open)} onClose={() => onOpen(null)} />
    </Windows>
  );
}
