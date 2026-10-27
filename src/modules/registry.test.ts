import { describe, expect, it } from "vitest";

import { MODULES, groupModules, visibleModules } from "./registry";

describe("module registry", () => {
  it("has the 14 agreed modules with unique keys (Cars folded into Documents)", () => {
    expect(MODULES).toHaveLength(14);
    expect(new Set(MODULES.map((m) => m.key)).size).toBe(14);
  });

  it("hides parent-only modules from children and adults", () => {
    const child = visibleModules("child", new Set()).map((m) => m.key);
    expect(child).not.toContain("money");
    expect(child).not.toContain("documents");
    expect(visibleModules("parent", new Set()).map((m) => m.key)).toContain("money");
  });

  it("hides modules a family switched off, but never the ones that cannot be switched off", () => {
    const keys = visibleModules("parent", new Set(["food", "calendar"])).map((m) => m.key);
    expect(keys).not.toContain("food");
    expect(keys).toContain("calendar");
  });

  it("groups the menu with every-day modules first, then money, kids, home and away", () => {
    expect(groupModules(MODULES).map((g) => g.group)).toEqual(["Every day", "Money", "Kids", "Home", "Away"]);
    expect(groupModules(MODULES)[0].modules.map((m) => m.key)).toEqual(["home", "calendar", "board", "food"]);
  });
});
