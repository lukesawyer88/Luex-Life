// "Clubs and people": schools, each child's clubs (ordinary weekly Calendar events) and childcare people.
import { useQueryClient } from "@tanstack/react-query";
import { Baby, CalendarPlus, Pencil, Phone, Plus, School, Trash2, Trophy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { saveEventChanges, type CalEvent } from "@/modules/calendar/data";

import { ClubSheet, daysOfRule } from "./club-sheet";
import {
  COST_EVERY_LABEL, DAY_SHORT, errMsg, money, refreshSchool, timeIn, useSchoolSetup, type Activity, type CalEventRow, type Place,
} from "./data";
import { BookSheet, PlaceSheet } from "./people-sheets";
import type { TabProps } from "./school-page";

function Tel({ phone, name }: { phone: string; name: string }) {
  return (
    <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} onClick={(e) => e.stopPropagation()}
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-[var(--status-green)] px-4 font-semibold text-white" aria-label={`Ring ${name}`}>
      <Phone className="size-4" /> <span className="hidden sm:inline">{phone}</span><span className="sm:hidden">Ring</span>
    </a>
  );
}

export function PeopleTab(_props: TabProps) {
  const { family, members, isParent } = useFamilyState();
  const qc = useQueryClient();
  const setup = useSchoolSetup().data;
  const tz = family.timezone;
  const [placeEdit, setPlaceEdit] = useState<{ kind: Place["kind"]; place: Place | null } | null>(null);
  const [club, setClub] = useState<{ activity: Activity | null; event: CalEventRow | null } | null>(null);
  const [book, setBook] = useState<Place | null>(null);
  if (!setup) return null;

  const children = members.filter((m) => m.role === "child" && !m.archived_at);
  const schools = setup.places.filter((p) => p.kind === "school");
  const sitters = setup.places.filter((p) => p.kind === "childcare");
  const eventOf = (a: Activity) => setup.events.find((e) => e.id === a.event_id) ?? null;
  const placeOf = (id: string | null) => setup.places.find((p) => p.id === id);

  async function removeClub(a: Activity, e: CalEventRow | null) {
    try {
      const { error } = await supabase.from("school_activities").delete().eq("id", a.id);
      if (error) throw error;
      const saved = e ? await saveEventChanges(e as CalEvent, { deleted_at: new Date().toISOString() }, true) : null;
      await refreshSchool(qc, family.id);
      toast(`${e?.title ?? "Club"} removed`, {
        action: {
          label: "Undo",
          onClick: async () => {
            if (saved) await saveEventChanges(saved, { deleted_at: null }, true);
            await supabase.from("school_activities").insert({
              family_id: a.family_id, member_id: a.member_id, place_id: a.place_id, event_id: a.event_id, kit: a.kit, cost: a.cost, cost_every: a.cost_every,
            });
            await refreshSchool(qc, family.id);
          },
        },
      });
    } catch (err) {
      toast.error(errMsg(err));
    }
  }

  return (
    <Windows>
      <RecordsWindow className="space-y-5">
        {/* schools */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex flex-1 items-center gap-2 text-lg font-bold"><School className="size-5" /> Schools</h2>
            {isParent ? <Button data-testid="place-add" variant="outline" className="h-10 rounded-full" onClick={() => setPlaceEdit({ kind: "school", place: null })}><Plus className="size-4" /> Add</Button> : null}
          </div>
          {schools.length ? (
            <ul className="space-y-2">
              {schools.map((p) => (
                <li key={p.id} className="glass-tile flex items-center gap-3 p-3">
                  <button type="button" className="min-w-0 flex-1 text-left" disabled={!isParent} onClick={() => setPlaceEdit({ kind: "school", place: p })}>
                    <span className="block truncate text-base font-semibold">{p.name}</span>
                    {p.notes ? <span className="block truncate text-sm text-muted-foreground">{p.notes}</span> : null}
                  </button>
                  {p.phone ? <Tel phone={p.phone} name={p.name} /> : null}
                </li>
              ))}
            </ul>
          ) : <p className="rounded-2xl bg-[var(--surface)] p-3 text-sm text-muted-foreground">No schools yet.</p>}
        </section>

        {/* clubs */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex flex-1 items-center gap-2 text-lg font-bold"><Trophy className="size-5" /> Clubs and activities</h2>
            {isParent && children.length ? <Button data-testid="club-add" className="h-10 rounded-full px-4 font-semibold" onClick={() => setClub({ activity: null, event: null })}><Plus className="size-4" /> Add</Button> : null}
          </div>
          {!children.length ? <p className="rounded-2xl bg-[var(--surface)] p-3 text-sm text-muted-foreground">Add a child to the family first.</p> : (
            <div className="space-y-3">
              {children.map((c) => {
                const list = setup.activities.filter((a) => a.member_id === c.id && eventOf(a));
                return (
                  <div key={c.id}>
                    <h3 className="mb-1 flex items-center gap-2 text-sm font-bold"><MemberAvatar member={c} size="sm" className="size-6 ring-0 ring-offset-0" /> {c.display_name}</h3>
                    {list.length ? (
                      <ul className="space-y-2">
                        {list.map((a) => {
                          const e = eventOf(a)!;
                          const days = daysOfRule(e.rrule);
                          const driver = members.find((m) => m.id === e.driver);
                          return (
                            <li key={a.id} data-testid="club-row" className="glass-tile flex items-center gap-3 p-3">
                              <button type="button" className="min-w-0 flex-1 text-left" disabled={!isParent} onClick={() => setClub({ activity: a, event: e })}>
                                <span className="block truncate text-base font-semibold">{e.title}</span>
                                <span className="block text-sm text-muted-foreground">
                                  {days.length ? days.map((d) => DAY_SHORT[d]).join(", ") : "Once"} · {timeIn(e.starts_at, tz)}–{timeIn(e.ends_at, tz)}
                                  {e.location ? ` · ${e.location}` : placeOf(a.place_id) ? ` · ${placeOf(a.place_id)!.name}` : ""}
                                </span>
                                <span className="block text-sm text-muted-foreground">
                                  {[driver ? `${driver.display_name} takes them` : null, a.kit.length ? `Bring: ${a.kit.join(", ")}` : null,
                                    a.cost != null ? `${money(a.cost)}${a.cost_every ? ` ${COST_EVERY_LABEL[a.cost_every]}` : ""}` : null].filter(Boolean).join(" · ")}
                                </span>
                              </button>
                              {isParent ? (
                                <div className="flex shrink-0 gap-1">
                                  <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label={`Change ${e.title}`} onClick={() => setClub({ activity: a, event: e })}><Pencil className="size-4" /></Button>
                                  <Button variant="ghost" size="icon" className="size-11 rounded-full text-[var(--status-red)]" aria-label={`Remove ${e.title}`} onClick={() => void removeClub(a, e)}><Trash2 className="size-4" /></Button>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : <p className="rounded-2xl bg-[var(--surface)] p-3 text-sm text-muted-foreground">No clubs yet.</p>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* childcare */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex flex-1 items-center gap-2 text-lg font-bold"><Baby className="size-5" /> Babysitters and childminders</h2>
            {isParent ? <Button data-testid="sitter-add" variant="outline" className="h-10 rounded-full" onClick={() => setPlaceEdit({ kind: "childcare", place: null })}><Plus className="size-4" /> Add</Button> : null}
          </div>
          {sitters.length ? (
            <ul className="space-y-2">
              {sitters.map((p) => (
                <li key={p.id} className="glass-tile flex flex-wrap items-center gap-3 p-3">
                  <button type="button" className="min-w-0 flex-1 text-left" disabled={!isParent} onClick={() => setPlaceEdit({ kind: "childcare", place: p })}>
                    <span className="block truncate text-base font-semibold">{p.name}</span>
                    {p.notes ? <span className="block truncate text-sm text-muted-foreground">{p.notes}</span> : null}
                  </button>
                  <div className="flex shrink-0 gap-2">
                    {p.phone ? <Tel phone={p.phone} name={p.name} /> : null}
                    <Button data-testid="sitter-book" variant="outline" className="h-11 rounded-full" onClick={() => setBook(p)}><CalendarPlus className="size-4" /> Book them</Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="rounded-2xl bg-[var(--surface)] p-3 text-sm text-muted-foreground">No babysitters yet.</p>}
        </section>
      </RecordsWindow>
      <DetailWindow>
        <h3 className="mb-2 text-sm font-semibold">How it works</h3>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>Clubs go straight onto the family calendar, every week on their days.</li>
          <li>What they need to bring shows on the day, in the morning summary.</li>
          <li>Booking a babysitter puts it on the calendar too.</li>
        </ol>
      </DetailWindow>
      <PlaceSheet value={placeEdit} onClose={() => setPlaceEdit(null)} />
      <ClubSheet value={club} onClose={() => setClub(null)} />
      <BookSheet place={book} onClose={() => setBook(null)} />
    </Windows>
  );
}
