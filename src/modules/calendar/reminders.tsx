import { useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { cn } from "@/lib/utils";

import { saveEventChanges } from "./data";
import { canEditEvent } from "./event-detail";
import { useOccurrences, type Occ } from "./occurrences";
import { addDays, shortDate, todayKey } from "./time";
import { Empty } from "./ui";
import { EventRow } from "./views";

/** Reminders: what's overdue, today, coming up and recently done */
export function RemindersTab({ onOpenEvent, onAdd }: { onOpenEvent: (o: Occ) => void; onAdd: () => void }) {
  const { family, me, isParent } = useFamilyState();
  const qc = useQueryClient();
  const today = todayKey(family.timezone);
  const { occs, isLoading } = useOccurrences(addDays(today, -30), addDays(today, 90), []);
  const [busy, setBusy] = useState<string | null>(null);

  const groups = useMemo(() => {
    const rs = occs.filter((o) => o.event.type === "reminder");
    return [
      { key: "overdue", title: "Overdue", list: rs.filter((o) => !o.event.done_at && o.startDay < today) },
      { key: "today", title: "Today", list: rs.filter((o) => !o.event.done_at && o.startDay === today) },
      { key: "soon", title: "Coming up", list: rs.filter((o) => !o.event.done_at && o.startDay > today) },
      { key: "done", title: "Done", list: rs.filter((o) => !!o.event.done_at).reverse() },
    ];
  }, [occs, today]);

  async function toggle(o: Occ) {
    setBusy(o.key);
    try {
      await saveEventChanges(o.event, { done_at: o.event.done_at ? null : new Date().toISOString() }, true);
      await qc.invalidateQueries({ queryKey: ["cal", family.id] });
      if (!o.event.done_at) toast.success("Done");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  const empty = groups.every((g) => g.list.length === 0);

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 flex-1 text-lg font-bold">Reminders</h2>
          <Button className="h-11 rounded-full px-5 font-semibold" onClick={onAdd}><Plus className="size-4" /> Add a reminder</Button>
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {!isLoading && empty ? (
          <Empty icon={Bell} title="No reminders">Add one for bins, payments, forms to sign or anything else you mustn't forget.</Empty>
        ) : null}
        {groups.map((g) =>
          g.list.length ? (
            <section key={g.key}>
              <h3 className={cn("mb-1.5 text-xs font-bold uppercase tracking-wide", g.key === "overdue" ? "text-[var(--status-red)]" : "text-muted-foreground")}>
                {g.title} ({g.list.length})
              </h3>
              <div className="flex flex-col gap-1.5">
                {g.list.map((o) => {
                  const can = canEditEvent(o.event, me.id, isParent);
                  return (
                    <div key={o.key} className="flex items-center gap-2">
                      {can ? (
                        <button
                          type="button"
                          onClick={() => toggle(o)}
                          disabled={busy === o.key}
                          aria-label={o.event.done_at ? `Mark ${o.event.title} as not done` : `Mark ${o.event.title} as done`}
                          aria-pressed={!!o.event.done_at}
                          className={cn(
                            "grid size-11 shrink-0 place-items-center rounded-full border-2 transition",
                            o.event.done_at ? "border-transparent bg-[var(--status-green)] text-white" : "border-[var(--surface-border)] bg-[var(--surface)] hover:bg-muted",
                          )}
                        >
                          <Check className="size-5" />
                        </button>
                      ) : <span className="size-11 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <EventRow occ={o} onOpen={onOpenEvent} dayK={o.startDay} />
                      </div>
                      {g.key !== "today" ? <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground sm:block">{shortDate(o.startDay)}</span> : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null,
        )}
      </RecordsWindow>
      <DetailWindow>
        <h3 className="mb-2 text-sm font-semibold">How reminders work</h3>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>Add a reminder with a date and time.</li>
          <li>It pops up as a notification on any phone where notifications are turned on (Calendar settings).</li>
          <li>Tick it when it's done. Anything not ticked shows as overdue.</li>
        </ol>
      </DetailWindow>
    </Windows>
  );
}
