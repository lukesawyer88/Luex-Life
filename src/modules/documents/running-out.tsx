// Renewals: everything that runs out or comes due, soonest first, in one list with a small icon for each kind.
//   - papers from Documents (car papers get a car, passports an ID card, insurance a shield, and so on)
//   - contracts and free trials ending, from Household Money (parents, when Money is on)
//   - yearly jobs due, from Home Care (when Home Care is on)
// Each row opens where it lives. Nothing is copied: each module keeps its own dates and reminders.
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  AlarmClock, BadgeCheck, Briefcase, Car, FileText, GraduationCap, HeartPulse, Home, IdCard, Landmark, PawPrint, ReceiptText, Shield, Timer, Wrench,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { MemberAvatar } from "@/components/member-avatar";
import { DetailWindow, RecordsWindow, Windows } from "@/components/page-parts";
import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Empty } from "@/modules/calendar/ui";

import { daysBetween, expiryWords, keptDocs, todayIn, useDocs, useFolders, type Doc, type Folder } from "./data";
import type { DocsTabProps } from "./documents-page";
import { DocDetail, DocViewSheet } from "./papers";

type Kind = "car" | "papers" | "contracts" | "home";
type Item = {
  key: string; kind: Kind; icon: LucideIcon; title: string; date: string; note?: string; who?: string | null;
  doc?: Doc; go?: () => void; soonDays: number;
};

const KINDS: { key: Kind; label: string; icon: LucideIcon }[] = [
  { key: "car", label: "Car", icon: Car },
  { key: "papers", label: "Papers", icon: FileText },
  { key: "contracts", label: "Contracts", icon: ReceiptText },
  { key: "home", label: "Home jobs", icon: Wrench },
];

const CAR_WORDS = /\b(mot|car|vehicle|v5c?|logbook|road tax|car tax|breakdown|van|motorbike)\b/i;

/** A small icon for a paper, from its folder (the ready-made names) or its title */
function paperIcon(d: Doc, folder: Folder | undefined): { kind: Kind; icon: LucideIcon } {
  const f = (folder?.name ?? "").toLowerCase();
  if (f === "car" || CAR_WORDS.test(d.title)) return { kind: "car", icon: Car };
  if (/passport|\bid\b/.test(f) || /passport|licence|license|identity/i.test(d.title)) return { kind: "papers", icon: IdCard };
  if (f.includes("insurance") || /insurance|cover\b|warranty/i.test(d.title)) return { kind: "papers", icon: Shield };
  if (f === "house" || /tenancy|mortgage|boiler|tv licen/i.test(d.title)) return { kind: "papers", icon: Home };
  if (f === "health") return { kind: "papers", icon: HeartPulse };
  if (f === "pets") return { kind: "papers", icon: PawPrint };
  if (f.includes("money") || f.includes("bank")) return { kind: "papers", icon: Landmark };
  if (f === "school") return { kind: "papers", icon: GraduationCap };
  if (f === "work") return { kind: "papers", icon: Briefcase };
  return { kind: "papers", icon: FileText };
}

type BillLite = { id: string; name: string; contract_ends: string | null; trial_ends: string | null };
type JobLite = { id: string; title: string; next_due: string; who: string | null };

