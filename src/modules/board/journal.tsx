import { RecordsWindow, Windows } from "@/components/page-parts";

import type { BoardTarget } from "./board-page";

export function JournalTab(_: { target: BoardTarget; onGo: (t: BoardTarget) => void }) {
  return <Windows><RecordsWindow><p className="text-sm">Coming next.</p></RecordsWindow></Windows>;
}
