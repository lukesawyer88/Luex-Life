// "More features": the extras each module can do, switched off by default so Luex Life stays simple.
// A parent switches them on in Settings. Stored as rows in family_modules with keys "x:<extra>" (enabled = on),
// so nothing new is needed in the database. Nothing is deleted when an extra is off; it's just hidden.
import { useQuery } from "@tanstack/react-query";

import { useFamilyState } from "@/lib/family-context";
import { supabase } from "@/lib/supabase";

export type Extra = { key: string; module: string; label: string; hint: string };

export const EXTRAS: Extra[] = [
  // Family Calendar
  { key: "cal.history", module: "calendar", label: "Change history", hint: "See every change made to an event" },
  { key: "cal.comments", module: "calendar", label: "Comments on events", hint: "Talk about an event under it" },
  { key: "cal.weather", module: "calendar", label: "Weather", hint: "The forecast on each day" },
  { key: "cal.timers", module: "calendar", label: "Routine timers", hint: "Timers on routine steps" },
  { key: "cal.print", module: "calendar", label: "Print the week", hint: "A printable week" },
  { key: "cal.countdowns", module: "calendar", label: "Christmas countdown", hint: "\"12 sleeps to Christmas\" through December" },
  { key: "cal.handover", module: "calendar", label: "Handover notes", hint: "Notes for whoever's looking after the children that day" },
  // Family Board
  { key: "board.seen", module: "board", label: "Seen by", hint: "Who has seen each message" },
  { key: "board.pin", module: "board", label: "Pinned messages", hint: "Pin a message to the top of a chat" },
  { key: "board.journal", module: "board", label: "Journal and memories", hint: "Memories, milestones, journal questions and the year book" },
  { key: "board.goals", module: "board", label: "Family goals", hint: "Goals with steps and stars" },
  { key: "board.kudos", module: "board", label: "Shout-outs", hint: "A wall of well-dones" },
  { key: "board.bucket", module: "board", label: "Bucket list", hint: "Things to do together one day" },
  { key: "board.stickers", module: "board", label: "Stickers", hint: "Stickers in chats" },
  { key: "board.later", module: "board", label: "Remind me later", hint: "A reminder about a message" },
  { key: "board.datepoll", module: "board", label: "Pick-a-date polls", hint: "Polls that choose a date" },
  { key: "board.drawing", module: "board", label: "Scan a drawing", hint: "Turn a child's drawing into a neat picture" },
  // Food
  { key: "food.stock", module: "food", label: "Fridge and cupboard", hint: "Track what's in the fridge and cupboards, with use-by alerts" },
  { key: "food.scan", module: "food", label: "Scanning", hint: "Barcodes, receipts and cookbook pages" },
  { key: "food.nutrition", module: "food", label: "Calories and nutrition", hint: "Calories for grown-ups and nutrition per serving" },
  { key: "food.seasonal", module: "food", label: "Big-meal timelines", hint: "Cooking timelines for Christmas dinner and the like" },
  { key: "food.ideas", module: "food", label: "Ideas and leftovers", hint: "Meal ideas from what you have, leftovers and batch cooking" },
  { key: "food.collections", module: "food", label: "Recipe collections", hint: "Collections, notes and \"made it\" history" },
  { key: "food.ratings", module: "food", label: "Family ratings", hint: "Thumbs up or down on recipes" },
  { key: "food.assign", module: "food", label: "Give items to people", hint: "\"Pat's getting the milk\"" },
  // Household Money
  { key: "money.currency", module: "money", label: "Other currencies", hint: "Payments and accounts in other currencies" },
  { key: "money.invest", module: "money", label: "Investments and credit", hint: "Investments, pensions, credit score and a mortgage calculator" },
  { key: "money.whatif", module: "money", label: "Overpayment \"what if\"", hint: "See how paying more clears a debt sooner" },
  { key: "money.fourweekly", module: "money", label: "Four-weekly pay", hint: "Budget periods for pay every four weeks" },
  { key: "money.carry", module: "money", label: "Carry-over", hint: "Unspent money rolls into next month" },
  { key: "money.receipts", module: "money", label: "Receipt photos", hint: "Attach a photo of a receipt" },
  { key: "money.childcosts", module: "money", label: "Child costs", hint: "What each child cost this year" },
  { key: "money.reports", module: "money", label: "Detailed reports", hint: "Reports, filters, PDF export and remembered payees" },
  // Rewards and Pocket Money
  { key: "rewards.habits", module: "pocket", label: "Habits", hint: "Habits with streaks for anyone" },
  { key: "rewards.treatjar", module: "pocket", label: "Treat jar", hint: "Grown-ups put money aside for treats" },
  { key: "rewards.shared", module: "pocket", label: "Shared rewards", hint: "Everyone puts stars towards one treat" },
  { key: "rewards.give", module: "pocket", label: "Give pot", hint: "A pot for giving to others" },
  { key: "rewards.interest", module: "pocket", label: "Interest and matching", hint: "Pay interest on savings, or match what's saved" },
  { key: "rewards.advance", module: "pocket", label: "Advances", hint: "Lend pocket money early" },
  { key: "rewards.teen", module: "pocket", label: "Teen mode", hint: "Fewer approvals for teenagers" },
  { key: "rewards.swap", module: "pocket", label: "Swap stars for money", hint: "Turn stars into pocket money" },
  { key: "rewards.weekbonus", module: "pocket", label: "Weekly bonus", hint: "A bonus when every chore that week is done" },
  { key: "rewards.deduct", module: "pocket", label: "Taking off", hint: "Take money or stars off" },
  { key: "rewards.toothfairy", module: "pocket", label: "Tooth fairy and birthdays", hint: "Record tooth fairy and birthday money" },
  { key: "rewards.tips", module: "pocket", label: "Money tips", hint: "A short money tip for children" },
  { key: "rewards.photos", module: "pocket", label: "Photo proof", hint: "Ask for a photo when a chore or job is done" },
  { key: "rewards.pdf", module: "pocket", label: "PDF history", hint: "Download the history as a PDF" },
];

export const extraRowKey = (key: string) => `x:${key}`;

// kept on the device as a plain list (saved for offline use), turned into a Set when read
const toSet = (a: string[]) => new Set(a);

/** The extras this household has switched on */
export function useExtrasOn() {
  const { family } = useFamilyState();
  return useQuery({
    queryKey: ["modules", family.id, "extras"],
    select: toSet,
    queryFn: async () => {
      const { data, error } = await supabase.from("family_modules").select("module_key, enabled").eq("family_id", family.id).like("module_key", "x:%");
      if (error) throw error;
      return (data ?? []).filter((r) => r.enabled).map((r) => r.module_key.slice(2));
    },
  });
}

/** Is this extra switched on? (off while loading, so screens start simple) */
export function useExtra(key: string): boolean {
  return useExtrasOn().data?.has(key) ?? false;
}

/** Switch an extra on or off (parents) */
export async function setExtra(familyId: string, key: string, on: boolean) {
  const { error } = await supabase
    .from("family_modules")
    .upsert({ family_id: familyId, module_key: extraRowKey(key), enabled: on }, { onConflict: "family_id,module_key" });
  if (error) throw error;
}
