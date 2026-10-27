// Takeaway favourites: each place's number and link, and everyone's usual order together for reading out on the phone.
import { useQueryClient } from "@tanstack/react-query";
import { Archive, Bike, CalendarPlus, ExternalLink, Pencil, Phone, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { friendlyError, type Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { useDesktop } from "@/lib/use-desktop";
import { cn } from "@/lib/utils";
import { Empty, Field, Sheet } from "@/modules/calendar/ui";

import { refreshFood, todayIn, useTakeaways, type Takeaway, type TakeawayOrder } from "./data";
import type { FoodTarget } from "./food-page";
import { dayLong } from "./plan-helpers";

export function TakeawaysTab({ onGo }: { target: FoodTarget; onGo: (t: FoodTarget) => void }) {
  const { role } = useFamilyState();
  const desktop = useDesktop();
  const q = useTakeaways();
  const takeaways = q.data?.takeaways ?? [];
  const orders = q.data?.orders ?? [];
  const adult = role !== "child";
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Takeaway | "new" | null>(null);
  const open = takeaways.find((t) => t.id === openId) ?? null;

  useEffect(() => {
    if (desktop && !openId && takeaways.length) setOpenId(takeaways[0].id);
  }, [desktop, openId, takeaways]);

  const detail = open ? <TakeawayDetail t={open} orders={orders.filter((o) => o.takeaway_id === open.id)} onEdit={() => setEdit(open)} onGo={onGo} onClosed={() => setOpenId(null)} /> : (
    <Empty icon={Bike} title="Pick a takeaway">Everyone's usual order shows here.</Empty>
  );

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Takeaways</h2>
          {adult ? <Button className="h-10 rounded-full px-4 font-semibold" onClick={() => setEdit("new")}><Plus className="size-4" /> Add a takeaway</Button> : null}
        </div>
        {takeaways.length ? (
          <ul className="space-y-2">
            {takeaways.map((t) => {
              const n = orders.filter((o) => o.takeaway_id === t.id).length;
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => setOpenId(t.id)} className={cn("glass-tile flex min-h-14 w-full items-center gap-3 p-3 text-left", openId === t.id && "ring-2 ring-[var(--status-blue)]")}>
                    <span className="grid size-10 place-items-center rounded-full bg-[var(--surface)]"><Bike className="size-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{t.name}</span>
                      <span className="text-xs text-muted-foreground">{n} usual {n === 1 ? "order" : "orders"}{t.last_ordered ? ` · last ordered ${dayLong(t.last_ordered)}` : ""}</span>
                    </span>
                    {t.phone ? <a href={`tel:${t.phone.replace(/[^\d+]/g, "")}`} onClick={(e) => e.stopPropagation()} className="grid size-11 place-items-center rounded-full bg-[var(--status-green-soft)] text-[var(--status-green)]" aria-label={`Ring ${t.name}`}><Phone className="size-5" /></a> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty icon={Bike} title="No takeaways yet">{adult ? "Add your favourite takeaways, and everyone's usual order." : "A grown-up can add the family's favourite takeaways."}</Empty>
        )}
      </RecordsWindow>
      <DetailWindow>{detail}</DetailWindow>
      {!desktop ? (
        <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)} title={open?.name ?? ""}>
          {open ? <TakeawayDetail t={open} orders={orders.filter((o) => o.takeaway_id === open.id)} onEdit={() => setEdit(open)} onGo={onGo} onClosed={() => setOpenId(null)} hideTitle /> : null}
        </Sheet>
      ) : null}
      <EditTakeaway value={edit} onClose={() => setEdit(null)} onSaved={(id) => { setEdit(null); setOpenId(id); }} />
    </Windows>
  );
}

function TakeawayDetail({ t, orders, onEdit, onGo, onClosed, hideTitle }: {
  t: Takeaway; orders: TakeawayOrder[]; onEdit: () => void; onGo: (x: FoodTarget) => void; onClosed: () => void; hideTitle?: boolean;
}) {
  const { family, members, me, role, isParent } = useFamilyState();
  const qc = useQueryClient();
  const adult = role !== "child";
  const today = todayIn(family.timezone);

  async function ordered(addToPlan: boolean) {
    const { error } = await supabase.from("food_takeaways").update({ last_ordered: today }).eq("id", t.id);
    if (error) { toast.error(friendlyError(error)); return; }
    if (addToPlan) {
      const { error: e } = await supabase.from("food_plan").insert({ family_id: family.id, day: today, slot: "dinner", title: `Takeaway: ${t.name}`.slice(0, 120), takeaway_id: t.id });
      if (e) { toast.error(friendlyError(e)); return; }
    }
    await refreshFood(qc, family.id);
    toast.success(addToPlan ? "Added to tonight's dinner" : "Noted", addToPlan ? { action: { label: "See plan", onClick: () => onGo({ tab: "plan" }) } } : undefined);
  }

  async function archive() {
    const { error } = await supabase.from("food_takeaways").update({ archived_at: new Date().toISOString() }).eq("id", t.id);
    if (error) { toast.error(friendlyError(error)); return; }
    await refreshFood(qc, family.id);
    onClosed();
    toast("Takeaway put away", { action: { label: "Undo", onClick: async () => { await supabase.from("food_takeaways").update({ archived_at: null }).eq("id", t.id); await refreshFood(qc, family.id); } } });
  }

  const canSet = (m: Member) => m.id === me.id || isParent;
  const people = [...members].sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : 0));

  return (
    <div className="space-y-4">
      {!hideTitle ? <h2 className="text-lg font-bold">{t.name}</h2> : null}
      <div className="flex flex-wrap gap-2">
        {t.phone ? <a href={`tel:${t.phone.replace(/[^\d+]/g, "")}`} className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--status-green)] px-4 font-semibold text-white"><Phone className="size-4" /> {t.phone}</a> : null}
        {t.link ? <a href={t.link} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--surface-border)] bg-[var(--surface)] px-4 font-semibold"><ExternalLink className="size-4" /> Order online</a> : null}
      </div>
      {t.notes ? <p className="rounded-2xl bg-[var(--surface)] p-3 text-sm">{t.notes}</p> : null}
      {t.last_ordered ? <p className="text-sm text-muted-foreground">Last ordered {dayLong(t.last_ordered)}.</p> : null}

      <section>
        <h3 className="mb-2 text-sm font-bold">Everyone's usual order</h3>
        <ul className="space-y-2">
          {people.map((m) => (
            <OrderRow key={m.id} member={m} takeawayId={t.id} order={orders.find((o) => o.member_id === m.id)} canEdit={canSet(m)} />
          ))}
        </ul>
      </section>

      {adult ? (
        <div className="space-y-2">
          <Button className="h-11 w-full rounded-full font-semibold" onClick={() => void ordered(true)}><CalendarPlus className="size-4" /> We ordered tonight: add to dinner</Button>
          <Button variant="outline" className="h-11 w-full rounded-full" onClick={() => void ordered(false)}>We ordered (don't change the plan)</Button>
          <div className="flex gap-2">
            <Button variant="ghost" className="h-10 flex-1 rounded-full" onClick={onEdit}><Pencil className="size-4" /> Change details</Button>
            <Button variant="ghost" className="h-10 flex-1 rounded-full" onClick={() => void archive()}><Archive className="size-4" /> Put away</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OrderRow({ member, takeawayId, order, canEdit }: { member: Member; takeawayId: string; order: TakeawayOrder | undefined; canEdit: boolean }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(order?.order_text ?? "");
  useEffect(() => { if (!editing) setText(order?.order_text ?? ""); }, [order?.order_text, editing]);

  async function save() {
    const v = text.trim().slice(0, 300);
    const res = !v
      ? order ? await supabase.from("food_takeaway_orders").delete().eq("id", order.id) : { error: null }
      : order
        ? await supabase.from("food_takeaway_orders").update({ order_text: v }).eq("id", order.id)
        : await supabase.from("food_takeaway_orders").insert({ takeaway_id: takeawayId, family_id: family.id, member_id: member.id, order_text: v });
    if (res.error) { toast.error(friendlyError(res.error)); return; }
    setEditing(false);
    await refreshFood(qc, family.id);
  }

  return (
    <li className="glass-tile flex items-start gap-3 p-3">
      <MemberAvatar member={member} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{member.display_name}</p>
        {editing ? (
          <div className="mt-1 space-y-2">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={300} placeholder="Chicken chow mein, prawn crackers" aria-label={`${member.display_name}'s usual order`} autoFocus />
            <div className="flex gap-2">
              <Button className="h-10 rounded-full px-4 font-semibold" onClick={() => void save()}>Save</Button>
              <Button variant="ghost" className="h-10 rounded-full px-3" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <p className={cn("text-base", !order && "text-sm text-muted-foreground")}>{order?.order_text ?? "No usual order yet"}</p>
        )}
      </div>
      {canEdit && !editing ? (
        <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" onClick={() => setEditing(true)} aria-label={`Change ${member.display_name}'s order`}><Pencil className="size-4" /></Button>
      ) : null}
    </li>
  );
}

function EditTakeaway({ value, onClose, onSaved }: { value: Takeaway | "new" | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  const existing = value && value !== "new" ? value : null;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!value) return;
    setName(existing?.name ?? ""); setPhone(existing?.phone ?? ""); setLink(existing?.link ?? ""); setNotes(existing?.notes ?? "");
  }, [value, existing]);

  const linkOk = !link.trim() || /^https:\/\//i.test(link.trim());

  async function save() {
    if (!name.trim() || !linkOk) return;
    setBusy(true);
    const row = { name: name.trim().slice(0, 80), phone: phone.trim().slice(0, 30) || null, link: link.trim() || null, notes: notes.trim().slice(0, 500) };
    const res = existing
      ? await supabase.from("food_takeaways").update(row).eq("id", existing.id).select("id").single()
      : await supabase.from("food_takeaways").insert({ ...row, family_id: family.id }).select("id").single();
    setBusy(false);
    if (res.error) { toast.error(friendlyError(res.error)); return; }
    await refreshFood(qc, family.id);
    onSaved(res.data.id as string);
  }

  return (
    <Sheet
      open={!!value}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "Change takeaway" : "Add a takeaway"}
      footer={
        <>
          <Button className="h-11 flex-1 rounded-full text-base font-semibold" disabled={!name.trim() || !linkOk || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={onClose}><X className="size-4" /> Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Golden Dragon" className="h-11" maxLength={80} data-autofocus /></Field>
        <Field label="Phone number"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01234 567890" className="h-11" maxLength={30} /></Field>
        <Field label="Order online (web address)" hint={linkOk ? "Starts with https://" : "That needs to start with https://"}>
          <Input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className="h-11" maxLength={500} />
        </Field>
        <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} placeholder="Closed Mondays. Ask for no MSG." /></Field>
      </div>
    </Sheet>
  );
}
