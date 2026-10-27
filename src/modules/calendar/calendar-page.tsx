import {
  Bell, CalendarDays, ChevronLeft, ChevronRight, Gift, KeyRound, ListChecks, MoreHorizontal, Plus, Printer, Search, Settings2,
  Share2, Sparkles, Sun, Tv, Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFamilyState } from "@/lib/family-context";
import { readLocal, writeLocal } from "@/lib/local";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";

import { ChoresTab } from "./chores";
import { prefsOf, useCalendarLive, useTerms, type CalEvent } from "./data";
import { DayPanel } from "./day-panel";
import { EventDetail } from "./event-detail";
import { EventEditor, type EditorMode } from "./event-editor";
import { useOccurrences, type Occ } from "./occurrences";
import { RemindersTab } from "./reminders";
import { RoutinesTab } from "./routines";
import { SearchDialog } from "./search";
import { CalendarSettingsDialog } from "./settings";
import { ShareDialog } from "./share";
import { addDays, addMonths, monthName, monthStart, splitKey, todayKey, weekStart } from "./time";
import { allTypes } from "./types";
import { Sheet, Tabs } from "./ui";
import { AgendaView, DayList, monthTitle, MonthView, WeekView } from "./views";
import { WallScreen } from "./wall";
import { useWeather } from "./weather";
import { WishListsTab, type WishTarget } from "./wishlists";

type Tab = "calendar" | "chores" | "routines" | "reminders" | "wishes";
type View = "month" | "week" | "day" | "list";
const VIEW_KEY = "luex.life.cal.view";