export function RunningOutTab({ openId, onOpen, onEdit }: DocsTabProps) {
  const { family, me, members, isParent, switchedOff } = useFamilyState();
  const navigate = useNavigate();
  const docs = useDocs();
  const folders = useFolders().data ?? [];
  const today = todayIn(family.timezone);
  const offline = docs.isError;
  const [only, setOnly] = useState<Kind | null>(null);
  const moneyOn = isParent && !switchedOff.has("money");
  const homeOn = !switchedOff.has("home-care");

  // contracts and free trials ending (Household Money is for parents; the database decides what each one sees)
  const bills = useQuery({
    queryKey: ["docs", family.id, "renewals-money"],
    enabled: moneyOn && !offline,
    queryFn: async () => {
      const { data, error } = await supabase.from("money_bills").select("id, name, contract_ends, trial_ends")
        .eq("family_id", family.id).is("archived_at", null).or("contract_ends.not.is.null,trial_ends.not.is.null");
      if (error) throw error;
      return (data ?? []) as BillLite[];
    },
  });
  // yearly jobs from Home Care
  const jobs = useQuery({
    queryKey: ["docs", family.id, "renewals-home"],
    enabled: homeOn && !offline,
    queryFn: async () => {
      const { data, error } = await supabase.from("hc_jobs").select("id, title, next_due, who").eq("family_id", family.id).is("archived_at", null);
      if (error) throw error;
      return (data ?? []) as JobLite[];
    },
  });

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const papers = offline ? keptDocs(me.id) : (docs.data ?? []);
    for (const d of papers) {
      if (!d.expires_on) continue;
      const { kind, icon } = paperIcon(d, folders.find((f) => f.id === d.folder_id));
      out.push({ key: `d-${d.id}`, kind, icon, title: d.title, date: d.expires_on, who: d.person_id, doc: d, soonDays: d.remind_days });
    }
    for (const b of moneyOn ? bills.data ?? [] : []) {
      if (b.contract_ends) out.push({ key: `c-${b.id}`, kind: "contracts", icon: ReceiptText, title: b.name, date: b.contract_ends, note: "Contract ends", soonDays: 31, go: () => void navigate({ to: "/m/$key", params: { key: "money" }, search: { bill: b.id } as never }) });
      if (b.trial_ends) out.push({ key: `t-${b.id}`, kind: "contracts", icon: Timer, title: b.name, date: b.trial_ends, note: "Free trial ends", soonDays: 7, go: () => void navigate({ to: "/m/$key", params: { key: "money" }, search: { bill: b.id } as never }) });
    }
    for (const j of homeOn ? jobs.data ?? [] : []) {
      out.push({ key: `j-${j.id}`, kind: CAR_WORDS.test(j.title) ? "car" : "home", icon: CAR_WORDS.test(j.title) ? Car : Wrench, title: j.title, date: j.next_due, note: "Due", who: j.who, soonDays: 14, go: () => void navigate({ to: "/m/$key", params: { key: "home-care" }, search: { tab: "jobs" } as never }) });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  }, [docs.data, offline, me.id, folders, bills.data, jobs.data, moneyOn, homeOn, navigate]);

  const counts = useMemo(() => {
    const m = new Map<Kind, number>();
    for (const i of items) m.set(i.kind, (m.get(i.kind) ?? 0) + 1);
    return m;
  }, [items]);
  const shown = only ? items.filter((i) => i.kind === only) : items;
  const groups = [
    { key: "gone", title: "Run out or overdue", list: shown.filter((i) => i.date < today) },
    { key: "soon", title: "In the next 3 months", list: shown.filter((i) => i.date >= today && daysBetween(today, i.date) <= 92) },
    { key: "later", title: "Later", list: shown.filter((i) => daysBetween(today, i.date) > 92) },
  ].filter((g) => g.list.length);
  const openDoc = (docs.data ?? keptDocs(me.id)).find((d) => d.id === openId) ?? null;
  const kinds = KINDS.filter((k) => counts.get(k.key));

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-3">
        {kinds.length > 1 ? (
          <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" data-testid="renew-kinds">
            <Chip on={only === null} onClick={() => setOnly(null)} className="shrink-0">All</Chip>
            {kinds.map((k) => (
              <Chip key={k.key} on={only === k.key} onClick={() => setOnly(only === k.key ? null : k.key)} className="shrink-0">
                <k.icon className="size-4" /> {k.label} <span className="text-xs opacity-70">{counts.get(k.key)}</span>
              </Chip>
            ))}
          </div>
        ) : null}
        {docs.isLoading ? null : !groups.length ? (
          <Empty icon={AlarmClock} title="Nothing coming up">
            Add the date a passport, MOT, car tax or insurance runs out and it shows here, with contracts ending in Money and yearly jobs from Home Care. You'll get a reminder before each one.
          </Empty>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.key}>
                <h3 className={cn("mb-2 text-sm font-bold", g.key === "gone" && "text-[var(--status-red)]")}>{g.title}</h3>
                <ul className="space-y-2">
                  {g.list.map((i) => {
                    const who = members.find((m) => m.id === i.who);
                    const n = daysBetween(today, i.date);
                    const urgent = n < 0 ? "gone" : n <= i.soonDays ? "soon" : "ok";
                    const Icon = i.icon;
                    return (
                      <li key={i.key}>
                        <button type="button" data-testid="renew-row" data-kind={i.kind}
                          onClick={() => (i.doc ? onOpen(i.doc.id) : i.go?.())}
                          className={cn("glass-tile flex w-full items-center gap-3 p-3 text-left", i.doc && openId === i.doc.id && "ring-2 ring-[var(--status-blue)]")}>
                          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--surface)]" aria-hidden><Icon className="size-5" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-base font-semibold">{i.title}</span>
                            <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                              {who ? <span className="inline-flex items-center gap-1"><MemberAvatar member={who} size="sm" className="size-5 ring-0 ring-offset-0" />{who.display_name}</span> : null}
                              <span className={cn(urgent === "gone" && "font-semibold text-[var(--status-red)]", urgent === "soon" && "font-semibold text-[var(--status-amber)]")}>
                                {i.doc ? expiryWords(i.date, today) : `${i.note} ${n === 0 ? "today" : n === 1 ? "tomorrow" : n < 0 ? `${-n} days ago` : `in ${n < 14 ? `${n} days` : n < 63 ? `${Math.round(n / 7)} weeks` : `${Math.round(n / 30.4)} months`}`}`}
                              </span>
                              {!i.doc ? <span className="inline-flex items-center gap-0.5 text-xs"><BadgeCheck className="size-3" /> {i.kind === "contracts" ? "Money" : "Home Care"}</span> : null}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </RecordsWindow>
      <DetailWindow>
        {openDoc ? <DocDetail d={openDoc} offline={offline} onEdit={() => onEdit(openDoc)} onGone={() => onOpen(null)} />
          : <p className="text-sm text-muted-foreground">Tap something to see it. Contracts open in Money and yearly jobs in Home Care.</p>}
      </DetailWindow>
      <DocViewSheet d={openDoc} offline={offline} onEdit={() => openDoc && onEdit(openDoc)} onClose={() => onOpen(null)} />
    </Windows>
  );
}
