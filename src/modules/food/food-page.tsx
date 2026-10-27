import { Bike, BookOpen, CalendarDays, Flame, Package, PiggyBank, Sandwich, Settings2, ShoppingCart, Snowflake, UtensilsCrossed } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useExtra } from "@/lib/extras";
import { useFamilyState } from "@/lib/family-context";
import { takeLinkParams } from "@/lib/link-params";
import { Chip, Tabs } from "@/modules/calendar/ui";

import { BudgetTab } from "./budget";
import { CaloriesTab } from "./calories";
import { useFoodLive, useMyFoodSettings } from "./data";
import { LunchesTab } from "./lunches";
import { PlanTab } from "./plan";
import { RecipesTab } from "./recipes";
import { FoodSettingsDialog } from "./settings";
import { ShoppingTab } from "./shopping";
import { StockTab } from "./stock";
import { TakeawaysTab } from "./takeaways";

export type FoodTab = "plan" | "recipes" | "shopping" | "stock" | "lunches" | "takeaways" | "budget" | "calories";

/** Where to go inside Food (from other tabs and notification links) */
export type FoodTarget = { tab: FoodTab; recipeId?: string; planId?: string; listId?: string; day?: string };

function fromUrl(): FoodTarget {
  const p = takeLinkParams();
  const tab = p.get("tab") as FoodTab | null;
  const t: FoodTarget = { tab: tab ?? "plan" };
  if (p.get("plan")) { t.tab = "plan"; t.planId = p.get("plan")!; }
  if (p.get("recipe")) { t.tab = "recipes"; t.recipeId = p.get("recipe")!; }
  return t;
}

export function FoodPage() {
  useFoodLive();
  const { isParent, role } = useFamilyState();
  const mySettings = useMyFoodSettings().data;
  const first = useMemo(fromUrl, []);
  const [target, setTarget] = useState<FoodTarget>(first);
  const [settings, setSettings] = useState(false);
  const go = (t: FoodTarget) => setTarget(t);
  const fullStock = useExtra("food.stock");
  const showCalories = useExtra("food.nutrition") && role !== "child" && !!mySettings?.calories_on;

  // packed lunches live inside the meal plan (a switch at the top), not in a tab of their own
  const items: { key: FoodTab; label: string; icon: typeof CalendarDays }[] = [
    { key: "plan", label: "Meal plan", icon: CalendarDays },
    { key: "recipes", label: "Recipes", icon: BookOpen },
    { key: "shopping", label: "Shopping", icon: ShoppingCart },
    { key: "stock", label: fullStock ? "Fridge and freezer" : "Freezer", icon: fullStock ? Package : Snowflake },
    { key: "takeaways", label: "Takeaways", icon: Bike },
  ];
  if (isParent) items.push({ key: "budget", label: "Food budget", icon: PiggyBank });
  if (showCalories) items.push({ key: "calories", label: "My calories", icon: Flame });
  const tab: FoodTab = target.tab === "lunches" ? "lunches" : items.some((i) => i.key === target.tab) ? target.tab : "plan";
  const tabShown: FoodTab = tab === "lunches" ? "plan" : tab;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <Tabs<FoodTab> value={tabShown} onChange={(t) => setTarget({ tab: t })} items={items} />
        </div>
        <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" onClick={() => setSettings(true)} aria-label="Food settings"><Settings2 className="size-5" /></Button>
      </div>
      {tab === "plan" || tab === "lunches" ? (
        <div className="flex gap-1.5">
          <Chip on={tab === "plan"} onClick={() => setTarget({ tab: "plan" })}><UtensilsCrossed className="size-4" /> Meals</Chip>
          <Chip on={tab === "lunches"} onClick={() => setTarget({ tab: "lunches" })}><Sandwich className="size-4" /> Lunchboxes</Chip>
        </div>
      ) : null}
      {tab === "plan" ? <PlanTab target={target} onGo={go} /> : null}
      {tab === "recipes" ? <RecipesTab target={target} onGo={go} /> : null}
      {tab === "shopping" ? <ShoppingTab target={target} onGo={go} /> : null}
      {tab === "stock" ? <StockTab target={target} onGo={go} /> : null}
      {tab === "lunches" ? <LunchesTab target={target} onGo={go} /> : null}
      {tab === "takeaways" ? <TakeawaysTab target={target} onGo={go} /> : null}
      {tab === "budget" && isParent ? <BudgetTab target={target} onGo={go} /> : null}
      {tab === "calories" && showCalories ? <CaloriesTab target={target} onGo={go} /> : null}
      <FoodSettingsDialog open={settings} onOpenChange={setSettings} />
    </div>
  );
}
