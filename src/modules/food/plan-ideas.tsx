// Meal ideas from what's in the fridge, freezer and cupboard: recipes with the most ingredients already in.
import { Lightbulb } from "lucide-react";
import { useMemo } from "react";

import { Empty } from "@/modules/calendar/ui";

import type { Recipe, StockItem } from "./data";
import { nameKey } from "./ingredients";

/** does a stock item cover a recipe ingredient? ("chicken" covers "chicken breasts", "chopped tomatoes" covers "tomatoes") */
function covers(stockKey: string, ingKey: string): boolean {
  if (stockKey.length < 3 || ingKey.length < 3) return false;
  return ingKey.includes(stockKey) || stockKey.includes(ingKey);
}

export function ideasFrom(recipes: Recipe[], stock: StockItem[]) {
  const keys = stock.map((s) => nameKey(s.name)).filter(Boolean);
  if (!keys.length) return [];
  return recipes
    .map((r) => {
      const ings = r.ingredients.filter((i) => i.name);
      const have = ings.filter((i) => keys.some((k) => covers(k, nameKey(i.name))));
      return { recipe: r, have: have.length, total: ings.length };
    })
    .filter((x) => x.have > 0)
    .sort((a, b) => b.have / Math.max(1, b.total) - a.have / Math.max(1, a.total) || b.have - a.have)
    .slice(0, 12);
}

export function MealIdeas({ recipes, stock, onPick, hideTitle }: { recipes: Recipe[]; stock: StockItem[]; onPick: (r: Recipe) => void; hideTitle?: boolean }) {
  const ideas = useMemo(() => ideasFrom(recipes, stock), [recipes, stock]);
  return (
    <div className="space-y-3">
      {!hideTitle ? <h3 className="flex items-center gap-2 text-sm font-bold"><Lightbulb className="size-4" /> Ideas from what you have</h3> : null}
      {ideas.length ? (
        <ul className="space-y-2">
          {ideas.map((x) => (
            <li key={x.recipe.id}>
              <button type="button" onClick={() => onPick(x.recipe)} className="glass-tile flex min-h-12 w-full items-center gap-3 p-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{x.recipe.title}</span>
                  <span className="text-xs text-muted-foreground">You have {x.have} of {x.total} ingredients</span>
                </span>
                <span className="rounded-full bg-[var(--status-green-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--status-green)]">Add</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon={Lightbulb} title="No ideas yet">
          {stock.length ? "None of your recipes use what's in stock. Add more recipes and ideas will show here." : "Add what's in your fridge and freezer, and recipes you can make with it will show here."}
        </Empty>
      )}
      <p className="text-xs text-muted-foreground">Tap a meal to see its details, or an idea to add it to the plan.</p>
    </div>
  );
}
