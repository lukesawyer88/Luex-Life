import { useParams } from "@tanstack/react-router";
import { Hammer } from "lucide-react";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { useFamilyState } from "@/lib/family-context";
import { BoardPage } from "@/modules/board/board-page";
import { CalendarPage } from "@/modules/calendar/calendar-page";
import { FoodPage } from "@/modules/food/food-page";
import { MODULE_BY_KEY } from "@/modules/registry";

/** Placeholder for a module that is planned but not built yet. Real modules replace this per key. */
export function ModulePage() {
  const { key } = useParams({ from: "/app/m/$key" });
  const { role, switchedOff } = useFamilyState();
  const m = MODULE_BY_KEY[key];

  if (!m || (m.audience === "parents" && role !== "parent") || (m.canSwitchOff && switchedOff.has(m.key))) {
    return (
      <Windows>
        <RecordsWindow>
          <p className="text-sm">This page isn't available. Use the menu to pick something else.</p>
        </RecordsWindow>
      </Windows>
    );
  }
  if (m.key === "calendar") return <CalendarPage />;
  if (m.key === "board") return <BoardPage />;
  if (m.key === "food") return <FoodPage />;
  const Icon = m.icon;
  return (
    <Windows>
      <RecordsWindow>
        <div className="flex h-full flex-col items-center justify-center text-center">
          <span className="mb-3 grid size-14 place-items-center rounded-2xl bg-[var(--status-blue-soft)] text-[var(--status-blue)]"><Icon className="size-7" /></span>
          <h2 className="text-lg font-bold">{m.name}</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{m.summary}</p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--status-amber-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--status-amber)]">
            <Hammer className="size-3.5" />
            {m.wave === 1 ? "Planned for the first release" : "Planned for after launch"}
          </p>
        </div>
      </RecordsWindow>
      <DetailWindow>
        <h3 className="mb-2 text-sm font-semibold">What will be here</h3>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          {m.includes.map((x) => <li key={x}>{x}</li>)}
        </ol>
      </DetailWindow>
    </Windows>
  );
}
