// Who lives here: just me, a couple, flatmates or a family. It decides which modules start switched on and the
// words the app uses, so a single person or flatmates don't see a family app. A parent changes it in Settings.
import type { Family } from "@/lib/family";
import { supabase } from "@/lib/supabase";
import type { ModuleConfig, Role } from "@/modules/registry";

export type HouseholdKind = "solo" | "couple" | "flatmates" | "family";

export const HOUSEHOLD_KINDS: { key: HouseholdKind; label: string; emoji: string; hint: string }[] = [
  { key: "solo", label: "Just me", emoji: "🙋", hint: "Your own calendar, food, money, papers and home" },
  { key: "couple", label: "A couple", emoji: "👫", hint: "Everything shared between the two of you" },
  { key: "flatmates", label: "Flatmates", emoji: "🏠", hint: "Shared calendar, shopping, chores and bills" },
  { key: "family", label: "A family", emoji: "👨‍👩‍👧", hint: "Everything, including school, kids and pocket money" },
];

/** Modules that only make sense with children (or, for Health, one person looking after others) */
const OFF_FOR: Record<HouseholdKind, string[]> = {
  solo: ["kids", "school", "pocket"],
  couple: ["kids", "school", "pocket"],
  flatmates: ["kids", "school", "pocket", "health"],
  family: [],
};
const ALL_SET = ["kids", "school", "pocket", "health"];

export function kindOf(family: Pick<Family, "household_kind">): HouseholdKind {
  return (family.household_kind as HouseholdKind) ?? "family";
}

/** Save who lives here and switch the modules to match (they can still be switched one by one afterwards) */
export async function setHouseholdKind(familyId: string, kind: HouseholdKind) {
  const { error } = await supabase.from("families").update({ household_kind: kind }).eq("id", familyId);
  if (error) throw error;
  const rows = ALL_SET.map((key) => ({ family_id: familyId, module_key: key, enabled: !OFF_FOR[kind].includes(key) }));
  const { error: e2 } = await supabase.from("family_modules").upsert(rows, { onConflict: "family_id,module_key" });
  if (e2) throw e2;
}

export const isFamily = (kind: HouseholdKind) => kind === "family";

/** "family" or "household", for sentences */
export const homeWord = (kind: HouseholdKind) => (isFamily(kind) ? "family" : "household");

/** Role names: a family has parents; everyone else has organisers */
export function roleLabel(role: Role | string, kind: HouseholdKind): string {
  if (isFamily(kind)) return role === "parent" ? "Parent" : role === "member" ? "Adult" : role === "child" ? "Child" : role;
  return role === "parent" ? "Organiser" : role === "member" ? "Member" : role === "child" ? "Child" : role;
}

/** Module names without "Family" for households that aren't families ("Family Calendar" -> "Calendar") */
export function moduleName(m: Pick<ModuleConfig, "name">, kind: HouseholdKind): string {
  return isFamily(kind) ? m.name : m.name.replace(/^Family /, "");
}
