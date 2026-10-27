// The emergency screen: call 999 or 112, the address to read out, who to call in order, allergies at a glance.
import { MapPin, Phone, TriangleAlert } from "lucide-react";

import { MemberAvatar } from "@/components/member-avatar";
import { RecordsWindow, Windows } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { useFamilyState } from "@/lib/family-context";

import type { EmTab } from "./contacts-page";
import { callList, telHref, useCards, useContacts, useHome } from "./data";

export function EmergencyTab({ onGo }: { onGo: (t: EmTab) => void }) {
  const { members, role } = useFamilyState();
  const contacts = useContacts();
  const cards = useCards().data;
  const home = useHome().data;
  const call = callList(contacts.data ?? []);
  const grownUp = role !== "child";
  const allergies = members
    .filter((m) => !m.archived_at)
    .map((m) => ({ m, card: cards?.cards.find((c) => c.member_id === m.id) }))
    .filter((x) => x.card && (x.card.allergies.trim() || x.card.medicines.trim()));

  return (
    <Windows>
      <RecordsWindow className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <a href="tel:999" data-testid="call-999" className="flex min-h-20 flex-col items-center justify-center rounded-3xl bg-[var(--status-red)] p-3 text-white shadow-md active:scale-[0.98]">
            <span className="flex items-center gap-2 text-2xl font-extrabold"><Phone className="size-7" /> 999</span>
            <span className="text-sm font-semibold opacity-90">Ambulance, fire, police</span>
          </a>
          <a href="tel:112" data-testid="call-112" className="flex min-h-20 flex-col items-center justify-center rounded-3xl bg-[var(--status-red)] p-3 text-white shadow-md active:scale-[0.98]">
            <span className="flex items-center gap-2 text-2xl font-extrabold"><Phone className="size-7" /> 112</span>
            <span className="text-sm font-semibold opacity-90">Works on any phone, in Europe</span>
          </a>
        </div>

        <section className="glass-tile p-4" data-testid="sos-address">
          <h2 className="flex items-center gap-2 text-sm font-bold text-muted-foreground"><MapPin className="size-4" /> Our address</h2>
          {home?.address ? <p className="mt-1 whitespace-pre-line text-2xl font-bold leading-snug">{home.address}</p>
            : <p className="mt-1 text-base">Not added yet. {grownUp ? <button type="button" className="font-semibold underline" onClick={() => onGo("home")}>Add it</button> : "Ask a grown-up to add it."}</p>}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold">Who to call</h2>
          {call.length ? (
            <ol className="space-y-2" data-testid="sos-call">
              {call.map((c, i) => (
                <li key={c.id} className="glass-tile flex items-center gap-3 p-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-base font-bold">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-semibold">{c.name}</span>
                    {c.notes ? <span className="block truncate text-sm text-muted-foreground">{c.notes}</span> : null}
                  </span>
                  {c.phone ? (
                    <a href={telHref(c.phone)} aria-label={`Call ${c.name}`} className="flex h-12 items-center gap-2 rounded-full bg-[var(--status-green)] px-4 text-base font-bold text-white">
                      <Phone className="size-5" /> Call
                    </a>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-base text-muted-foreground">
              Nobody yet. {grownUp ? <button type="button" className="font-semibold text-foreground underline" onClick={() => onGo("contacts")}>Add who to call</button> : "Ask a grown-up to add them."}
            </p>
          )}
        </section>

        {allergies.length ? (
          <section>
            <h2 className="mb-2 text-lg font-bold">Allergies and medicines</h2>
            <ul className="space-y-2">
              {allergies.map(({ m, card }) => (
                <li key={m.id} className="glass-tile flex items-start gap-3 p-3">
                  <MemberAvatar member={m} size="sm" className="mt-0.5 ring-0 ring-offset-0" />
                  <span className="min-w-0 flex-1 text-base">
                    <span className="font-semibold">{m.display_name}</span>
                    {card!.allergies.trim() ? <span className="block"><span className="font-semibold text-[var(--status-red)]">Allergic to:</span> {card!.allergies}</span> : null}
                    {card!.medicines.trim() ? <span className="block"><span className="font-semibold">Takes:</span> {card!.medicines}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            <Button variant="outline" className="mt-2 h-11 rounded-full" onClick={() => onGo("cards")}>See everyone's card</Button>
          </section>
        ) : null}

        {home?.meet_point || home?.plan ? (
          <section className="glass-tile p-4">
            <h2 className="text-lg font-bold">Our plan</h2>
            {home.meet_point ? <p className="text-base"><span className="font-semibold">Where we meet:</span> {home.meet_point}</p> : null}
            {home.plan ? <p className="whitespace-pre-line text-base"><span className="font-semibold">Who collects the children:</span> {home.plan}</p> : null}
          </section>
        ) : null}

        <p className="flex items-start gap-2 rounded-2xl bg-[var(--surface)] p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          This is here to help. It never replaces calling 999 or 112: in an emergency, call them first.
        </p>
      </RecordsWindow>
    </Windows>
  );
}
