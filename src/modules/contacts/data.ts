// Everything Contacts and Emergency reads and writes. Everyone in the household can see it (children too: it's for
// emergencies). Grown-ups keep the contacts and home essentials; each grown-up keeps their own card; parents keep the
// children's, pets' and anyone who doesn't sign in. The database decides; these helpers only mirror it for the buttons.
// Every query key starts with "em", so it's kept on the phone and works without a signal (plain JSON only).
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { Database } from "@/lib/database.types";
import type { Member } from "@/lib/family";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Contact = Row<"em_contacts">;
export type Card = Row<"em_cards">;
export type Conditions = Row<"em_conditions">;
export type HomeInfo = Row<"em_home">;
export type Share = Pick<Row<"em_shares">, "id" | "name" | "expires_at" | "revoked_at" | "last_used_at" | "created_at">;

export const GROUPS: { key: Contact["grp"]; label: string; emoji: string }[] = [
  { key: "family", label: "Family and friends", emoji: "👪" },
  { key: "medical", label: "Doctors and health", emoji: "🩺" },
  { key: "school", label: "School and childcare", emoji: "🎒" },
  { key: "home", label: "Home and repairs", emoji: "🔧" },
  { key: "neighbours", label: "Neighbours", emoji: "🏡" },
  { key: "other", label: "Other", emoji: "📇" },
];
export const BLOOD = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"] as const;

export const emKey = (familyId: string, ...rest: unknown[]) => ["em", familyId, ...rest];
export function refreshEm(qc: QueryClient, familyId: string) {
  return qc.invalidateQueries({ queryKey: ["em", familyId] });
}

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

export function useEmLive() {
  const { family } = useFamilyState();
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void refreshEm(qc, family.id), 300); };
    const ch = supabase.channel(`em-${family.id}`);
    for (const t of ["em_contacts", "em_cards", "em_home"]) ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `family_id=eq.${family.id}` }, refresh);
    ch.subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [family.id, qc]);
}

export function useContacts() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: emKey(family.id, "contacts"),
    queryFn: () => rows<Contact>(supabase.from("em_contacts").select("*").eq("family_id", family.id).is("deleted_at", null).order("name")),
  });
}

/** "Who to call", in order */
export function callList(list: Contact[]) {
  return list.filter((c) => c.call_order != null).sort((a, b) => (a.call_order ?? 0) - (b.call_order ?? 0));
}

export type CardsData = { cards: Card[]; conditions: Conditions[] };
export function useCards() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: emKey(family.id, "cards"),
    queryFn: async (): Promise<CardsData> => {
      const [cards, conditions] = await Promise.all([
        rows<Card>(supabase.from("em_cards").select("*").eq("family_id", family.id).is("deleted_at", null)),
        rows<Conditions>(supabase.from("em_conditions").select("*").eq("family_id", family.id)),
      ]);
      return { cards, conditions };
    },
  });
}

export function useHome() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: emKey(family.id, "home"),
    queryFn: async () => {
      const { data, error } = await supabase.from("em_home").select("*").eq("family_id", family.id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as HomeInfo | null;
    },
  });
}

export function useShares(enabled: boolean) {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: ["em-shares", family.id],
    enabled,
    queryFn: () => rows<Share>(supabase.from("em_shares").select("id, name, expires_at, revoked_at, last_used_at, created_at")
      .eq("family_id", family.id).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false })),
  });
}

/** Mirrors em_can_edit: a grown-up their own card; parents the children's, pets' and anyone who doesn't sign in */
export function canEditCard(me: Member, isParent: boolean, member: Member | null) {
  if (me.role === "child") return false;
  if (!member) return isParent;
  if (member.id === me.id) return true;
  return isParent && (member.role === "child" || !member.user_id);
}

/** Phone numbers as a link the phone understands */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
export const smsHref = (phone: string) => `sms:${phone.replace(/[^\d+]/g, "")}`;

export function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/fetch|network/i.test(m)) return "No signal. Try again in a moment";
  if (/row-level|permission/i.test(m)) return "That change is not allowed";
  return m.length < 120 ? m : "Something went wrong. Try again";
}

// ---------------------------------------------------------------- contacts file (vCard) from a phone

export type VCardContact = { name: string; phone: string | null; phone2: string | null; email: string | null; address: string | null; notes: string };