export function CalendarPage() {
  const { family, me, role } = useFamilyState();
  const tz = family.timezone;
  const prefs = prefsOf(family);
  const weekStartsOn = prefs.weekStart ?? 1;
  const desktop = useDesktop();
  const today = todayKey(tz);
  useCalendarLive();

  // links from notifications: ?tab=wishes&list=..., ?event=...
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [tab, setTab] = useState<Tab>(() => (["calendar", "chores", "routines", "reminders", "wishes"].includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "calendar"));
  const [view, setViewState] = useState<View>(() => (role === "child" ? "day" : ((readLocal(VIEW_KEY) as View | null) ?? "month")));
  const setView = (v: View) => { setViewState(v); writeLocal(VIEW_KEY, v); };
  const [sel, setSel] = useState(today);
  const [people, setPeople] = useState<string[]>(role === "child" ? [me.id] : []);
  const [openOcc, setOpenOcc] = useState<Occ | null>(null);
  const [daySheet, setDaySheet] = useState(false);
  const [editor, setEditor] = useState<{ open: boolean; mode: EditorMode }>({ open: false, mode: { kind: "new" } });
  const [dialog, setDialog] = useState<null | "search" | "key" | "settings" | "share" | "wall">(null);
  const [wish, setWish] = useState<WishTarget | null>(params.get("list") ? { listId: params.get("list")! } : null);

  // window of days to load
  const [fromK, toK] = useMemo((): [string, string] => {
    if (view === "month") { const s = weekStart(monthStart(sel), weekStartsOn); return [s, addDays(s, 41)]; }
    if (view === "week") { const s = weekStart(sel, weekStartsOn); return [s, addDays(s, 6)]; }
    if (view === "day") return [sel, sel];
    return [today, addDays(today, 60)];
  }, [view, sel, today, weekStartsOn]);
  // the day panel needs the selected day even when the window doesn't cover it
  const { occs, isLoading } = useOccurrences(fromK < sel ? fromK : sel, toK > sel ? toK : sel, people);
  const terms = useTerms();
  const weather = useWeather(family.weather_lat, family.weather_lon, tz);

  // open an event from a notification link
  const eventParam = params.get("event");
  useEffect(() => {
    if (!eventParam) return;
    const o = occs.find((x) => x.event.id === eventParam || x.seriesId === eventParam);
    if (o) { setOpenOcc(o); setSel(o.startDay); window.history.replaceState(null, "", window.location.pathname); }
  }, [eventParam, occs]);

  // keep the open event fresh after changes
  useEffect(() => {
    if (!openOcc) return;
    const fresh = occs.find((o) => o.key === openOcc.key);
    if (fresh && fresh !== openOcc && fresh.event !== openOcc.event) setOpenOcc(fresh);
  }, [occs, openOcc]);

  function step(n: number) {
    setOpenOcc(null);
    if (view === "month") setSel((k) => addMonths(monthStart(k), n));
    else if (view === "week") setSel((k) => addDays(k, 7 * n));
    else if (view === "day") setSel((k) => addDays(k, n));
  }
  const title =
    view === "month" ? monthTitle(sel)
    : view === "week" ? weekTitle(weekStart(sel, weekStartsOn))
    : view === "day" ? (sel === today ? "Today" : sel === addDays(today, 1) ? "Tomorrow" : `${Number(sel.slice(8))} ${monthName(splitKey(sel)[1])}`)
    : "Coming up";

  const shortTitle = view === "month" ? `${monthName(splitKey(sel)[1]).slice(0, 3)} ${sel.slice(0, 4)}` : view === "week" ? `w/c ${Number(weekStart(sel, weekStartsOn).slice(8))} ${monthName(splitKey(weekStart(sel, weekStartsOn))[1]).slice(0, 3)}` : title;
  const openEvent = (o: Occ) => { setOpenOcc(o); setSel(o.startDay); };
  const pickDay = (k: string) => { setSel(k); setOpenOcc(null); if (!desktop) setDaySheet(true); };
  const add = (mode: EditorMode = { kind: "new", dayK: sel }) => setEditor({ open: true, mode });
  const edit = (occ: Occ, series: CalEvent) => setEditor({ open: true, mode: { kind: "edit", occ, series } });
  const copy = (ev: CalEvent) => setEditor({ open: true, mode: { kind: "new", dayK: sel, title: ev.title, type: ev.type as never, people: ev.people } });
  const openWish = (memberId: string | null, occasion: "birthday" | "christmas", year: number) => {
    setWish({ memberId: memberId ?? me.id, occasion, year });
    setOpenOcc(null);
    setTab("wishes");
  };

  const detail = openOcc ? (
    <EventDetail key={openOcc.key} occ={openOcc} onEdit={edit} onCopy={copy} onWishList={openWish} onClosed={() => setOpenOcc(null)} />
  ) : (
    <DayPanel dayK={sel} occs={occs} terms={terms.data ?? []} weather={weather.data?.get(sel)} onOpen={openEvent} onAdd={(m) => add(m)} onTab={setTab} />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="lx-no-print">
        <Tabs<Tab>
          value={tab}
          onChange={(t) => { setTab(t); if (t !== "wishes") setWish(null); }}
          items={[
            { key: "calendar", label: "Calendar", icon: CalendarDays },
            { key: "chores", label: "Chores", icon: Sparkles },
            { key: "routines", label: "Routines", icon: Sun },
            { key: "reminders", label: "Reminders", icon: Bell },
            { key: "wishes", label: "Wish lists", icon: Gift },
          ]}
        />
      </div>

      {tab === "chores" ? <ChoresTab /> : null}
      {tab === "routines" ? <RoutinesTab /> : null}
      {tab === "reminders" ? <RemindersTab onOpenEvent={(o) => { setTab("calendar"); openEvent(o); if (!desktop) setDaySheet(false); }} onAdd={() => add({ kind: "new", dayK: today, type: "reminder" })} /> : null}
      {tab === "wishes" ? <WishListsTab target={wish} onTarget={setWish} /> : null}

      {tab === "calendar" ? (
        <Windows>
          <RecordsWindow className="lx-print-area flex flex-col gap-2 overflow-hidden">
            {/* toolbar */}
            <div className="lx-no-print flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                {view !== "list" ? (
                  <>
                    <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => step(-1)} aria-label="Back"><ChevronLeft className="size-5" /></Button>
                    <Button variant="outline" className="h-10 rounded-full px-3" onClick={() => { setSel(today); setOpenOcc(null); }}>Today</Button>
                    <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => step(1)} aria-label="Forward"><ChevronRight className="size-5" /></Button>
                  </>
                ) : null}
              </div>
              <h2 className="min-w-[7rem] flex-1 truncate text-lg font-bold">
                <span className="sm:hidden">{shortTitle}</span>
                <span className="hidden sm:inline">{title}</span>
              </h2>
              <Button className="h-10 rounded-full px-4 font-semibold" onClick={() => add()}><Plus className="size-4" /> Add</Button>
              <div className="flex w-full items-center gap-2 xl:w-auto">
                <div className="flex rounded-full bg-[var(--surface)] p-0.5" role="group" aria-label="View">
                  {(["month", "week", "day", "list"] as View[]).map((v) => (
                    <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("min-h-9 rounded-full px-3 text-sm font-medium", view === v ? "bg-[var(--tile-active)] text-[var(--tile-active-fg)]" : "text-muted-foreground")}>
                      {{ month: "Month", week: "Week", day: "Day", list: "List" }[v]}
                    </button>
                  ))}
                </div>
                <PeopleFilter value={people} onChange={setPeople} />
                <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={() => setDialog("search")} aria-label="Search"><Search className="size-5" /></Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-10 rounded-full" aria-label="More"><MoreHorizontal className="size-5" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuItem onSelect={() => setDialog("key")}><KeyRound className="mr-2 size-4" /> What the colours mean</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => { if (view !== "week") setView("week"); setTimeout(() => window.print(), 300); }}><Printer className="mr-2 size-4" /> Print this week</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDialog("wall")}><Tv className="mr-2 size-4" /> Kitchen screen mode</DropdownMenuItem>
                    {role === "parent" ? <DropdownMenuItem onSelect={() => setDialog("share")}><Share2 className="mr-2 size-4" /> Share with a babysitter or family</DropdownMenuItem> : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setDialog("settings")}><Settings2 className="mr-2 size-4" /> Calendar settings</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* the view */}
            <div className={cn("min-h-0 flex-1", isLoading && "opacity-60")}>
              {view === "month" ? <MonthView monthK={monthStart(sel)} occs={occs} terms={terms.data ?? []} todayK={today} selected={sel} onSelect={pickDay} weather={weather.data} weekStartsOn={weekStartsOn} /> : null}
              {view === "week" ? <WeekView startK={weekStart(sel, weekStartsOn)} occs={occs} terms={terms.data ?? []} todayK={today} onSelectDay={pickDay} onOpen={openEvent} weather={weather.data} /> : null}
              {view === "day" ? (
                <div className="scrollbar-thin h-full overflow-y-auto pr-1">
                  <DayList dayK={sel} occs={occs} onOpen={openEvent} big />
                  {!desktop ? <div className="mt-4"><DayPanel dayK={sel} occs={occs} terms={terms.data ?? []} weather={weather.data?.get(sel)} onOpen={openEvent} onAdd={(m) => add(m)} onTab={setTab} compact /></div> : null}
                </div>
              ) : null}
              {view === "list" ? <AgendaView fromK={today} toK={addDays(today, 60)} occs={occs} todayK={today} onOpen={openEvent} /> : null}
            </div>
          </RecordsWindow>
          <DetailWindow className="lx-no-print">{detail}</DetailWindow>
        </Windows>
      ) : null}

      {/* phones and tablets: the day and the event open over the calendar */}
      {!desktop ? (
        <>
          <Sheet open={daySheet && !openOcc} onOpenChange={setDaySheet} title={sel === today ? "Today" : `${Number(sel.slice(8))} ${monthName(splitKey(sel)[1])}`}>
            <DayPanel dayK={sel} occs={occs} terms={terms.data ?? []} weather={weather.data?.get(sel)} onOpen={openEvent} onAdd={(m) => { setDaySheet(false); add(m); }} onTab={(t) => { setDaySheet(false); setTab(t); }} hideTitle />
          </Sheet>
          <Sheet open={!!openOcc} onOpenChange={(o) => !o && setOpenOcc(null)} title={openOcc?.event.title ?? ""}>
            {openOcc ? <EventDetail key={openOcc.key} occ={openOcc} onEdit={(o, s) => { setOpenOcc(null); edit(o, s); }} onCopy={(e) => { setOpenOcc(null); copy(e); }} onWishList={openWish} onClosed={() => setOpenOcc(null)} /> : null}
          </Sheet>
        </>
      ) : null}

      <EventEditor
        open={editor.open}
        onOpenChange={(o) => setEditor((x) => ({ ...x, open: o }))}
        mode={editor.mode}
        onSaved={() => { if (editor.mode.kind === "edit") setOpenOcc(null); }}
      />
      <SearchDialog open={dialog === "search"} onOpenChange={(o) => setDialog(o ? "search" : null)} onPick={(k) => { setDialog(null); setSel(k); setView(view === "list" ? "day" : view); if (!desktop) setDaySheet(true); }} />
      <KeyDialog open={dialog === "key"} onOpenChange={(o) => setDialog(o ? "key" : null)} />
      <CalendarSettingsDialog open={dialog === "settings"} onOpenChange={(o) => setDialog(o ? "settings" : null)} />
      {role === "parent" ? <ShareDialog open={dialog === "share"} onOpenChange={(o) => setDialog(o ? "share" : null)} /> : null}
      {dialog === "wall" ? <WallScreen onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function weekTitle(startK: string) {
  const endK = addDays(startK, 6);
  const [, m1, d1] = splitKey(startK);
  const [y2, m2, d2] = splitKey(endK);
  return m1 === m2 ? `${d1}–${d2} ${monthName(m2)} ${y2}` : `${d1} ${monthName(m1).slice(0, 3)} – ${d2} ${monthName(m2).slice(0, 3)} ${y2}`;
}

function PeopleFilter({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { members } = useFamilyState();
  const chosen = members.filter((m) => value.includes(m.id));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex min-h-10 items-center gap-1.5 rounded-full bg-[var(--surface)] px-2.5 text-sm font-medium" aria-label="Whose calendar">
          {chosen.length ? (
            <span className="flex -space-x-1.5">{chosen.slice(0, 3).map((m) => <MemberAvatar key={m.id} member={m} size="sm" className="size-6 text-[10px] ring-1 ring-offset-1" />)}</span>
          ) : <Users className="size-4" />}
          <span className="hidden sm:inline">{chosen.length ? (chosen.length === 1 ? chosen[0].display_name : `${chosen.length} people`) : "Everyone"}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onSelect={() => onChange([])}><Users className="mr-2 size-4" /> Everyone {value.length === 0 ? "✓" : ""}</DropdownMenuItem>
        <DropdownMenuSeparator />
        {members.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={(e) => { e.preventDefault(); onChange(value.includes(m.id) ? value.filter((x) => x !== m.id) : [...value, m.id]); }}>
            <MemberAvatar member={m} size="sm" className="mr-2 size-6 text-[10px] ring-0 ring-offset-0" /> {m.display_name} {value.includes(m.id) ? "✓" : ""}
          </DropdownMenuItem>
        ))}
        <p className="px-2 pb-1 pt-2 text-xs text-muted-foreground">Things for the whole family always show.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function KeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { family } = useFamilyState();
  const types = allTypes(prefsOf(family));
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="What the colours mean">
      <ul className="grid gap-2 sm:grid-cols-2">
        {types.map((t) => {
          const Icon = t.icon;
          return (
            <li key={t.key} className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full text-white" style={{ background: t.colour }}><Icon className="size-5" /></span>
              <span className="font-medium">{t.label}</span>
            </li>
          );
        })}
        <li className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full text-white" style={{ background: "var(--ev-social)" }}><Gift className="size-5" /></span><span className="font-medium">Christmas</span></li>
      </ul>
      <h3 className="mb-2 mt-5 text-sm font-bold">Coloured strip at the top of a day</h3>
      <ul className="space-y-2 text-sm">
        <li className="flex items-center gap-3"><span className="h-2 w-10 rounded-full" style={{ background: "var(--ev-term)" }} /> School term</li>
        <li className="flex items-center gap-3"><span className="h-2 w-10 rounded-full" style={{ background: "var(--ev-holiday)" }} /> School holiday</li>
        <li className="flex items-center gap-3"><span className="h-2 w-10 rounded-full" style={{ background: "var(--ev-inset)" }} /> Inset day</li>
      </ul>
      <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><ListChecks className="size-4" /> Parents can rename the types and change colours in Calendar settings.</p>
    </Sheet>
  );
}
