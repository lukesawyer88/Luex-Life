// A Home screen card for parents: a child asking for more screen time, with Yes and No right there.
import { useFamilyState } from "@/lib/family-context";

import { useOpenAsks } from "./data";
import { AskCard } from "./ask-card";

export function KidAsks() {
  const { switchedOff, role, members } = useFamilyState();
  const on = !switchedOff.has("kids") && role === "parent";
  const asks = useOpenAsks(on).data ?? [];
  if (!on || !asks.length) return null;
  return (
    <div className="mb-4 space-y-2" data-testid="home-kid-asks">
      {asks.map((a) => {
        const child = members.find((m) => m.id === a.child_id);
        return child ? <AskCard key={a.id} ask={a} child={child} canAnswer /> : null;
      })}
    </div>
  );
}
