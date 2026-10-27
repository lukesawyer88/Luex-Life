import { RecordsWindow, Windows } from "@/components/page-parts";

import type { FoodTarget } from "./food-page";

export function PlanTab(_: { target: FoodTarget; onGo: (t: FoodTarget) => void }) {
  return <Windows><RecordsWindow><p className="text-sm">Coming next.</p></RecordsWindow></Windows>;
}
