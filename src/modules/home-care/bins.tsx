// Bins: what goes out when and whose turn it is. Each bin is typed in once; one collection can be moved, skipped or swapped.
import { useQueryClient } from "@tanstack/react-query";
import { CalendarX2, MoveRight, Plus, Repeat, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Empty, Field, Sheet } from "@/modules/calendar/ui";

import { BIN_COLOURS, addDays, binHex, collections, dayWords, errMsg, refreshHome, todayIn, useBins, type Bin, type Collection } from "./data";

export function BinsTab() {
  const { family, members, role } = useFamilyState();
  const q = useBins();
  const today = todayIn(family.timezone);
  const [edit, setEdit] = useState<Bin | "new" | null>(null);
  const [change, setChange] = useState<Collection | null>(null);
  const grownUp = role !== "child";
  const data = q.data ?? { bins: [], changes: [] };
  const list = collections(data, today, 28);
  const days = [...new Set(list.map((c) => c.on))];
  const name = (id: string | null) => members.find((m) => m.id === id);

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Bin days</h2>
          {grownUp ? <Button data-testid="bin-add" className="h-11 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-5" /> Bin</Button> : null}
        </div>
        {q.isLoading ? null : !data.bins.length ? (
          <Empty icon={Trash2} title="No bins yet">
            {grownUp ? "Add each bin once, like “Black bin, every other Tuesday”. Whoever's turn it is gets a reminder the night before." : "A grown-up can add the bins here."}
          </Empty>
        ) : (
          <div className="space-y-4" data-testid="bin-days">
            {days.map((d) => (
              <section key={d}>
                <h3 className={cn("mb-2 text-sm font-bold", d === addDays(today, 1) && "text-[var(--status-blue)]")}>{d === addDays(today, 1) ? "Tomorrow: put them out tonight" : dayWords(d, today)}</h3>
                <ul className="space-y-2">
                  {list.filter((c) => c.on === d).map((c) => {
                    const who = name(c.who);
                    return (
                      <li key={c.bin.id + c.normal} className="glass-tile flex items-center gap-3 p-3" data-testid="bin-row">
                        <span className="size-9 shrink-0 rounded-xl" style={{ background: binHex(c.bin.colour) }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-semibold">{c.bin.name}</span>
                          <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                            {who ? <span className="inline-flex items-center gap-1"><MemberAvatar member={who} size="sm" className="size-5 ring-0 ring-offset-0" />{who.display_name}'s turn</span> : <span>Anyone</span>}
                            {c.moved ? <span className="font-semibold text-[var(--status-amber)]">Moved from {dayWords(c.normal, today)}</span> : null}
                          </span>
                        </span>
                        {grownUp ? <Button variant="outline" data-testid="bin-change" className="h-10 rounded-full" onClick={() => setChange(c)}>Change</Button> : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {!days.length ? <p className="text-sm text-muted-foreground">No collections in the next four weeks.</p> : null}
          </div>
        )}
      </RecordsWindow>
      <DetailWindow>
        <h3 className="mb-2 text-base font-bold">The bins</h3>
        <ul className="space-y-2">
          {data.bins.map((b) => (
            <li key={b.id}>
              <button type="button" disabled={!grownUp} onClick={() => setEdit(b)} className="glass-tile flex w-full items-center gap-3 p-3 text-left disabled:cursor-default">
                <span className="size-6 shrink-0 rounded-lg" style={{ background: binHex(b.colour) }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{b.name}</span>
                  <span className="block text-sm text-muted-foreground">{b.every_weeks === 1 ? "Every week" : b.every_weeks === 2 ? "Every other week" : `Every ${b.every_weeks} weeks`}{b.notes ? ` · ${b.notes}` : ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DetailWindow>
      <Sheet open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} title={edit === "new" ? "Add a bin" : "Change the bin"}>
        {edit !== null ? <BinForm key={edit === "new" ? "new" : edit.id} existing={edit === "new" ? null : edit} today={today} onClose={() => setEdit(null)} /> : null}
      </Sheet>
      <Sheet open={change !== null} onOpenChange={(o) => !o && setChange(null)} title={change ? `${change.bin.name}, ${dayWords(change.normal, today)}` : ""}>
        {change ? <ChangeForm c={change} today={today} existing={data.changes.find((x) => x.bin_id === change.bin.id && x.on_date === change.normal) ?? null} onClose={() => setChange(null)} /> : null}
      </Sheet>
    </Windows>
  );
}

function grownUpsAndChildren(members: ReturnType<typeof useFamilyState>["members"], isParent: boolean) {
  return members.filter((m) => !m.archived_at && (m.role !== "child" || isParent));
}

function BinForm({ existing, today, onClose }: { existing: Bin | null; today: string; onClose: () => void }) {
  const { family, members, isParent } = useFamilyState();
  const qc = useQueryClient();
  const [name, setName] = useState(existing?.name ?? "");
  const [colour, setColour] = useState<Bin["colour"]>(existing?.colour ?? "black");
  const [every, setEvery] = useState(existing?.every_weeks ?? 1);
  const [first, setFirst] = useState(existing?.first_on ?? "");
  const [people, setPeople] = useState<string[]>(existing?.people ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const choices = grownUpsAndChildren(members, isParent);

  async function save() {
    if (!first) return void toast.error("Pick the next collection day");
    setBusy(true);
    try {
      const row = { name: name.trim(), colour, every_weeks: every, first_on: first, people, notes: notes.trim() };
      const { error } = existing
        ? await supabase.from("hc_bins").update(row).eq("id", existing.id)
        : await supabase.from("hc_bins").insert({ ...row, family_id: family.id });
      if (error) throw error;
      await refreshHome(qc, family.id);
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing || !window.confirm(`Remove ${existing.name}?`)) return;
    const { error } = await supabase.from("hc_bins").update({ archived_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) return void toast.error(errMsg(error));
    await refreshHome(qc, family.id);
    onClose();
  }

  return (
    <div className="space-y-4">
      <Field label="Which bin?"><Input data-testid="bin-name" data-autofocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Black bin" className="h-12 text-base" /></Field>
      <Field label="Colour">
        <div className="flex flex-wrap gap-2">
          {BIN_COLOURS.map((c) => (
            <Chip key={c.key} on={colour === c.key} onClick={() => setColour(c.key)} className="min-h-11">
              <span className="size-4 rounded" style={{ background: c.hex }} aria-hidden /> {c.label}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="How often?">
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((n) => <Chip key={n} on={every === n} onClick={() => setEvery(n)} className="min-h-11 text-base">{n === 1 ? "Every week" : n === 2 ? "Every other week" : `Every ${n} weeks`}</Chip>)}
        </div>
      </Field>
      <Field label="Next collection day" hint="Luex works out the rest from this">
        <Input data-testid="bin-first" type="date" min={addDays(today, -60)} value={first} onChange={(e) => setFirst(e.target.value)} className="h-12 w-48 text-base" />
      </Field>
      <Field label="Who puts it out?" hint="Pick more than one to take turns. Pick nobody and every grown-up gets the reminder.">
        <div className="flex flex-wrap gap-2" data-testid="bin-people">
          {choices.map((m) => {
            const on = people.includes(m.id);
            return (
              <Chip key={m.id} on={on} onClick={() => setPeople(on ? people.filter((x) => x !== m.id) : [...people, m.id])} className="min-h-11 text-base">
                <MemberAvatar member={m} size="sm" className="size-6 ring-0 ring-offset-0" /> {m.display_name}{on && people.length > 1 ? ` (${people.indexOf(m.id) + 1})` : ""}
              </Chip>
            );
          })}
        </div>
      </Field>
      <Field label="Note" hint="Optional, for example “Out by 7am” or “Lid must close”">
        <Input value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} className="h-12 text-base" />
      </Field>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-testid="bin-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
        {existing ? <Button variant="ghost" className="h-12 rounded-full text-[var(--status-red)]" onClick={() => void remove()}><Trash2 className="size-4" /> Remove</Button> : null}
      </div>
    </div>
  );
}

function ChangeForm({ c, today, existing, onClose }: { c: Collection; today: string; existing: { move_to: string | null; skip: boolean; who: string | null } | null; onClose: () => void }) {
  const { family, members, isParent } = useFamilyState();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"swap" | "move" | "skip">(existing?.skip ? "skip" : existing?.move_to ? "move" : "swap");
  const [who, setWho] = useState<string | null>(existing?.who ?? c.who);
  const [moveTo, setMoveTo] = useState(existing?.move_to ?? addDays(c.normal, 1));
  const [busy, setBusy] = useState(false);
  const choices = grownUpsAndChildren(members, isParent);

  async function save() {
    setBusy(true);
    try {
      const row = { who, move_to: mode === "move" ? moveTo : null, skip: mode === "skip" };
      const { error } = existing
        ? await supabase.from("hc_bin_changes").update(row).eq("bin_id", c.bin.id).eq("on_date", c.normal)
        : await supabase.from("hc_bin_changes").insert({ ...row, bin_id: c.bin.id, family_id: family.id, on_date: c.normal });
      if (error) throw error;
      await refreshHome(qc, family.id);
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    const { error } = await supabase.from("hc_bin_changes").delete().eq("bin_id", c.bin.id).eq("on_date", c.normal);
    if (error) return void toast.error(errMsg(error));
    await refreshHome(qc, family.id);
    onClose();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Chip on={mode === "swap"} onClick={() => setMode("swap")} className="min-h-11 text-base"><Repeat className="size-4" /> Someone else</Chip>
        <Chip on={mode === "move"} onClick={() => setMode("move")} className="min-h-11 text-base"><MoveRight className="size-4" /> Different day</Chip>
        <Chip on={mode === "skip"} onClick={() => setMode("skip")} className="min-h-11 text-base"><CalendarX2 className="size-4" /> Not collected</Chip>
      </div>
      {mode !== "skip" ? (
        <Field label="Who's putting it out?">
          <div className="flex flex-wrap gap-2" data-testid="change-who">
            {choices.map((m) => (
              <Chip key={m.id} on={who === m.id} onClick={() => setWho(m.id)} className="min-h-11 text-base">
                <MemberAvatar member={m} size="sm" className="size-6 ring-0 ring-offset-0" /> {m.display_name}
              </Chip>
            ))}
          </div>
        </Field>
      ) : <p className="text-base">This collection won't happen, and nobody gets a reminder for it.</p>}
      {mode === "move" ? (
        <Field label="Collected on" hint="For bank holidays, up to two weeks either way">
          <Input data-testid="change-date" type="date" min={addDays(c.normal, -14)} max={addDays(c.normal, 14)} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="h-12 w-48 text-base" />
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button data-testid="change-save" className="h-12 flex-1 rounded-full text-base font-semibold" disabled={busy || (mode === "move" && (!moveTo || moveTo < today))} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" className="h-12 rounded-full" onClick={onClose}>Cancel</Button>
        {existing ? <Button variant="ghost" className="h-12 rounded-full" onClick={() => void undo()}>Back to normal</Button> : null}
      </div>
    </div>
  );
}
