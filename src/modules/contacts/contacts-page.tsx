// Contacts and Emergency: who to call and what to do, for everyone in the house and the babysitter.
import { BookUser, Home, Link2, Printer, Siren, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useFamilyState } from "@/lib/family-context";
import { Tabs } from "@/modules/calendar/ui";

import { CardsTab } from "./cards";
import { ContactsTab } from "./contacts";
import { callList, errMsg, printSheet, useCards, useContacts, useEmLive, useHome } from "./data";
import { EmergencyTab } from "./emergency";
import { HomeTab } from "./home";
import { ShareSheet } from "./share";

export type EmTab = "sos" | "cards" | "contacts" | "home";

export function ContactsPage() {
  useEmLive();
  const { family, members, isParent } = useFamilyState();
  const contacts = useContacts().data ?? [];
  const cards = useCards().data;
  const home = useHome().data ?? null;
  const [tab, setTab] = useState<EmTab>("sos");
  const [showShare, setShowShare] = useState(false);

  function print() {
    try {
      const call = callList(contacts);
      const people = [
        ...members.filter((m) => !m.archived_at).map((m) => {
          const card = cards?.cards.find((c) => c.member_id === m.id) ?? null;
          return { name: m.display_name, card, conditions: card ? cards?.conditions.find((x) => x.card_id === card.id)?.conditions || null : null };
        }),
        ...(cards?.cards.filter((c) => !c.member_id) ?? []).map((c) => ({ name: `${c.pet_name} (pet)`, card: c, conditions: null })),
      ];
      printSheet({ family: family.name, home, call, others: contacts.filter((c) => c.call_order == null && (c.grp === "medical" || c.grp === "home" || c.grp === "neighbours") && c.phone), people });
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <Tabs<EmTab>
            value={tab}
            onChange={setTab}
            items={[
              { key: "sos", label: "Emergency", icon: Siren },
              { key: "cards", label: "People", icon: Users },
              { key: "contacts", label: "Contacts", icon: BookUser },
              { key: "home", label: "Home", icon: Home },
            ]}
          />
        </div>
        <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" onClick={print} aria-label="Print the emergency sheet"><Printer className="size-5" /></Button>
        {isParent ? (
          <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" onClick={() => setShowShare(true)} aria-label="Babysitter link"><Link2 className="size-5" /></Button>
        ) : null}
      </div>
      {tab === "sos" ? <EmergencyTab onGo={setTab} /> : null}
      {tab === "cards" ? <CardsTab /> : null}
      {tab === "contacts" ? <ContactsTab /> : null}
      {tab === "home" ? <HomeTab /> : null}
      {isParent ? <ShareSheet open={showShare} onOpenChange={setShowShare} /> : null}
    </div>
  );
}
