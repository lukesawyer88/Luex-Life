import { useParams } from "@tanstack/react-router";
import { Hammer, Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";

import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { useFamilyState } from "@/lib/family-context";
import { MODULE_BY_KEY, audienceAllows } from "@/modules/registry";

// each module loads only when it is opened (keeps the first download small)
const CalendarPage = lazy(() => import("@/modules/calendar/calendar-page").then((m) => ({ default: m.CalendarPage })));
const BoardPage = lazy(() => import("@/modules/board/board-page").then((m) => ({ default: m.BoardPage })));
const FoodPage = lazy(() => import("@/modules/food/food-page").then((m) => ({ default: m.FoodPage })));
const MoneyPage = lazy(() => import("@/modules/money/money-page").then((m) => ({ default: m.MoneyPage })));
const RewardsPage = lazy(() => import("@/modules/rewards/rewards-page").then((m) => ({ default: m.RewardsPage })));
const SchoolPage = lazy(() => import("@/modules/school/school-page").then((m) => ({ default: m.SchoolPage })));

function Loading() {
  return <div className="grid flex-1 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
}

/** Placeholder for a module that is planned but not built yet. Real modules replace this per key. */
export function ModulePage() {
  const { key } = useParams({ from: "/app/m/$key" });
  const { role, switchedOff } = useFamilyState();
  const m = MODULE_BY_KEY[key];

  if (!m || !audienceAllows(m, role) || (m.canSwitchOff && switchedOff.has(m.key))) {
    return (
      <Windows>
        <RecordsWindow>
          <p className="text-sm">This page isn't available. Use the menu to pick something else.</p>
        </RecordsWindow>
      </Windows>
    );
  }
  if (m.key === "calendar") return <Suspense fallback={<Loading />}><CalendarPage /></Suspense>;
  if (m.key === "board") return <Suspense fallback={<Loading />}><BoardPage /></Suspense>;
  if (m.key === "food") return <Suspense fallback={<Loading />}><FoodPage /></Suspense>;
  if (m.key === "money") return <Suspense fallback={<Loading />}><MoneyPage /></Suspense>;
  if (m.key === "pocket") return <Suspense fallback={<Loading />}><RewardsPage /></Suspense>;
  if (m.key === "school") return <Suspense fallback={<Loading />}><SchoolPage /></Suspense>;
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
