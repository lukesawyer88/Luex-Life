import type { User } from "@supabase/supabase-js";
import { createContext, useContext } from "react";

import type { Family, Member } from "@/lib/family";
import type { Role } from "@/modules/registry";

export type FamilyState = {
  user: User;
  /** The signed-in person's own place in the family */
  me: Member;
  family: Family;
  members: Member[];
  role: Role;
  isParent: boolean;
  switchedOff: ReadonlySet<string>;
};

const FamilyContext = createContext<FamilyState | null>(null);
export const FamilyProvider = FamilyContext.Provider;

export function useFamilyState(): FamilyState {
  const v = useContext(FamilyContext);
  if (!v) throw new Error("useFamilyState must be used inside the app shell");
  return v;
}
