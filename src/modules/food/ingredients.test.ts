import { describe, expect, it } from "vitest";

import { clashes, combine, formatQty, parseIngredient, suggestAllergens } from "./ingredients";

describe("ingredients", () => {
  it("reads common lines", () => {
    expect(parseIngredient("2 tbsp olive oil, chopped")).toEqual({ qty: 2, unit: "tbsp", name: "olive oil", note: "chopped" });
    expect(parseIngredient("200g plain flour")).toMatchObject({ qty: 200, unit: "g", name: "plain flour" });
    expect(parseIngredient("1½ cups milk")).toMatchObject({ qty: 1.5, unit: "cup", name: "milk" });
    expect(parseIngredient("1/2 onion")).toMatchObject({ qty: 0.5, unit: null, name: "onion" });
    expect(parseIngredient("Salt and pepper")).toMatchObject({ qty: null, name: "Salt and pepper" });
    expect(parseIngredient("2-3 cloves of garlic")).toMatchObject({ qty: 2, unit: "clove", name: "garlic" });
  });
  it("combines matching items", () => {
    const c = combine([{ qty: 2, unit: null, name: "onions" }, { qty: 1, unit: null, name: "Onion" }, { qty: 500, unit: "g", name: "mince" }, { qty: 1, unit: "kg", name: "mince" }]);
    expect(c.find((x) => x.name.toLowerCase().startsWith("onion"))?.qty).toBe(3);
    expect(c.find((x) => x.name === "mince")).toMatchObject({ qty: 1.5, unit: "kg" });
  });
  it("formats fractions", () => {
    expect(formatQty(0.5)).toBe("½");
    expect(formatQty(2.25)).toBe("2¼");
    expect(formatQty(3)).toBe("3");
  });
  it("suggests allergens and warns of clashes", () => {
    const ings = [parseIngredient("100g almonds"), parseIngredient("2 eggs")];
    expect(suggestAllergens(ings)).toEqual(expect.arrayContaining(["nuts", "eggs"]));
    expect(clashes(["nuts"], [], ings)).toEqual(["nuts"]);
    expect(clashes(["mushrooms"], [], [parseIngredient("200g mushrooms")])).toEqual(["mushrooms"]);
    expect(clashes(["peanuts"], [], ings)).toEqual([]);
  });
});
