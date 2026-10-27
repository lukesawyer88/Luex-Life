// "What's for dinner": tonight's planned dinner, who's cooking and any leftovers. Shown on Home and the kitchen
// screen. Never shows calories.
import { Link } from "@tanstack/react-router";
import { ChefHat, UtensilsCrossed } from "lucide-react";

import { MemberAvatar } from "@/components/member-avatar";
import { useFamilyState } from "@/lib/family-context";
import { cn } from "@/lib/utils";

import { todayIn, useFoodUrls, usePlan, useRecipes, useTakeaways } from "./data";
import { mealName } from "./plan-helpers";

export function WhatsForDinner({ compact }: { compact?: boolean }) {
  const { family, members, switchedOff } = useFamilyState();
  const today = todayIn(family.timezone);
  const plan = usePlan(today, today);
  const recipes = useRecipes().data?.recipes ?? [];
  const takeaways = useTakeaways().data?.takeaways ?? [];
  const dinners = (plan.data ?? []).filter((p) => p.slot === "dinner" && p.status === "planned");
  const first = dinners[0];
  const recipe = first?.recipe_id ? recipes.find((r) => r.id === first.recipe_id) : undefined;
  const photo = useFoodUrls([recipe?.photo_path]).data?.get(recipe?.photo_path ?? "");
  if (switchedOff.has("food")) return null;

  const cook = first?.cook ? members.find((m) => m.id === first.cook) : undefined;
  const names = dinners.map((d) => mealName(d, recipes, takeaways));

  if (compact) {
    return (
      <Link to="/m/$key" params={{ key: "food" }} className="glass-tile flex min-h-14 items-center gap-3 p-3">
        {photo ? <img src={photo} alt="" className="size-12 shrink-0 rounded-xl object-cover" /> : <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[var(--surface)]"><UtensilsCrossed className="size-5" /></span>}
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-muted-foreground">What's for dinner</span>
          <span className="block truncate font-bold">{names.length ? names.join(" + ") : "Nothing planned yet"}</span>
          {cook ? <span className="block text-xs text-muted-foreground">{cook.display_name} is cooking</span> : null}
        </span>
      </Link>
    );
  }

  return (
    <div className={cn("flex items-center gap-4 rounded-3xl bg-[var(--surface)] px-5 py-3")}>
      {photo ? <img src={photo} alt="" className="size-16 shrink-0 rounded-2xl object-cover" /> : <UtensilsCrossed className="size-8 shrink-0" />}
      <div className="min-w-0">
        <p className="text-base font-semibold text-muted-foreground">Tonight's dinner</p>
        <p className="truncate text-2xl font-bold">{names.length ? names.join(" + ") : "Not planned yet"}</p>
        {first?.leftover_of ? <p className="text-lg text-muted-foreground">Leftovers</p> : null}
      </div>
      {cook ? (
        <div className="flex items-center gap-2 text-lg font-semibold">
          <ChefHat className="size-6" /><MemberAvatar member={cook} size="sm" /> {cook.display_name}
        </div>
      ) : null}
    </div>
  );
}
