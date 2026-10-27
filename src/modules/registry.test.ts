import { describe, expect, it } from "vitest";

import { MODULES, groupModules, visibleModules } from "./registry";

describe("module registry", () => {
  it("has the 15 agreed modules with unique keys", () => {
    expect(MODULES).toHaveLength(15);
    expect(new Set(MODULES.map((m) => m.key)).size).toBe(15);
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

  it("keeps groups in the order of the list", () => {
    expect(groupModules(MODULES).map((g) => g.group)[0]).toBe("Today");
  });
});
