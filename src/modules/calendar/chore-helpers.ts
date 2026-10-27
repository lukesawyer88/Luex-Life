// Small chore helpers shared with Home, kept apart from the Chores tab so Home stays light.
import {
  Bath, BedDouble, BookOpen, Car, Dog, Fish, Flower2, Shirt, ShoppingBasket, Sofa, Sparkles, Trash2, Utensils, WashingMachine, type LucideIcon,
} from "lucide-react";

import type { Chore } from "./data";
import { countBefore } from "./recurrence";

// ---------------------------------------------------------------- icons (stored by name)

export const CHORE_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles, bed: BedDouble, utensils: Utensils, bin: Trash2, shirt: Shirt, dog: Dog, fish: Fish,
  flower: Flower2, bath: Bath, book: BookOpen, shopping: ShoppingBasket, car: Car, sofa: Sofa, washing: WashingMachine,
};
export function choreIcon(name: string): LucideIcon {
  return CHORE_ICONS[name] ?? Sparkles;
}

// ---------------------------------------------------------------- who does it on a day

/** Who a chore is for on a day: 'each' = everyone listed, 'rotate' = whose turn it is, 'anyone' = null (first to do it) */
export function choreAssignees(c: Chore, k: string): string[] | null {
  if (c.mode === "anyone") return null;
  if (!c.people.length) return [];
  if (c.mode === "rotate") return [c.people[countBefore(c.rrule, c.starts_on, k) % c.people.length]];
  return c.people;
}

