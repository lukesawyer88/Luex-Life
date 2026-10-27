// A suggested checklist: the papers most households keep, ticked off as they're added. Tap one to add it.
import { Check, ListChecks, Plus } from "lucide-react";

import { RecordsWindow, Windows } from "@/components/page-parts";
import { useFamilyState } from "@/lib/family-context";
import { cn } from "@/lib/utils";
import { Empty } from "@/modules/calendar/ui";

import { CHECKLIST, useDocs, useFolders } from "./data";
import type { DocsTabProps } from "./documents-page";

export function ChecklistTab({ onAdd, onOpen }: DocsTabProps) {
  const { isParent } = useFamilyState();
  const docs = useDocs();
  const folders = useFolders().data ?? [];
  if (docs.isError) return <Windows><RecordsWindow><Empty icon={ListChecks} title="No signal">The checklist needs a signal.</Empty></RecordsWindow></Windows>;
  const list = docs.data ?? [];
  const items = CHECKLIST.filter((c) => isParent || c.mine).map((c) => ({ ...c, found: list.find((d) => c.match.test(d.title)) }));
  const done = items.filter((i) => i.found).length;

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-bold">{isParent ? "Papers most homes keep" : "Papers most people keep"}</h2>
          <p className="text-sm text-muted-foreground">{done} of {items.length} added. Skip anything you don't have.</p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((i) => {
            const folder = folders.find((f) => f.name === i.folder);
            return (
              <li key={i.title}>
                <button type="button" data-testid="check-item"
                  onClick={() => (i.found ? onOpen(i.found.id) : onAdd({ title: i.title, folder_id: folder?.id }))}
                  className="glass-tile flex min-h-14 w-full items-center gap-3 p-3 text-left">
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-full border-2",
                    i.found ? "border-transparent bg-[var(--status-green)] text-white" : "border-[var(--surface-border)] bg-[var(--surface)]")}>
                    {i.found ? <Check className="size-5" /> : <Plus className="size-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">{i.title}</span>
                    <span className="block text-sm text-muted-foreground">{i.found ? "Added" : "Tap to add"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </RecordsWindow>
    </Windows>
  );
}