/** Read a .vcf file (one or many cards). Only the basics: name, two phone numbers, email, address and note. */
export function parseVCards(text: string): VCardContact[] {
  // unfold folded lines
  const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out: VCardContact[] = [];
  let cur: { fn?: string; n?: string; tels: string[]; email?: string; adr?: string; note?: string } | null = null;
  const val = (l: string) => l.slice(l.indexOf(":") + 1).replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
  for (const raw of lines) {
    const l = raw.trim();
    const key = l.split(":")[0].split(";")[0].toUpperCase().replace(/^ITEM\d+\./, "");
    if (key === "BEGIN" && /vcard/i.test(l)) cur = { tels: [] };
    else if (!cur) continue;
    else if (key === "END") {
      const name = (cur.fn || cur.n || "").trim();
      if (name) out.push({ name: name.slice(0, 80), phone: cur.tels[0]?.slice(0, 40) ?? null, phone2: cur.tels[1]?.slice(0, 40) ?? null, email: cur.email?.slice(0, 120) ?? null, address: cur.adr?.slice(0, 200) ?? null, notes: (cur.note ?? "").slice(0, 500) });
      cur = null;
    } else if (key === "FN") cur.fn = val(l);
    else if (key === "N" && !cur.fn) cur.n = val(l).split(";").filter(Boolean).reverse().join(" ");
    else if (key === "TEL") { const v = val(l).replace(/^tel:/i, ""); if (v) cur.tels.push(v); }
    else if (key === "EMAIL" && !cur.email) cur.email = val(l);
    else if (key === "ADR" && !cur.adr) cur.adr = val(l).split(";").map((s) => s.trim()).filter(Boolean).join(", ");
    else if (key === "NOTE" && !cur.note) cur.note = val(l);
  }
  return out;
}

// ---------------------------------------------------------------- the fridge sheet

const esc = (s: string | null | undefined) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function printSheet(o: {
  family: string; home: HomeInfo | null; call: Contact[]; others: Contact[];
  people: { name: string; card: Card | null; conditions: string | null }[];
}) {
  const w = window.open("", "_blank");
  if (!w) throw new Error("Allow pop-ups to print the sheet");
  const h = o.home;
  const row = (label: string, v: string | null | undefined) => (v ? `<tr><th>${esc(label)}</th><td>${esc(v)}</td></tr>` : "");
  const people = o.people.filter((p) => p.card && (p.card.allergies || p.card.medicines || p.conditions || p.card.blood_group || p.card.doctor || p.card.microchip));
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.family)}: emergency sheet</title><style>
    body{font:15px/1.4 system-ui,sans-serif;margin:24px;color:#111} h1{font-size:24px;margin:0 0 4px} h2{font-size:18px;margin:18px 0 6px;border-bottom:2px solid #111}
    .big{font-size:30px;font-weight:800;margin:8px 0} table{border-collapse:collapse;width:100%} th,td{text-align:left;vertical-align:top;padding:4px 8px 4px 0}
    th{width:34%;font-weight:600} .card{border:1px solid #999;border-radius:8px;padding:8px 10px;margin:6px 0;break-inside:avoid} .note{font-size:12px;color:#444;margin-top:18px}
  </style></head><body>
    <h1>${esc(o.family)}: in an emergency</h1>
    <div class="big">Call 999 or 112</div>
    ${h?.address ? `<p><b>Our address:</b> ${esc(h.address)}</p>` : ""}
    ${o.call.length ? `<h2>Who to call</h2><table>${o.call.map((c, i) => `<tr><th>${i + 1}. ${esc(c.name)}</th><td>${esc([c.phone, c.phone2].filter(Boolean).join(" / "))}${c.notes ? ` · ${esc(c.notes)}` : ""}</td></tr>`).join("")}</table>` : ""}
    ${people.length ? `<h2>Allergies, medicines and doctors</h2>${people.map((p) => `<div class="card"><b>${esc(p.name)}</b><table>
      ${row("Allergies", p.card!.allergies)}${row("Medicines", p.card!.medicines)}${row("Conditions", p.conditions)}${row("Blood group", p.card!.blood_group)}
      ${row(p.card!.member_id ? "GP" : "Vet", [p.card!.doctor, p.card!.doctor_phone].filter(Boolean).join(", "))}${row("Microchip", p.card!.microchip)}${row("Notes", p.card!.notes)}</table></div>`).join("")}` : ""}
    ${h && (h.stopcock || h.fuse_box || h.gas_meter || h.first_aid || h.spare_key) ? `<h2>Where things are</h2><table>${row("Water stopcock", h.stopcock)}${row("Fuse box", h.fuse_box)}${row("Gas meter", h.gas_meter)}${row("First-aid kit", h.first_aid)}${row("Spare key", h.spare_key)}</table>` : ""}
    ${h && (h.meet_point || h.plan) ? `<h2>Our plan</h2><table>${row("Where we meet", h.meet_point)}${row("Who collects the children", h.plan)}</table>` : ""}
    ${o.others.length ? `<h2>Other numbers</h2><table>${o.others.map((c) => `<tr><th>${esc(c.name)}</th><td>${esc([c.phone, c.phone2].filter(Boolean).join(" / "))}</td></tr>`).join("")}</table>` : ""}
    <p class="note">Printed ${esc(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))} from Luex Life. This sheet never replaces calling 999 or 112.</p>
    <script>window.onload = function () { window.print(); };</script>
  </body></html>`);
  w.document.close();
}
