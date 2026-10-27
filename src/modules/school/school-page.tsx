import { CalendarDays, ListTodo, Loader2, Settings2, Sun, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useFamilyState } from "@/lib/family-context";
import { Tabs } from "@/modules/calendar/ui";

import { useSchoolLive, useSchoolSetup } from "./data";
import { PeopleTab } from "./people";
import { SchoolSettingsDialog } from "./settings";
import { TasksTab } from "./tasks";
import { TodayTab } from "./today";
import { WeekTab } from "./week";

export type SchoolTab = "today" | "week" | "todo" | "people";
export type SchoolTarget = { tab: SchoolTab; childId?: string; taskId?: string };
export type TabProps = { target: SchoolTarget; onGo: (t: SchoolTarget) => void };

function fromUrl(): Partial<SchoolTarget> {
  const p = new URLSearchParams(window.location.search);
  const t: Partial<SchoolTarget> = {};
  const tab = p.get("tab");
  if (tab === "todo" || tab === "week" || tab === "people") t.tab = tab;
  if ([...p.keys()].length) window.history.replaceState(null, "", window.location.pathname);
  return t;
}

export function SchoolPage() {
  useSchoolLive();
  const { role } = useFamilyState();
  const setup = useSchoolSetup();
  const first = useMemo(fromUrl, []);
  const [target, setTarget] = useState<SchoolTarget>({ tab: first.tab ?? "today" });
  const [showSettings, setShowSettings] = useState(false);

  if (setup.isLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (setup.isError) return <div className="grid flex-1 place-items-center p-6 text-center text-sm">School couldn't open. Check your signal and try again.</div>;

  const items: { key: SchoolTab; label: string; icon: typeof Sun }[] = [
    { key: "today", label: "Today", icon: Sun },
    { key: "week", label: "The week", icon: CalendarDays },
    { key: "todo", label: role === "child" ? "Homework" : "To do", icon: ListTodo },
  ];
  if (role !== "child") items.push({ key: "people", label: "Clubs and people", icon: Users });
  const tab = items.some((i) => i.key === target.tab) ? target.tab : "today";
  const t = { ...target, tab };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <Tabs<SchoolTab> value={tab} onChange={(k) => setTarget({ tab: k })} items={items} />
        </div>
        <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" onClick={() => setShowSettings(true)} aria-label="School settings"><Settings2 className="size-5" /></Button>
      </div>
      {tab === "today" ? <TodayTab target={t} onGo={setTarget} /> : null}
      {tab === "week" ? <WeekTab target={t} onGo={setTarget} /> : null}
      {tab === "todo" ? <TasksTab target={t} onGo={setTarget} /> : null}
      {tab === "people" ? <PeopleTab target={t} onGo={setTarget} /> : null}
      <SchoolSettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </div>
  );
}
