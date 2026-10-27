// School settings: each child's school, class, teacher and school day (parents); the morning summary (everyone).
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { Field, Sheet } from "@/modules/calendar/ui";

import { errMsg, hhmm, refreshSchool, setMyMorning, useMyMorning, useSchoolSetup, type Place } from "./data";

export function SchoolSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { family, members, me, isParent } = useFamilyState();
  const qc = useQueryClient();
  const morning = useMyMorning();
  const setup = useSchoolSetup().data;
  const children = members.filter((m) => m.role === "child" && !m.archived_at);

  async function toggleMorning(on: boolean) {
    try {
      await setMyMorning(family.id, me.id, on);
      await refreshSchool(qc, family.id);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="School settings" wide>
      <div className="space-y-6">
        <section className="glass-tile flex min-h-14 items-center gap-3 p-4">
          <Label htmlFor="school-morning" className="flex-1 text-base font-semibold">
            Morning summary at 7am
            <span className="block text-sm font-normal text-muted-foreground">What to bring, clubs, the school run and what's due, in one message.</span>
          </Label>
          <Switch id="school-morning" data-testid="morning-switch" checked={morning.data ?? true} disabled={morning.isLoading} onCheckedChange={(v) => void toggleMorning(v)} />
        </section>

        {isParent && setup ? (
          children.length ? (
            children.map((c) => <ChildSchool key={c.id} child={c} places={setup.places.filter((p) => p.kind === "school")} />)
          ) : (
            <p className="text-sm text-muted-foreground">Add a child in Family to set up their school.</p>
          )
        ) : !isParent ? (
          <p className="text-sm text-muted-foreground">A parent sets up schools and the school week.</p>
        ) : null}
      </div>
    </Sheet>
  );
}

function ChildSchool({ child, places }: { child: Member; places: Place[] }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const setup = useSchoolSetup().data!;
  const current = setup.children.find((c) => c.member_id === child.id);
  const [placeId, setPlaceId] = useState<string>(current?.place_id ?? (places[0]?.id ?? "new"));
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [className, setClassName] = useState(current?.class_name ?? "");
  const [teacher, setTeacher] = useState(current?.teacher ?? "");
  const [starts, setStarts] = useState(hhmm(current?.day_starts));
  const [ends, setEnds] = useState(hhmm(current?.day_ends));
  const [busy, setBusy] = useState(false);
  const adding = placeId === "new";

  async function save() {
    setBusy(true);
    try {
      let pid: string | null = adding ? null : placeId;
      if (adding && newName.trim()) {
        const { data, error } = await supabase.from("school_places")
          .insert({ family_id: family.id, name: newName.trim().slice(0, 80), kind: "school", phone: newPhone.trim().slice(0, 40) || null })
          .select("id").single();
        if (error) throw error;
        pid = (data as { id: string }).id;
      }
      const row = { place_id: pid, class_name: className.trim() || null, teacher: teacher.trim() || null, day_starts: starts || null, day_ends: ends || null };
      const r = current
        ? await supabase.from("school_children").update(row).eq("member_id", child.id)
        : await supabase.from("school_children").insert({ member_id: child.id, family_id: family.id, ...row });
      if (r.error) throw r.error;
      await refreshSchool(qc, family.id);
      if (pid) setPlaceId(pid);
      setNewName(""); setNewPhone("");
      toast.success(`${child.display_name}'s school saved`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass-tile space-y-4 p-4">
      <h3 className="flex items-center gap-2 text-base font-bold"><MemberAvatar member={child} size="sm" className="ring-0 ring-offset-0" /> {child.display_name}</h3>
      <Field label="School">
        <select
          data-testid="set-school"
          value={placeId}
          onChange={(e) => setPlaceId(e.target.value)}
          className="h-11 w-full rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] px-3 text-base"
        >
          {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="new">Add a school…</option>
        </select>
      </Field>
      {adding ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="School name"><Input data-testid="set-school-name" value={newName} maxLength={80} placeholder="Oak Primary" onChange={(e) => setNewName(e.target.value)} className="h-11" /></Field>
          <Field label="Phone" hint="Optional"><Input value={newPhone} maxLength={40} inputMode="tel" onChange={(e) => setNewPhone(e.target.value)} className="h-11" /></Field>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Class"><Input data-testid="set-class" value={className} maxLength={60} placeholder="Year 3" onChange={(e) => setClassName(e.target.value)} className="h-11" /></Field>
        <Field label="Teacher"><Input data-testid="set-teacher" value={teacher} maxLength={60} placeholder="Mrs Lee" onChange={(e) => setTeacher(e.target.value)} className="h-11" /></Field>
        <Field label="School starts"><Input type="time" value={starts} onChange={(e) => setStarts(e.target.value)} className="h-11 w-36" /></Field>
        <Field label="School ends"><Input type="time" value={ends} onChange={(e) => setEnds(e.target.value)} className="h-11 w-36" /></Field>
      </div>
      <Button data-testid="set-save" className="h-11 rounded-full px-6 font-semibold" disabled={busy || (adding && !newName.trim() && !current)} onClick={() => void save()}>
        {busy ? "Saving…" : "Save"}
      </Button>
      <p className="text-xs text-muted-foreground">What they bring each day and who does the school run are set in The week.</p>
    </section>
  );
}
